import * as cdk from '@aws-cdk/core'
import {
  AwsLogDriver,
  Cluster,
  FargateService,
  FargateTaskDefinition,
  Secret,
} from '@aws-cdk/aws-ecs'
import { Peer, Port, SecurityGroup, SubnetType } from '@aws-cdk/aws-ec2'
import { ApplicationListenerRule, ApplicationProtocol, ApplicationTargetGroup } from '@aws-cdk/aws-elasticloadbalancingv2'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { CustomEnvironment } from '../custom-environment'
import { SharedServiceStackProps } from '../shared-stack-props'
import { HttpsAlb } from '@ndlib/ndlib-cdk'
import { AssetHelpers } from './asset-helpers'

export interface BuzzStackProps extends SharedServiceStackProps {
  readonly env: CustomEnvironment,
  readonly appDirectory: string
  readonly hostnamePrefix: string
}

export class BuzzStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props: BuzzStackProps) {
    super(scope, id, props)

    const loadBalancer = new HttpsAlb(this, 'loadBalancer', {
      internetFacing: true,
      vpc: props.foundationStack.vpc,
      certificateArns: [props.foundationStack.certificate.certificateArn],
    })

    const databaseConnectSecurityGroupParam = StringParameter.valueFromLookup(this, '/all/buzz/sg_database_connect')
    const connectSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'PostgreSqlSG', databaseConnectSecurityGroupParam)
    const appSecurityGroup = new SecurityGroup(this, 'AppSecurityGroup', {
      vpc: props.foundationStack.vpc,
      allowAllOutbound: true,
    })

    appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'allow all inbound on 80')

    const logging = new AwsLogDriver({
      streamPrefix: `${this.stackName}-Task`,
      logGroup: new LogGroup(this, `${this.stackName}`, {
        retention: RetentionDays.ONE_WEEK,
      }),
    })

    const secretsHelper = (task: string, key: string) => {
      const parameter = StringParameter.fromSecureStringParameterAttributes(this, `${task}${key}`, {
        parameterName: `/all/${this.stackName}/${key}`,
        version: 1, // This doesn't seem to matter in the context of ECS task definitions
      })
      return Secret.fromSsmParameter(parameter)
    }

    const railsDockerImage = AssetHelpers.containerFromDockerfile(this, 'RailsImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile',
    })
    const appTaskDefinition = new FargateTaskDefinition(this, 'RailsTaskDefinition')

    const rails = appTaskDefinition.addContainer('RailsContainer', {
      image: railsDockerImage,
      essential: true,
      logging,
      command: ['bash', 'docker/start_services.sh'],
      environment: {
        PORT: '80',
        AWS_REGION: this.region,
        RAILS_LOG_TO_STDOUT: 'true',
      },
      secrets: {
        RAILS_ENV: secretsHelper('RailsService', 'rails_env'),
        RDS_PORT: secretsHelper('RailsService', 'database/port'),
        RDS_USERNAME: secretsHelper('RailsService', 'database/username'),
        RDS_PASSWORD: secretsHelper('RailsService', 'database/password'),
        RDS_DB_NAME: secretsHelper('RailsService', 'database/database'),
        RDS_HOSTNAME: secretsHelper('RailsService', 'database/host'),
        RAILS_SECRET_KEY_BASE: secretsHelper('RailsService', 'rails-secret-key-base'),
      },
    })

    rails.addPortMappings({
      containerPort: 80,
    })

    appTaskDefinition.defaultContainer = rails

    const appService = new FargateService(this, 'AppService', {
      taskDefinition: appTaskDefinition,
      cluster: new Cluster(this, 'AppCluster', { vpc: props.foundationStack.vpc }),
      vpcSubnets: { subnetType: SubnetType.PRIVATE },
      desiredCount: 1,
      securityGroups: [appSecurityGroup, connectSecurityGroup],
    })

    appTaskDefinition.addToTaskRolePolicy(new PolicyStatement({
      actions: [
        'ssm:*',
      ],
      resources: [
        cdk.Fn.sub(`arn:aws:ssm:${this.region}:${this.account}:parameter/all/${this.stackName}/*`),
      ],
    }))

    const loadBalancerTargetGroup = new ApplicationTargetGroup(this, 'ApplicationTargetGroup', {
      healthCheck: {
        enabled: true,
        path: '/',
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
      },
      vpc: props.foundationStack.vpc,
      protocol: ApplicationProtocol.HTTP,
      targets: [appService],
    })

    new ApplicationListenerRule(this, 'ApplicationListenerRule', { // eslint-disable-line no-new
      listener: loadBalancer.defaultListener,
      priority: 1,
      pathPattern: '*',
      hostHeader: `${props.hostnamePrefix}.` + cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`),
      targetGroups: [loadBalancerTargetGroup],
    })
  }
}
