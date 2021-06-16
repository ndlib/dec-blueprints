import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { Topic } from '@aws-cdk/aws-sns'
import { CdkDeploy } from '../pipeline-constructs/cdk-deploy'
import { NamespacedPolicy, GlobalActions } from '../namespaced-policy'
import { FoundationStack } from '../foundation-stack'
import { CustomEnvironment } from '../custom-environment'
import { SlackApproval } from '@ndlib/ndlib-cdk'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { GitHubSource } from '../pipeline-constructs/github-source'
import { PipelineHostnames } from '../pipeline-constructs/hostnames'
import codebuild = require('@aws-cdk/aws-codebuild')
import codepipeline = require('@aws-cdk/aws-codepipeline')
import codepipelineActions = require('@aws-cdk/aws-codepipeline-actions')
import cdk = require('@aws-cdk/core')

export interface CDPipelineStackProps extends cdk.StackProps {
  readonly env: CustomEnvironment;
  readonly appRepoOwner: string;
  readonly appRepoName: string;
  readonly appSourceBranch: string;
  readonly infraRepoOwner: string;
  readonly infraRepoName: string;
  readonly infraSourceBranch: string;
  readonly namespace: string;
  readonly qaSpecPath: string;
  readonly oauthTokenPath: string;
  readonly honeycombHostnames: PipelineHostnames;
  readonly dockerhubCredentialsPath: string;
  readonly owner: string;
  readonly contact: string;
  readonly slackNotifyStackName: string;
  readonly prodFoundationStack: FoundationStack;
  readonly testFoundationStack: FoundationStack;
  readonly hostnames: PipelineHostnames

}

const addPermissions = (deploy: CdkDeploy, namespace: string) => {
  deploy.project.addToRolePolicy(NamespacedPolicy.s3(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.ssm(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.iamRole(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.logs(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.lambda(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.globals([
    GlobalActions.Cloudfront,
    GlobalActions.Route53,
  ]))
  deploy.project.addToRolePolicy(new PolicyStatement({
    actions: [
      'lambda:PublishLayerVersion',
      'lambda:DeleteLayerVersion',
      'lambda:GetLayerVersion',
    ],
    resources: [
      '*',
    ],
  }))
}

export class BeehivePipelineStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props: CDPipelineStackProps) {
    super(scope, id, props)

    const repoUrl = `https://github.com/${props.appRepoOwner}/${props.appRepoName}`

    const artifactBucket = new Bucket(this, 'artifactBucket', {
      encryption: BucketEncryption.KMS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Source Actions
    const appSource = new GitHubSource(this, 'AppCode', {
      branch: props.appSourceBranch,
      oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      owner: props.appRepoOwner,
      repo: props.appRepoName,
    })
    const infraSource = new GitHubSource(this, 'InfraCode', {
      branch: props.infraSourceBranch,
      oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      owner: props.infraRepoOwner,
      repo: props.infraRepoName,
    })

    // Global variables for pipeline
    const dockerCredentials = Secret.fromSecretNameV2(this, 'dockerCredentials', props.dockerhubCredentialsPath)

    // Global variables for test space
    const testNamespace = `${props.namespace}-test`

    // Deploy Test actions
    const deployTest = new CdkDeploy(this, `${props.namespace}-DeployTest`, {
      contextEnvName: props.env.name,
      targetStack: `${testNamespace}-beehive`,
      dockerCredentials,
      dependsOnStacks: [],
      infraSource,
      appSource,
      appBuildCommands: [
        'npm install -g yarn',
        'yarn install',
        'yarn build',
      ],
      namespace: testNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.env.networkStackName,
        domainStack: props.env.domainStackName,
        createDns: props.env.createDns ? 'true' : 'false',
        'beehive:hostnamePrefix': props.hostnames.testHostnamePrefix,
        'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
      additionalEnvironmentVariables: {
        PUBLIC_URL: { value: `https://${props.hostnames.testHostname}` },
        HONEYCOMB_URL: { value: `https://${props.honeycombHostnames.testHostname}` },
      },
    })

    addPermissions(deployTest, testNamespace)

    if (props.testFoundationStack.hostedZone) {
      deployTest.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(props.testFoundationStack.hostedZone.hostedZoneId))
    }

    // Smoke Tests Action
    const smokeTestsProject = new codebuild.PipelineProject(this, 'StaticHostSmokeTestsTest', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `chmod -R 755 ${props.qaSpecPath}`,
              `newman run ${props.qaSpecPath} --env-var SiteURL=${props.hostnames.testHostname}`,
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('postman/newman:5', {
          secretsManagerCredentials: dockerCredentials,
        }),
      },
    })

    const smokeTestsAction = new codepipelineActions.CodeBuildAction({
      input: appSource.artifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    })

    // Approval
    const appRepoUrl = `https://github.com/${props.appRepoOwner}/${props.appRepoName}`
    const infraRepoUrl = `https://github.com/${props.infraRepoOwner}/${props.infraRepoName}`
    const approvalTopic = new Topic(this, 'ApprovalTopic')
    const approvalAction = new codepipelineActions.ManualApprovalAction({
      actionName: 'Approval',
      additionalInformation: `A new version of ${appRepoUrl} has been deployed to https://${props.hostnames.testHostname} and is awaiting your approval. If you approve these changes, they will be deployed to https://${props.hostnames.prodHostname}.\n\n*Application Changes:*\n${appSource.variables.commitMessage}\n\nFor more details on the changes, see ${appRepoUrl}/commit/${appSource.variables.commitId}.\n\n*Infrastructure Changes:*\n${infraSource.variables.commitMessage}\n\nFor more details on the changes, see ${infraRepoUrl}/commit/${infraSource.variables.commitId}.`,
      notificationTopic: approvalTopic,
      runOrder: 99, // This should always be the last action in the stage
    })
    if (props.env.slackNotifyStackName !== undefined) {
      const slackApproval = new SlackApproval(this, 'SlackApproval', {
        approvalTopic,
        notifyStackName: props.env.slackNotifyStackName,
      })
    }

    // Deploy Production Actions

    // Global variables for production space
    const prodNamespace = `${props.namespace}-prod`

    // Deploy Prod actions
    const deployProd = new CdkDeploy(this, `${props.namespace}-DeployProd`, {
      contextEnvName: props.env.name,
      targetStack: `${prodNamespace}-beehive`,
      dockerCredentials,
      dependsOnStacks: [],
      infraSource,
      appSource,
      appBuildCommands: [
        'npm install -g yarn',
        'yarn install',
        'yarn build',
      ],
      namespace: prodNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.env.networkStackName,
        domainStack: props.env.domainStackName,
        createDns: props.env.createDns ? 'true' : 'false',
        'beehive:hostnamePrefix': props.hostnames.prodHostnamePrefix,
        'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
      additionalEnvironmentVariables: {
        PUBLIC_URL: { value: `https://${props.hostnames.prodHostname}` },
        HONEYCOMB_URL: { value: `https://${props.honeycombHostnames.prodHostname}` },
      },
    })
    addPermissions(deployProd, prodNamespace)

    if (props.prodFoundationStack.hostedZone) {
      deployProd.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(props.prodFoundationStack.hostedZone.hostedZoneId))
    }

    // Smoke Tests Action
    const smokeTestsProdProject = new codebuild.PipelineProject(this, 'StaticHostSmokeTestsProd', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `chmod -R 755 ${props.qaSpecPath}`,
              `newman run ${props.qaSpecPath} --env-var SiteURL=${props.hostnames.prodHostname}`,
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('postman/newman:5', {
          secretsManagerCredentials: dockerCredentials,
        }),
      },
    })

    const smokeTestsProdAction = new codepipelineActions.CodeBuildAction({
      input: appSource.artifact,
      project: smokeTestsProdProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    })

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'DeploymentPipeline', {
      artifactBucket,
      stages: [
        {
          actions: [appSource.action, infraSource.action],
          stageName: 'Source',
        },
        {
          actions: [deployTest.action, smokeTestsAction, approvalAction],
          stageName: 'Test',
        },
        {
          actions: [deployProd.action, smokeTestsProdAction],
          stageName: 'Production',
        },
      ],
    })
  }
}
