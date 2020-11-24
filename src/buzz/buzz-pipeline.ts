import { Fn, Stack, SecretValue, RemovalPolicy } from '@aws-cdk/core'
import { BuildSpec, BuildEnvironmentVariableType, PipelineProject, LinuxBuildImage } from '@aws-cdk/aws-codebuild'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { BucketEncryption } from '@aws-cdk/aws-s3'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { SlackApproval, PipelineNotifications } from '@ndlib/ndlib-cdk'
import { ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions'
import { Topic } from '@aws-cdk/aws-sns'
import { CDKPipelineDeploy } from '../cdk-pipeline-deploy'
import { CDKPipelineMigrate } from '../cdk-pipeline-migrate'
import { NamespacedPolicy, GlobalActions } from '../namespaced-policy'
import cdk = require('@aws-cdk/core')
import codepipeline = require('@aws-cdk/aws-codepipeline')
import codepipelineActions = require('@aws-cdk/aws-codepipeline-actions')
import s3 = require('@aws-cdk/aws-s3')
import { CustomEnvironment } from '../custom-environment'
import { FoundationStack } from '../foundation-stack'

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
  readonly dockerCredentialsPath: string;
  readonly networkStackName: string;
  readonly domainStackName: string;
  readonly owner: string;
  readonly contact: string;
  readonly createDns: boolean;
  readonly slackNotifyStackName?: string;
  readonly notificationReceivers?: string;
  readonly foundationStack: FoundationStack
}

// Adds permissions required to deploy this service
const addPermissions = (deploy: CDKPipelineDeploy, namespace: string) => {
  deploy.project.addToRolePolicy(NamespacedPolicy.globals([
    GlobalActions.ECR,
    GlobalActions.ECS,
    GlobalActions.EC2,
    GlobalActions.ALB,
    GlobalActions.AutoScaling,
  ]))
  deploy.project.addToRolePolicy(NamespacedPolicy.securityGroups())
  deploy.project.addToRolePolicy(NamespacedPolicy.ssm(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.iamRole(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.logs(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.ecs(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.events(namespace))
  deploy.project.addToRolePolicy(NamespacedPolicy.lambda(namespace))
  deploy.project.addToRolePolicy(new PolicyStatement({
    resources: [Fn.sub('arn:aws:iam::${AWS::AccountId}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService')],
    actions: ['iam:PassRole'],
  }))
  // Allow it to deploy alb things. The identifiers used for these are way too long so it truncates the prefix.
  // Have to just use a constant prefix regardless of whether its test or prod stack name.
  deploy.project.addToRolePolicy(new PolicyStatement({
    resources: [
      Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:targetgroup/dec-*/*'),
      Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:loadbalancer/app/dec-*/*'),
      Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener/app/dec-*/*'),
      Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener-rule/app/dec-*/*'),
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

export class BuzzPipelineStack extends Stack {
  constructor (scope: cdk.Construct, id: string, props: CDPipelineStackProps) {
    super(scope, id, props)

    const artifactBucket = new s3.Bucket(this, 'artifactBucket', {
      encryption: BucketEncryption.KMS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    // Source Actions
    const appSourceArtifact = new codepipeline.Artifact('AppCode')
    const appSourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'AppCode',
      branch: props.appSourceBranch,
      oauthToken: SecretValue.secretsManager(props.env.oauthTokenPath, { jsonField: 'oauth' }),
      output: appSourceArtifact,
      owner: props.appRepoOwner,
      repo: props.appRepoName,
    })
    const infraSourceArtifact = new codepipeline.Artifact('InfraCode')
    const infraSourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'InfraCode',
      branch: props.infraSourceBranch,
      oauthToken: SecretValue.secretsManager(props.env.oauthTokenPath, { jsonField: 'oauth' }),
      output: infraSourceArtifact,
      owner: props.infraRepoOwner,
      repo: props.infraRepoName,
    })

    //Global variables for pipeline
    const dockerCredentials = Secret.fromSecretNameV2(this, 'dockerCredentials', props.dockerCredentialsPath)

    //Global variables for test space
    const testNamespace = `${props.namespace}-test`
    const testSsmPrefix = `dec-test-buzz`

    // Database Migration Test
    const migrateTest = new CDKPipelineMigrate(this, `${props.namespace}-MigrateTest`,{
        contextEnvName: props.env.name,
        namespace: testNamespace,
        dockerCredentialsPath: props.dockerCredentialsPath,
        appSourceArtifact,
        ssmPrefix: testSsmPrefix,
        foundationStack:  props.foundationStack,
    })

    migrateTest.project.addToRolePolicy(new PolicyStatement({
            actions: [
              'ssm:GetParameter',
              'ssm:GetParameters',
            ],
            resources: [
              cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/${testSsmPrefix}/*`),
            ],
          }))
    
    // CDK Deploy Test
    const resolvedDomain = Fn.importValue(`${props.env.domainStackName}:DomainName`)
    const testHostnamePrefix = 'buzz-test'
    const testHost = `${testHostnamePrefix}.${resolvedDomain}`
    const deployTest = new CDKPipelineDeploy(this, `${props.namespace}-DeployTest`, {
      contextEnvName: props.env.name, 
      targetStack: `${testNamespace}-buzz`,
      dockerCredentialsPath: props.dockerCredentialsPath,
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
        "buzz:hostnamePrefix": testHostnamePrefix,
        "buzz:appDirectory": '$CODEBUILD_SRC_DIR_AppCode',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
    })
    addPermissions(deployTest, testNamespace)

    const smokeTestsProject = new PipelineProject(this, `${props.namespace}-SmokeTests`, {
      buildSpec: BuildSpec.fromObject({
        phases: {
          build: {
            commands: [
              `newman run spec/postman/spec.json --env-var app-host=${testHost} --env-var host-protocol=https` ,
            ],
          },
        },
        version: '0.2',
      }),
      environment: {
        buildImage: LinuxBuildImage.fromDockerRegistry('postman/newman',{
            secretsManagerCredentials: dockerCredentials,
        }),
      },
    })
    const smokeTestsAction = new codepipelineActions.CodeBuildAction({
      input: appSourceArtifact,
      project: smokeTestsProject,
      actionName: 'SmokeTests',
      runOrder: 98,
    })

    //Global variables for test space
    const prodNamespace = `${props.namespace}-prod`
    const prodSsmPrefix = `dec-prod-buzz`


    // Database Migration Test
    const migrateProd = new CDKPipelineMigrate(this, `${props.namespace}-MigrateProd`,{
        contextEnvName: props.env.name,
        namespace: prodNamespace,
        dockerCredentialsPath: props.dockerCredentialsPath,
        appSourceArtifact,
        ssmPrefix: prodSsmPrefix,
        foundationStack:  props.foundationStack,
    })

    migrateProd.project.addToRolePolicy(new PolicyStatement({
            actions: [
              'ssm:GetParameter',
              'ssm:GetParameters',
            ],
            resources: [
              cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/${prodSsmPrefix}/*`),
            ],
          }))
    
    // CDK Deploy Prod
    const prodHostnamePrefix = 'buzz'
    const prodHost = `${prodHostnamePrefix}.${resolvedDomain}`
    const deployProd = new CDKPipelineDeploy(this, `${props.namespace}-DeployProd`, {
      contextEnvName: props.env.name,
      targetStack: `${prodNamespace}-buzz`,
      dependsOnStacks: [],
      dockerCredentialsPath: props.dockerCredentialsPath,
      infraSourceArtifact,
      appSourceArtifact,
      namespace: prodNamespace,
      additionalContext: {
        owner: props.owner,
        contact: props.contact,
        networkStack: props.networkStackName,
        domainStack: props.domainStackName,
        createDns: props.createDns ? 'true' : 'false',
        "buzz:hostnamePrefix": prodHostnamePrefix,
        "buzz:appDirectory": '$CODEBUILD_SRC_DIR_AppCode',
        infraDirectory: '$CODEBUILD_SRC_DIR',
      },
    })
    addPermissions(deployProd, prodNamespace)

    // Approval
    const appRepoUrl = `https://github.com/${props.appRepoOwner}/${props.appRepoName}`
    const approvalTopic = new Topic(this, 'ApprovalTopic')
    const approvalAction = new ManualApprovalAction({
      actionName: 'Approval',
      additionalInformation: `A new version of ${appRepoUrl} has been deployed to https://${testHost} and is awaiting your approval. If you approve these changes, they will be deployed to stack https://${prodHost}.\n\n*Commit Message*\n${appSourceAction.variables.commitMessage}\n\nFor more details on the changes, see ${appRepoUrl}/commit/${appSourceAction.variables.commitId}.`,
      notificationTopic: approvalTopic,
      runOrder: 99, // This should always be the last action in the stage
    })
    // if (props.slackNotifyStackName !== undefined) {
    //   const slackApproval = new SlackApproval(this, 'SlackApproval', {
    //     approvalTopic,
    //     notifyStackName: props.slackNotifyStackName,
    //   })
    // }

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'DeploymentPipeline', {
      artifactBucket,
      stages: [
        {
          actions: [appSourceAction, infraSourceAction],
          stageName: 'Source',
        },
        {
          actions: [ migrateTest.action, deployTest.action, smokeTestsAction /* ,approvalAction*/ ],
          stageName: 'Test',
        },
        {
          actions: [ migrateProd.action, deployProd.action],
          stageName: 'Production',
        },
      ],
    })

    deployTest.project.addToRolePolicy(new PolicyStatement({
        actions: [
          'ssm:GetParameter',
        ],
        resources: [
          cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/buzz/sg_database_connect`),
        ],
      }))

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

    deployProd.project.addToRolePolicy(new PolicyStatement({
        actions: [
          'ssm:GetParameter',
        ],
        resources: [
          cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/buzz/sg_database_connect`),
        ],
      }))

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

    if (props.notificationReceivers) {
      const notifications = new PipelineNotifications(this, 'PipelineNotifications', {
        pipeline,
        receivers: props.notificationReceivers,
      })
    }
  }
}
