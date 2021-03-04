import * as cdk from '@aws-cdk/core'
import {
  AwsLogDriver,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
} from '@aws-cdk/aws-ecs'
import { SecurityGroup, SubnetType } from '@aws-cdk/aws-ec2'
import { ApplicationListenerRule, ApplicationProtocol, ApplicationTargetGroup, Protocol, TargetType } from '@aws-cdk/aws-elasticloadbalancingv2'
import { CustomEnvironment } from '../custom-environment'
import { SharedServiceStackProps } from '../shared-stack-props'
import { AssetHelpers } from '../asset-helpers'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { ECSSecretsHelper } from '../ecs-secrets-helpers'
import { Duration } from '@aws-cdk/core'
import { StringParameter } from '@aws-cdk/aws-ssm'

export interface BuzzStackProps extends SharedServiceStackProps {
  readonly env: CustomEnvironment,
  readonly appDirectory: string
  readonly hostnamePrefix: string
}

export class BuzzStack extends cdk.Stack {
  public readonly hostname: string

  constructor (scope: cdk.Construct, id: string, props: BuzzStackProps) {
    super(scope, id, props)

    const appSecurityGroup = new SecurityGroup(this, 'AppSecurityGroup', {
      vpc: props.foundationStack.vpc,
      allowAllOutbound: true,
    })

    const domainNameImport = cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`)
    this.hostname = `${props.hostnamePrefix}.${domainNameImport}`

    // Define Security Groups needed for service
    const securityGroups = [
      props.foundationStack.databaseSecurityGroup,
      appSecurityGroup,
    ]
    const logging = new AwsLogDriver({
      streamPrefix: `${this.stackName}-Task`,
      logGroup: props.foundationStack.logs,
    })

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
        DEFAULT_URL_HOST: this.hostname,
        DEFAULT_URL_PROTOCOL: 'http',
        WOWZA_HOST: 'wowza.library.nd.edu',
        WOWZA_PORT: '443',
        WOWZA_APPLICATION: 'buzz_wow',
        WOWZA_INSTANCE: '_definst_',
        WOWZA_CACHE_PREFIX: 'amazons3',
        WOWZA_CACHE_SOURCE: props.foundationStack.mediaBucket.bucketName,
      },
      secrets: {
        RAILS_ENV: ECSSecretsHelper.fromSSM(this, 'RailsService', 'rails-env'),
        DB_PORT: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/port'),
        DB_USERNAME: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/username'),
        DB_PASSWORD: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/password'),
        DB_NAME: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/database'),
        DB_HOSTNAME: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/host'),
        RAILS_SECRET_KEY_BASE: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/secret_key_base'),
      },
    })
    rails.addPortMappings({
      containerPort: 80,
    })

    appTaskDefinition.defaultContainer = rails
    const appService = new FargateService(this, 'AppService', {
      platformVersion: FargatePlatformVersion.VERSION1_4,
      taskDefinition: appTaskDefinition,
      cluster: props.foundationStack.cluster,
      vpcSubnets: { subnetType: SubnetType.PRIVATE },
      desiredCount: 1,
      securityGroups,
    })

    const loadBalancerTargetGroup = new ApplicationTargetGroup(this, 'ApplicationTargetGroup', {
      healthCheck: {
        enabled: true,
        path: '/',
        protocol: Protocol.HTTP,
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
        port: '80',
        healthyHttpCodes: '200',
      },
      vpc: props.foundationStack.vpc,
      protocol: ApplicationProtocol.HTTP,
      targets: [appService],
      deregistrationDelay: Duration.seconds(60),
      targetType: TargetType.IP,
      port: 80,
    })

    const buzzRule = new ApplicationListenerRule(this, 'ApplicationListenerRule', {
      listener: props.foundationStack.publicLoadBalancer.defaultListener,
      priority: 1,
      pathPattern: '*',
      hostHeader: this.hostname,
      targetGroups: [loadBalancerTargetGroup],
    })

    if (props.env.createDns) {
      const cnameRecord = new CnameRecord(this, 'ServiceCNAME', {
        recordName: props.hostnamePrefix,
        domainName: props.foundationStack.publicLoadBalancer.loadBalancerDnsName,
        zone: HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
          hostedZoneId: cdk.Fn.importValue(`${props.env.domainStackName}:Zone`),
          zoneName: domainNameImport,
        }),
        ttl: cdk.Duration.minutes(15),
      })
    }
  }
}
