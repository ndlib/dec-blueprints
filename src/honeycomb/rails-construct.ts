import { Port, ISecurityGroup, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import {
  AwsLogDriver,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
  Secret,
  Cluster,
} from '@aws-cdk/aws-ecs'
import { Bucket } from '@aws-cdk/aws-s3'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { LogGroup } from '@aws-cdk/aws-logs'
import { AssetHelpers } from '../asset-helpers'
import { Construct, Duration, Fn, Stack } from '@aws-cdk/core'
import { AdjustmentType } from '@aws-cdk/aws-applicationautoscaling'
import { FileSystem } from '@aws-cdk/aws-efs'
import { CustomEnvironment } from '../custom-environment'
import { SolrConstruct } from './solr-construct'
import { RabbitMqConstruct } from './rabbitmq-construct'
import { PrivateDnsNamespace } from '@aws-cdk/aws-servicediscovery'
import { HttpsAlb } from '@ndlib/ndlib-cdk'
import { ECSSecretsHelper } from '../ecs-secrets-helpers'
import { HoneypotStack } from '../honeypot/honeypot-stack'
import { BeehiveStack } from '../beehive-stack'
import { BuzzStack } from '../buzz/buzz-stack'
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')

export interface RailsConstructProps {
  /**
   * The environment to deploy to
   */
  readonly env: CustomEnvironment

  /**
   * The directory containing the /docker/Dockerfile.rails file
   */
  readonly appDirectory: string

  /**
   * The Vpc to create the service in
   */
  readonly vpc: Vpc

  /**
   * The LogGroup to add log streams to
   */
  readonly logs: LogGroup

  /**
   * The private namespace to add a solr entry to
   */
  readonly privateNamespace: PrivateDnsNamespace

  /**
   * The cluster to put the service in
   */
  readonly cluster: Cluster

  /**
   * Optionally add this service to the public facing load balancer.
   */
  readonly publicLoadBalancer: HttpsAlb

  /**
   * Hostname to use when adding to the public facing load balancer and dns
   */
  readonly hostnamePrefix: string

  /**
   * EFS file system to add original image uploads to
   */
  readonly fileSystem: FileSystem

  /**
   * Security group to put the application into
   */
  readonly appSecurityGroup: SecurityGroup

  /**
   * Reference to the Solr instance that Rails should use
   */
  readonly solr: SolrConstruct

  /**
   * Reference to the RabbitMq instance that Rails should use
   */
  readonly rabbitMq: RabbitMqConstruct

  readonly honeypot: HoneypotStack
  readonly beehive: BeehiveStack
  readonly buzz: BuzzStack
  readonly mediaBucket: Bucket
  readonly databaseSecurityGroup: ISecurityGroup
}

export class RailsConstruct extends Construct {
  public readonly hostname: string

  constructor (scope: Construct, id: string, props:RailsConstructProps) {
    super(scope, id)
    const stack = Stack.of(this)
    const stackName = stack.stackName
    const domainNameImport = Fn.importValue(`${props.env.domainStackName}:DomainName`)
    this.hostname = `${props.hostnamePrefix}.${domainNameImport}`

    // Define Security Groups needed for service
    const securityGroups = [
      props.databaseSecurityGroup,
      props.appSecurityGroup,
    ]

    const logging = AwsLogDriver.awsLogs({
      logGroup: props.logs,
      streamPrefix: `${stackName}-ServiceTask`,
    })

    const railsImage = AssetHelpers.containerFromDockerfile(stack, 'RailsImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile.rails',
      buildArgs: { RAILS_ENV: 'production' },
    })

    const railsEnvironment = {
      SOLR_HOST: props.solr.hostname,
      SOLR_PORT: '8983',
      RAILS_ENV: 'production',
      RAILS_LOG_TO_STDOUT: 'true',
      RAILS_LOG_LEVEL: 'DEBUG',
      RAILS_LOG_AUTOFLUSH: 'true',
      RABBIT_HOST: props.rabbitMq.hostname,
      RABBIT_VHOST: '/',
      HONEYCOMB_HOST: this.hostname,
      HONEYPOT_HOST: `https://${props.honeypot.hostname}`,
      BEEHIVE_HOST: `https://${props.beehive.hostname}`,
      BUZZ_HOST: `https://${props.buzz.hostname}`,
      MEDIA_BUCKET_REGION: stack.region,
      MEDIA_BUCKET_NAME: props.mediaBucket.bucketName,
      AWS_PROFILE: '', // Need to blank this out so that it doesn't try to read shared credentials from files
    }
    const railsSecrets = {
      DB_PASSWORD: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/password'),
      DB_HOSTNAME: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/host'),
      DB_USERNAME: ECSSecretsHelper.fromSSM(this, 'RailsService', 'database/username'),
      DB_NAME: ECSSecretsHelper.fromSSM(this, 'RaisService', 'database/database'),
      OKTA_CLIENT_ID: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/okta/client_id'),
      OKTA_CLIENT_SECRET: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/okta/client_secret'),
      OKTA_LOGOUT_URL: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/okta/logout_url'),
      OKTA_REDIRECT_URL: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/okta/redirect_url'),
      OKTA_BASE_URL: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/okta/base_auth_url'),
      OKTA_AUTH_ID: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/okta/auth_server_id'),
      SECRET_KEY_BASE: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/secret_key_base'),
      GOOGLE_CLIENT_ID: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/google/client_id'),
      GOOGLE_CLIENT_SECRET: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/google/client_secret'),
      GOOGLE_DEVELOPER_KEY: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/google/developer_key'),
      GOOGLE_APP_ID: ECSSecretsHelper.fromSSM(this, 'RailsService', 'secrets/google/app_id'),
      RABBIT_LOGIN: Secret.fromSecretsManager(props.rabbitMq.secret, 'login'),
      RABBIT_PASSWORD: Secret.fromSecretsManager(props.rabbitMq.secret, 'password'),
    }
    const railsEfsVolumeName = 'rails'

    // Create a task definition with more resources that can be run in an adhoc, short
    // lived manner. Also sets log level higher to get additional output
    const rakeTaskDefinition = new FargateTaskDefinition(this, 'RakeTaskDefinition', {
      memoryLimitMiB: 2048,
    })
    // Give nfs access and mount the efs
    props.appSecurityGroup.connections.allowFrom(props.fileSystem, Port.tcp(2049))
    props.appSecurityGroup.connections.allowTo(props.fileSystem, Port.tcp(2049))
    rakeTaskDefinition.addVolume({
      name: railsEfsVolumeName,
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
      },
    })
    const rakeContainer = rakeTaskDefinition.addContainer('railsContainer', {
      image: railsImage,
      essential: true,
      logging: AwsLogDriver.awsLogs({
        logGroup: props.logs,
        streamPrefix: `${stackName}-RakeTask`,
      }),
      command: ['bundle', 'exec', 'rake', '-T'],
      environment: {
        ...railsEnvironment,
        RAILS_LOG_LEVEL: 'DEBUG',
        RAILS_LOG_AUTOFLUSH: 'true',
      },
      secrets: railsSecrets,
    })
    rakeContainer.addMountPoints({
      readOnly: false,
      sourceVolume: railsEfsVolumeName,
      containerPath: '/mnt/honeycomb',
    })

    // Rails service task
    const appTaskDefinition = new FargateTaskDefinition(this, 'RailsTaskDefinition')
    appTaskDefinition.addVolume({
      name: railsEfsVolumeName,
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
      },
    })
    const railsContainer = appTaskDefinition.addContainer('railsContainer', {
      image: railsImage,
      essential: true,
      logging,
      command: ['bundle', 'exec', 'rails', 's', '-b', '0.0.0.0'],
      environment: railsEnvironment,
      secrets: railsSecrets,
    })
    railsContainer.addMountPoints({
      readOnly: false,
      sourceVolume: railsEfsVolumeName,
      containerPath: '/mnt/honeycomb',
    })
    props.mediaBucket.grantPut(appTaskDefinition.taskRole)
    const nginxImage = AssetHelpers.containerFromDockerfile(stack, 'NginxImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile.nginx',
    })

    const nginxContainer = appTaskDefinition.addContainer('nginxContainer', {
      image: nginxImage,
      essential: true,
      command: ['bash', 'project_root/nginx_entry.sh'],
      logging,
      environment: {
        RAILS_HOST: '127.0.0.1',
      },
    })
    nginxContainer.addPortMappings({
      containerPort: 80,
    })
    nginxContainer.addVolumesFrom({
      readOnly: true,
      sourceContainer: 'railsContainer',
    })

    // Define default container for the task before adding the service to the targetGroup,
    // otherwise CDK will try to create SecurityGroups for all ports on all containers
    appTaskDefinition.defaultContainer = nginxContainer
    const appService = new FargateService(this, 'AppService', {
      platformVersion: FargatePlatformVersion.VERSION1_4,
      cluster: props.cluster,
      taskDefinition: appTaskDefinition,
      securityGroups,
      cloudMapOptions: {
        cloudMapNamespace: props.privateNamespace,
        name: 'honeycomb',
      },
    })
    // End Rails service task

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      healthCheck: {
        path: '/',
        protocol: elbv2.Protocol.HTTP,
        interval: Duration.seconds(30),
        timeout: Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
        port: '80',
        healthyHttpCodes: '200,302', // 302 is acceptable for now due to redirect to okta
      },
      deregistrationDelay: Duration.seconds(60),
      targetType: elbv2.TargetType.IP,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: props.vpc,
      targets: [appService],
      // This app uses sessions so need to set stickiness
      stickinessCookieDuration: Duration.minutes(10),
    })
    const albRule = new elbv2.ApplicationListenerRule(this, 'ECSServiceRule3', {
      targetGroups: [targetGroup],
      pathPattern: '*',
      hostHeader: this.hostname,
      listener: props.publicLoadBalancer.defaultListener,
      priority: 3,
    })
    if (props.env.createDns) {
      const cname = new CnameRecord(this, 'ServiceCNAME', {
        recordName: props.hostnamePrefix,
        domainName: props.publicLoadBalancer.loadBalancerDnsName,
        zone: HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
          hostedZoneId: Fn.importValue(`${props.env.domainStackName}:Zone`),
          zoneName: domainNameImport,
        }),
        ttl: Duration.minutes(15),
      })
    }

    // Sneakers service task
    const sneakersTaskDefinition = new FargateTaskDefinition(this, 'SneakersTaskDefinition')
    sneakersTaskDefinition.addVolume({
      name: railsEfsVolumeName,
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
      },
    })
    const sneakersContainer = sneakersTaskDefinition.addContainer('sneakersContainer', {
      image: railsImage,
      essential: true,
      logging,
      command: ['bundle', 'exec', 'rake', 'sneakers:run'],
      environment: railsEnvironment,
      secrets: railsSecrets,
    })
    sneakersContainer.addMountPoints({
      readOnly: false,
      sourceVolume: railsEfsVolumeName,
      containerPath: '/mnt/honeycomb',
    })
    const sneakersService = new FargateService(this, 'SneakersService', {
      platformVersion: FargatePlatformVersion.VERSION1_4,
      cluster: props.cluster,
      taskDefinition: sneakersTaskDefinition,
      securityGroups,
      desiredCount: 1,
    })

    const scalableTarget = sneakersService.autoScaleTaskCount({
      minCapacity: 0,
      maxCapacity: 3,
    })

    // Sneakers (using 512 MiB, 256 Cpu) takes about 2-3 minutes to process 50 images.
    // This step policy aims to clear a queue of up to 150 images within 2-3 minutes.
    // Beyond that, it will take an additional minute for every 50 images over 150.
    // Ex: 1000 images will run 3 tasks, taking approximately 20 minutes to process
    // (assuming this does not max out honeypot's throughput and there are no errors).
    // This is also an on demand service, so it will scale to 0 when not needed.
    scalableTarget.scaleOnMetric('TrackImageJobs', {
      metric: props.rabbitMq.scaleMetric,
      adjustmentType: AdjustmentType.EXACT_CAPACITY,
      scalingSteps: [
        { upper: 0, change: 0 },
        { lower: 1, change: 1 },
        { lower: 51, change: 2 },
        { lower: 101, change: 3 },
      ],
    })
    // End Sneakers service task
  }
}
