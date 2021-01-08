import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions'
import { Topic } from '@aws-cdk/aws-sns'
import { CfnOutput, Fn, Stack } from '@aws-cdk/core'
import { CDKPipelineDeploy } from '../cdk-pipeline-deploy'
import { NamespacedPolicy, GlobalActions } from '../namespaced-policy'
import { FoundationStack } from '../foundation-stack'
import { CustomEnvironment } from '../custom-environment'
import { PipelineNotifications } from '@ndlib/ndlib-cdk'
import codebuild = require('@aws-cdk/aws-codebuild')
import codepipeline = require('@aws-cdk/aws-codepipeline')
import codepipelineActions = require('@aws-cdk/aws-codepipeline-actions')
import { PolicyStatement } from '@aws-cdk/aws-iam'
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
  readonly hostnamePrefix: string;
  readonly dockerhubCredentialsPath: string;
  readonly owner: string;
  readonly contact: string;
  readonly slackNotifyStackName: string;
  readonly foundationStack: FoundationStack;
}

const addPermissions = (deploy: CDKPipelineDeploy, namespace: string) => {
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
    ],
    resources: [
      '*'
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
    const appSourceArtifact = new codepipeline.Artifact('AppCode')
    const appSourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'AppCode',
      branch: props.appSourceBranch,
      oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      output: appSourceArtifact,
      owner: props.appRepoOwner,
      repo: props.appRepoName,
    })
    const infraSourceArtifact = new codepipeline.Artifact('InfraCode')
    const infraSourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'InfraCode',
      branch: props.infraSourceBranch,
      oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      output: infraSourceArtifact,
      owner: props.infraRepoOwner,
      repo: props.infraRepoName,
    })

    // Global variables for pipeline
    const dockerhubCredentials = Secret.fromSecretNameV2(this, 'dockerCredentials', props.dockerhubCredentialsPath)

    // Global variables for test space
    const testNamespace = `${props.namespace}-test`
    const testSsmPrefix = 'dec-test-beehive'

    // Test Host variables
    const testHostnamePrefix = `${props.hostnamePrefix}-prep`
    const resolvedDomain = Fn.importValue(`${props.env.domainStackName}:DomainName`)
    const testURL = `${testHostnamePrefix}-${props.env.name}.${resolvedDomain}`
    // const testHost = `${testHostnamePrefix}.${resolvedDomain}`

    // Production Host variables
    const prodHostnamePrefix = `${props.hostnamePrefix}`
    const resolvedProdDomain = Fn.importValue(`${props.env.domainStackName}:DomainName`)
    const prodURL = `${prodHostnamePrefix}-${props.env.name}.${resolvedDomain}`

    // Deploy Test actions

    const deployTest = new CDKPipelineDeploy(this, `${props.namespace}-DeployTest`, {
      contextEnvName: props.env.name,
      targetStack: `${testNamespace}-beehive`,
      dockerhubCredentialsPath: props.dockerhubCredentialsPath,
      dependsOnStacks: [],
      infraSourceArtifact,
      appSourceArtifact,
      appBuildCommands: [
        'yarn install',
        'yarn run build',
      ],
      namespace: testNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.env.networkStackName,
        domainStack: props.env.domainStackName,
        createDns: props.env.createDns ? 'true' : 'false',
        'beehive:hostnamePrefix': testHostnamePrefix,
        'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
    })

    addPermissions(deployTest, testNamespace)

  
    deployTest.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(props.foundationStack.hostedZone.hostedZoneId))

    // Smoke Tests Action
    const smokeTestsProject = new codebuild.PipelineProject(this, 'StaticHostSmokeTestsTest', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `chmod -R 755 ${props.qaSpecPath}`,
              `newman run ${props.qaSpecPath} --env-var SiteURL=${testURL}`,
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('postman/newman', {
          secretsManagerCredentials: dockerhubCredentials,
        }),
      },
    })

    const smokeTestsAction = new codepipelineActions.CodeBuildAction({
      input: appSourceArtifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    })

    // Approval
    const appRepoUrl = `https://github.com/${props.appRepoOwner}/${props.appRepoName}`
    const approvalTopic = new Topic(this, 'ApprovalTopic')
    const approvalAction = new ManualApprovalAction({
      actionName: 'Approval',
      additionalInformation: `A new version of ${appRepoUrl} has been deployed to https://${testURL} and is awaiting your approval. If you approve these changes, they will be deployed to stack https://${prodURL}.\n\n*Commit Message*\n${appSourceAction.variables.commitMessage}\n\nFor more details on the changes, see ${appRepoUrl}/commit/${appSourceAction.variables.commitId}.`,
      notificationTopic: approvalTopic,
      runOrder: 99, // This should always be the last action in the stage
    })
    // if (props.slackNotifyStackName !== undefined) {
    //   const slackApproval = new SlackApproval(this, 'SlackApproval', {
    //     approvalTopic,
    //     notifyStackName: props.slackNotifyStackName,
    //   })
    // }

    // Deploy Production Actions

    // Global variables for production space
    const prodNamespace = `${props.namespace}-prod`
    const prodSsmPrefix = 'dec-prod-beehive'

    // Deploy Prod actions

    const deployProd = new CDKPipelineDeploy(this, `${props.namespace}-DeployProd`, {
      contextEnvName: props.env.name,
      targetStack: `${prodNamespace}-beehive`,
      dockerhubCredentialsPath: props.dockerhubCredentialsPath,
      dependsOnStacks: [],
      infraSourceArtifact,
      appSourceArtifact,
      appBuildCommands: [
        'rm package-lock.json',
        'yarn install',
        'yarn run build',
      ],
      namespace: prodNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.env.networkStackName,
        domainStack: props.env.domainStackName,
        createDns: props.env.createDns ? 'true' : 'false',
        'beehive:hostnamePrefix': prodHostnamePrefix,
        'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
    })
    addPermissions(deployProd, prodNamespace)

    deployProd.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(props.foundationStack.hostedZone.hostedZoneId))

    // Smoke Tests Action
    const smokeTestsProdProject = new codebuild.PipelineProject(this, 'StaticHostSmokeTestsProd', {
      buildSpec: codebuild.BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `chmod -R 755 ${props.qaSpecPath}`,
              `newman run ${props.qaSpecPath} --env-var SiteURL=${prodURL}`,
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('postman/newman', {
          secretsManagerCredentials: dockerhubCredentials,
        }),
      },
    })

    const smokeTestsProdAction = new codepipelineActions.CodeBuildAction({
      input: appSourceArtifact,
      project: smokeTestsProdProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    })

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'DeploymentPipeline', {
      artifactBucket,
      stages: [
        {
          actions: [appSourceAction, infraSourceAction],
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
