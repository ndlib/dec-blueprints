import { Construct, Fn, SecretValue, Stack, StackProps } from '@aws-cdk/core'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { CdkDeploy } from '../pipeline-constructs/cdk-deploy'
import { NamespacedPolicy, GlobalActions } from '../namespaced-policy'
import { CustomEnvironment } from '../custom-environment'
import { FoundationStack } from '../foundation-stack'
import { PipelineFoundationStack } from '../pipeline-foundation-stack'
import { RailsPipelineContainerProps, RailsPipeline, RailsPipelineStageProps } from '../pipeline-constructs/rails-pipeline'
import { HoneypotPipelineStack } from '../honeypot/honeypot-pipeline'
import { BuzzPipelineStack } from '../buzz/buzz-pipeline'

export interface CDPipelineStackProps extends StackProps {
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
  readonly honeypotPipelineStack: HoneypotPipelineStack
  readonly buzzPipelineStack: BuzzPipelineStack
  // readonly beehivePipelineStack: BeehivePipelineStack
}

export class HoneycombPipelineStack extends Stack {
  constructor (scope: Construct, id: string, props: CDPipelineStackProps) {
    super(scope, id, props)

    // Adds permissions required to deploy this service
    const addPermissions = (deploy: CdkDeploy, stage: RailsPipelineStageProps) => {
      deploy.project.addToRolePolicy(new PolicyStatement({
        actions: [
          'ecr:DescribeImages',
          'ecr:DescribeRepositories',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
          'ecr:BatchCheckLayerAvailability',
        ],
        resources: [
          Fn.sub('arn:aws:ecr:${AWS::Region}:${AWS::AccountId}:repository/aws-cdk/assets'),
        ],
      }))
      deploy.project.addToRolePolicy(NamespacedPolicy.globals([
        GlobalActions.ECR,
        GlobalActions.ECS,
        GlobalActions.EC2,
        GlobalActions.ALB,
        GlobalActions.AutoScaling,
        GlobalActions.Secrets,
        GlobalActions.EFS,
        GlobalActions.MQ,
        GlobalActions.CloudMap,
      ]))
      deploy.project.addToRolePolicy(NamespacedPolicy.ec2())
      deploy.project.addToRolePolicy(NamespacedPolicy.efs())
      deploy.project.addToRolePolicy(NamespacedPolicy.cloudmap())
      deploy.project.addToRolePolicy(NamespacedPolicy.mq(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.ssm(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.iamRole(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.logs(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.ecs(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.secrets(stage.namespace))
      deploy.project.addToRolePolicy(NamespacedPolicy.cloudwatch(stage.namespace))
      deploy.project.addToRolePolicy(new PolicyStatement({
        resources: [Fn.sub('arn:aws:iam::${AWS::AccountId}:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService')],
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
          Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:targetgroup/' + stage.namespace.substring(0, 5) + '-*/*'),
          Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:loadbalancer/app/' + stage.namespace.substring(0, 5) + '-*/*'),
          Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener/app/' + stage.namespace.substring(0, 5) + '-*/*'),
          Fn.sub('arn:aws:elasticloadbalancing:${AWS::Region}:${AWS::AccountId}:listener-rule/app/' + stage.namespace.substring(0, 5) + '-*/*'),
        ],
        actions: [
          'elasticloadbalancing:*',
        ],
      }))
    }

    const rails: RailsPipelineContainerProps = {
      containerName: 'rails',
      ecrNameContextOverride: 'honeycomb:RailsEcrName',
      ecrTagContextOverride: 'honeycomb:RailsEcrTag',
      dockerfile: 'docker/Dockerfile.rails',
      includeRailsMigration: true,
      buildArgs: { RAILS_ENV: 'production' },
      migrationEnv: { CI: { value: 'true' } },
    }
    const nginx: RailsPipelineContainerProps = {
      containerName: 'nginx',
      ecrNameContextOverride: 'honeycomb:NginxEcrName',
      ecrTagContextOverride: 'honeycomb:NginxEcrTag',
      dockerfile: 'docker/Dockerfile.nginx',
    }
    const solr: RailsPipelineContainerProps = {
      containerName: 'solr',
      ecrNameContextOverride: 'honeycomb:SolrEcrName',
      ecrTagContextOverride: 'honeycomb:SolrEcrTag',
      dockerfile: 'docker/Dockerfile.solr',
    }

    const oauthToken = SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' })
    const ecr = props.pipelineFoundationStack.addEcr('Honeycomb')
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
      containers: [rails, nginx, solr],
      smokeTestPath: 'spec/newman/smoke.json',
      testStage: {
        vpc: props.testFoundationStack.vpc,
        databaseSecurityGroup: props.testFoundationStack.databaseSecurityGroup,
        configPath: `/all/${testNamespace}-honeycomb`,
        namespace: testNamespace,
        stackname: `${testNamespace}-honeycomb`,
        hostname: testHostname,
        onDeployCreated: addPermissions,
        additionalDeployContext: {
          networkStack: props.env.networkStackName,
          domainStack: props.env.domainStackName,
          createDns,
          'honeycomb:hostnamePrefix': testHostnamePrefix,
          'honeycomb:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
          'honeypot:hostnamePrefix': props.honeypotPipelineStack.testHostnamePrefix,
          'buzz:hostnamePrefix': props.buzzPipelineStack.testHostnamePrefix,
          'beehive:hostnamePrefix': 'beehive-test', // TODO: Get this from the beehive pipeline once implemented
        },
      },
      prodStage: {
        vpc: props.prodFoundationStack.vpc,
        databaseSecurityGroup: props.prodFoundationStack.databaseSecurityGroup,
        configPath: `/all/${prodNamespace}-honeycomb`,
        namespace: prodNamespace,
        stackname: `${prodNamespace}-honeycomb`,
        hostname: prodHostname,
        onDeployCreated: addPermissions,
        additionalDeployContext: {
          networkStack: props.env.networkStackName,
          domainStack: props.env.domainStackName,
          createDns,
          'honeycomb:hostnamePrefix': prodHostnamePrefix,
          'honeycomb:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
          'honeypot:hostnamePrefix': props.honeypotPipelineStack.prodHostnamePrefix,
          'buzz:hostnamePrefix': props.buzzPipelineStack.prodHostnamePrefix,
          'beehive:hostnamePrefix': 'beehive', // TODO: Get this from the beehive pipeline once implemented
        },
      },
    })
  }
}
