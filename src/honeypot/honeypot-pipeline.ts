import { SecretValue, Stack } from '@aws-cdk/core'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { CdkDeploy } from '../pipeline-constructs/cdk-deploy'
import { NamespacedPolicy, GlobalActions } from '../namespaced-policy'
import { CustomEnvironment } from '../custom-environment'
import { FoundationStack } from '../foundation-stack'
import { PipelineFoundationStack } from '../pipeline-foundation-stack'
import { RailsPipelineContainerProps, RailsPipeline, RailsPipelineStageProps } from '../pipeline-constructs/rails-pipeline'
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

export class HoneypotPipelineStack extends Stack {
  constructor (scope: cdk.Construct, id: string, props: CDPipelineStackProps) {
    super(scope, id, props)

    // Adds permissions required to deploy this service
    const addPermissions = (deploy: CdkDeploy, stage: RailsPipelineStageProps) => {
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
      deploy.project.addToRolePolicy(NamespacedPolicy.ssm(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.iamRole(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.logs(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.ecs(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.events(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.lambda(stage.namespace))
      deploy.project.addToRolePolicy(new PolicyStatement({
        resources: [cdk.Fn.sub('arn:aws:iam::${AWS::AccountId}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService')],
        actions: ['iam:PassRole'],
      }))
      if (stage.stageName === 'Test') {
        deploy.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(props.testFoundationStack.hostedZone.hostedZoneId))
      }
      if (stage.stageName === 'Production') {
        deploy.project.addToRolePolicy(NamespacedPolicy.route53RecordSet(props.prodFoundationStack.hostedZone.hostedZoneId))
      }
      // Allow it to deploy alb things. The identifiers used for these are way too long so it truncates the prefix.
      // Have to just use a constant prefix regardless of whether its test or prod stack name.
      deploy.project.addToRolePolicy(new PolicyStatement({
        resources: [
          cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:targetgroup/' + stage.namespace.substring(0, 5) + '-*/*'),
          cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:loadbalancer/app/' + stage.namespace.substring(0, 5) + '-*/*'),
          cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener/app/' + stage.namespace.substring(0, 5) + '-*/*'),
          cdk.Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener-rule/app/' + stage.namespace.substring(0, 5) + '-*/*'),
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

      deploy.project.addToRolePolicy(new PolicyStatement({
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
    }

    const rails: RailsPipelineContainerProps = {
      containerName: 'rails',
      ecrNameContextOverride: 'honeypot:RailsEcrName',
      ecrTagContextOverride: 'honeypot:RailsEcrTag',
      dockerfile: 'docker/Dockerfile',
      includeRailsMigration: false,
    }

    const oauthToken = SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' })
    const ecr = props.pipelineFoundationStack.addEcr('Honeypot')
    const createDns = props.env.createDns ? 'true' : 'false'

    const testNamespace = `${props.namespace}-test`
    const testHostnamePrefix = `${props.hostnamePrefix}-test`
    const testHostname = `${testHostnamePrefix}.${props.testFoundationStack.hostedZone.zoneName}`

    const prodNamespace = `${props.namespace}-prod`
    const prodHostnamePrefix = props.hostnamePrefix
    const prodHostname = `${prodHostnamePrefix}.${props.prodFoundationStack.hostedZone.zoneName}`

    const pipeline = new RailsPipeline(this, 'DeploymentPipeline', {
      env: props.env,
      appSource: {
        oauthToken,
        branch: props.appSourceBranch,
        owner: props.appRepoOwner,
        repo: props.appRepoName,
      },
      infraSource: {
        oauthToken,
        branch: props.infraSourceBranch,
        owner: props.infraRepoOwner,
        repo: props.infraRepoName,
      },
      namespace: props.namespace,
      dockerhubCredentialsPath: props.dockerhubCredentialsPath,
      owner: props.owner,
      contact: props.contact,
      ecr,
      artifactBucket: props.pipelineFoundationStack.artifactBucket,
      containers: [rails],
      smokeTestPath: 'spec/postman/spec.json',
      testStage: {
        vpc: props.testFoundationStack.vpc,
        databaseSecurityGroup: props.testFoundationStack.databaseSecurityGroup,
        configPath: `/all/${testNamespace}-honeypot`,
        namespace: testNamespace,
        stackname: `${testNamespace}-honeypot`,
        hostname: testHostname,
        onDeployCreated: addPermissions,
        additionalDeployContext: {
          networkStack: props.env.networkStackName,
          domainStack: props.env.domainStackName,
          createDns,
          'honeypot:hostnamePrefix': testHostnamePrefix,
          'honeypot:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
        },
      },
      prodStage: {
        vpc: props.prodFoundationStack.vpc,
        databaseSecurityGroup: props.prodFoundationStack.databaseSecurityGroup,
        configPath: `/all/${prodNamespace}-honeypot`,
        namespace: prodNamespace,
        stackname: `${prodNamespace}-honeypot`,
        hostname: prodHostname,
        onDeployCreated: addPermissions,
        additionalDeployContext: {
          networkStack: props.env.networkStackName,
          domainStack: props.env.domainStackName,
          createDns,
          'honeypot:hostnamePrefix': prodHostnamePrefix,
          'honeypot:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
        },
      },
    })
  }
}
