import { Fn, Stack } from '@aws-cdk/core'
import { BuildSpec, PipelineProject, LinuxBuildImage } from '@aws-cdk/aws-codebuild'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { SlackApproval, PipelineNotifications } from '@ndlib/ndlib-cdk'
import { CodeBuildAction, GitHubSourceAction, ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions'
import { Topic } from '@aws-cdk/aws-sns'
import { Artifact, Pipeline } from '@aws-cdk/aws-codepipeline'
import { CDKPipelineDeploy } from '../cdk-pipeline-deploy'
import { RailsMigration } from '../cdk-pipeline-migrate'
import { NamespacedPolicy, GlobalActions } from '../namespaced-policy'
import { CustomEnvironment } from '../custom-environment'
import { FoundationStack } from '../foundation-stack'
import { DockerhubImage } from '../dockerhub-image'
import { PipelineFoundationStack } from '../pipeline-foundation-stack'
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
  readonly oauthTokenPath: string;
  readonly dockerhubCredentialsPath: string;
  readonly owner: string;
  readonly contact: string;
  readonly pipelineFoundationStack: PipelineFoundationStack
  readonly testFoundationStack: FoundationStack
  readonly prodFoundationStack: FoundationStack
  readonly hostnamePrefix: string
}

// Adds permissions required to deploy this service
const addPermissions = (deploy: CDKPipelineDeploy, namespace: string, foundationStack: FoundationStack) => {
  deploy.project.addToRolePolicy(NamespacedPolicy.globals([
    GlobalActions.ECR,
    GlobalActions.ECS,
    GlobalActions.EC2,
    GlobalActions.ALB,
    GlobalActions.EFS,
    GlobalActions.AutoScaling,
  ]))
  deploy.project.addToRolePolicy(NamespacedPolicy.ec2())
  deploy.project.addToRolePolicy(NamespacedPolicy.efs())
  deploy.project.addToRolePolicy(NamespacedPolicy.ssm(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.iamRole(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.logs(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.ecs(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.events(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.lambda(namespace))
  deploy.project.addToRolePolicy(new PolicyStatement({
    resources: [cdk.Fn.sub('arn:aws:iam::${AWS::AccountId}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService')],
    actions: ['iam:PassRole'],
  }))
  deploy.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(foundationStack.hostedZone.hostedZoneId))
  // Allow it to deploy alb things. The identifiers used for these are way too long so it truncates the prefix.
  // Have to just use a constant prefix regardless of whether its test or prod stack name.
  deploy.project.addToRolePolicy(new PolicyStatement({
    resources: [
      cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:targetgroup/' + namespace.substring(0, 5) + '-*/*'),
      cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:loadbalancer/app/' + namespace.substring(0, 5) + '-*/*'),
      cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener/app/' + namespace.substring(0, 5) + '-*/*'),
      cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener-rule/app/' + namespace.substring(0, 5) + '-*/*'),
    ],
    actions: [
      'elasticloadbalancing:AddTags',
      'elasticloadbalancing:CreateTargetGroup',
      'elasticloadbalancing:ModifyTargetGroup',
      'elasticloadbalancing:ModifyTargetGroupAttributes',
      'elasticloadbalancing:ModifyLoadBalancerAttributes',
      'elasticloadbalancing:DeleteTargetGroup',
      'elasticloadbalancing:CreateLoadBalancer',
      'elasticloadbalancing:DeleteLoadBalancer',
      'elasticloadbalancing:CreateListener',
      'elasticloadbalancing:DeleteListener',
      'elasticloadbalancing:CreateRule',
      'elasticloadbalancing:DeleteRule',
      'elasticloadbalancing:ModifyRule',
    ],
  }))
}

export class HoneypotPipelineStack extends Stack {
  constructor (scope: cdk.Construct, id: string, props: CDPipelineStackProps) {
    super(scope, id, props)

    // Source Actions
    const appSourceArtifact = new Artifact('AppCode')
    const appSourceAction = new GitHubSourceAction({
      actionName: 'AppCode',
      branch: props.appSourceBranch,
      oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      output: appSourceArtifact,
      owner: props.appRepoOwner,
      repo: props.appRepoName,
    })
    const infraSourceArtifact = new Artifact('InfraCode')
    const infraSourceAction = new GitHubSourceAction({
      actionName: 'InfraCode',
      branch: props.infraSourceBranch,
      oauthToken: cdk.SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      output: infraSourceArtifact,
      owner: props.infraRepoOwner,
      repo: props.infraRepoName,
    })

    // Global variables for pipeline
    const dockerCredentials = Secret.fromSecretNameV2(this, 'dockerCredentials', props.dockerhubCredentialsPath)

    // Global variables for test space
    const testNamespace = `${props.namespace}-test`
    const testStackName = `${testNamespace}-honeycomb`

    // CDK Deploy Test
    const testHostnamePrefix = `${props.hostnamePrefix}-test`
    const testHost = `${testHostnamePrefix}.${props.testFoundationStack.hostedZone.zoneName}`
    const deployTest = new CDKPipelineDeploy(this, `${props.namespace}-DeployTest`, {
      contextEnvName: props.env.name,
      targetStack: `${testNamespace}-honeypot`,
      dockerhubCredentialsPath: props.dockerhubCredentialsPath,
      dependsOnStacks: [],
      infraSourceArtifact,
      appSourceArtifact,
      namespace: testNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.env.networkStackName,
        domainStack: props.env.domainStackName,
        createDns: props.env.createDns ? 'true' : 'false',
        'honeypot:hostnamePrefix': testHostnamePrefix,
        'honeypot:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
    })
    addPermissions(deployTest, testNamespace, props.testFoundationStack)

    const smokeTestsProject = new PipelineProject(this, `${props.namespace}-SmokeTests`, {
      buildSpec: BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              'newman run spec/postman/spec.json --env-var app-host=${TARGET_HOST} --env-var host-protocol=https',
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: DockerhubImage.fromNewman(this, 'HoneypotSmokeTestsImage', 'dockerhubCredentialsPath'),
      },
    })
    const smokeTestsAction = new CodeBuildAction({
      input: appSourceArtifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
      environmentVariables: {
        TARGET_HOST: { value: testHost },
      },
    })

    // Global variables for test space
    const prodNamespace = `${props.namespace}-prod`
    const prodStackName = `${prodNamespace}-honeycomb`

    // CDK Deploy Prod
    const prodHostnamePrefix = props.hostnamePrefix
    const prodHost = `${prodHostnamePrefix}.${props.testFoundationStack.hostedZone.zoneName}`
    const deployProd = new CDKPipelineDeploy(this, `${props.namespace}-DeployProd`, {
      contextEnvName: props.env.name,
      targetStack: `${prodNamespace}-honeypot`,
      dependsOnStacks: [],
      dockerhubCredentialsPath: props.dockerhubCredentialsPath,
      infraSourceArtifact,
      appSourceArtifact,
      namespace: prodNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.env.networkStackName,
        domainStack: props.env.domainStackName,
        createDns: props.env.createDns ? 'true' : 'false',
        'honeypot:hostnamePrefix': prodHostnamePrefix,
        'honeypot:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
    })
    addPermissions(deployProd, prodNamespace, props.prodFoundationStack)

    const smokeTestsProd = new CodeBuildAction({
      input: appSourceArtifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
      environmentVariables: {
        TARGET_HOST: { value: prodHost },
      },
    })

    // Approval
    const appRepoUrl = `https://github.com/${props.appRepoOwner}/${props.appRepoName}`
    const approvalTopic = new Topic(this, 'ApprovalTopic')
    const approvalAction = new ManualApprovalAction({
      actionName: 'Approval',
      additionalInformation: `A new version of ${appRepoUrl} has been deployed to https://${testHost} and is awaiting your approval. If you approve these changes, they will be deployed to stack https://${prodHost}.\n\n*Commit Message*\n${appSourceAction.variables.commitMessage}\n\nFor more details on the changes, see ${appRepoUrl}/commit/${appSourceAction.variables.commitId}.`,
      notificationTopic: approvalTopic,
      runOrder: 99, // This should always be the last action in the stage
    })
    if (props.env.slackNotifyStackName !== undefined) {
      const slackApproval = new SlackApproval(this, 'SlackApproval', {
        approvalTopic,
        notifyStackName: props.env.slackNotifyStackName,
      })
    }

    // Pipeline
    const pipeline = new Pipeline(this, 'DeploymentPipeline', {
      artifactBucket: props.pipelineFoundationStack.artifactBucket,
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
          actions: [deployProd.action, smokeTestsProd],
          stageName: 'Production',
        },
      ],
    })

    // deployTest.project.addToRolePolicy(new PolicyStatement({
    //   actions: [
    //     'ssm:GetParameter',
    //   ],
    //   resources: [
    //     cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/honeypot/sg_database_connect`),
    //   ],
    // }))

    deployTest.project.addToRolePolicy(new PolicyStatement({
      actions: [
        'ecr:DescribeImages',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchCheckLayerAvailability',
      ],
      resources: [
        cdk.Fn.sub(`arn:aws:ecr:${this.region}:${this.account}:repository/aws-cdk/assets`),
      ],
    }))

    // deployProd.project.addToRolePolicy(new PolicyStatement({
    //   actions: [
    //     'ssm:GetParameter',
    //   ],
    //   resources: [
    //     cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/honeypot/sg_database_connect`),
    //   ],
    // }))

    deployProd.project.addToRolePolicy(new PolicyStatement({
      actions: [
        'ecr:DescribeImages',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchCheckLayerAvailability',
      ],
      resources: [
        cdk.Fn.sub(`arn:aws:ecr:${this.region}:${this.account}:repository/aws-cdk/assets`),
      ],
    }))

    if (props.env.notificationReceivers) {
      const notifications = new PipelineNotifications(this, 'PipelineNotifications', {
        pipeline,
        receivers: props.env.notificationReceivers,
      })
    }
  }
}
