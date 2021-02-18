import * as cdk from '@aws-cdk/core'
import { FargateTaskDefinition, FargatePlatformVersion } from '@aws-cdk/aws-ecs'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { SharedServiceStackProps } from './shared-stack-props'
import { FoundationStack } from './foundation-stack'
import { CustomEnvironment } from './custom-environment'
import { Port, SubnetType } from '@aws-cdk/aws-ec2'
import { AssetHelpers } from './asset-helpers'
import { ECSSecretsHelper } from './ecs-secrets-helpers'
import { FileSystem, LifecyclePolicy } from '@aws-cdk/aws-efs'
import { RemovalPolicy } from '@aws-cdk/core'
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2')
import ecs = require('@aws-cdk/aws-ecs')
import ssm = require('@aws-cdk/aws-ssm')

export interface HoneypotStackProps extends SharedServiceStackProps {
  readonly hostnamePrefix: string,
  readonly env: CustomEnvironment
  readonly appDirectory: string
}
export class HoneypotStack extends cdk.Stack {
  public readonly hostname: string

  constructor (scope: cdk.Construct, id: string, props: HoneypotStackProps) {
    super(scope, id, props)

    const railsEfsVolumeName = 'rails'
    const fileSystem = new FileSystem(this, 'FileSystem', {
      vpc: props.foundationStack.vpc,
      lifecyclePolicy: LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
      encrypted: true,
    })

    // ECS Service
    const appTask = new FargateTaskDefinition(this, 'AppTaskDefinition', {
      cpu: 2048,
      memoryLimitMiB: 4096,
    })
    appTask.addVolume({
      name: railsEfsVolumeName,
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
      },
    })
    const logging = ecs.AwsLogDriver.awsLogs({
      logGroup: props.foundationStack.logs,
      streamPrefix: `${this.stackName}-Task`,
    })

    // Add Container
    const containerImage = AssetHelpers.containerFromDockerfile(this, 'DockerImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile',
    })

    const container = appTask.addContainer('railsContainer', {
      image: containerImage,
      command: ['bash', '/usr/bin/docker-entrypoint.sh'],
      essential: true,
      logging,
      secrets: {
        SECRET_KEY_BASE: ECSSecretsHelper.fromSSM(this, 'HoneypotService', 'secret_key_base'),
      },
      environment: {
        RAILS_ENV: 'production',
        RAILS_LOG_TO_STDOUT: 'true',
      },
    })
    container.addPortMappings({
      containerPort: 3019,
    })
    // Mount efs in the directory that rails is going to put it's generated images
    container.addMountPoints({
      readOnly: false,
      sourceVolume: railsEfsVolumeName,
      containerPath: '/honeypot/public/images',
    })

    const iipImage = AssetHelpers.containerFromDockerfile(this, 'IIPImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile.iip',
    })
    const iipContainer = appTask.addContainer('iipContainer', {
      image: iipImage,
      essential: true,
      logging,
      environment: {
        VERBOSITY: '5',
        LOGFILE: '/dev/stdout',
        MAX_IMAGE_CACHE_SIZE: '10',
        JPEG_QUALITY: '50',
        MAX_CVT: '3000',
        MEMCACHED_SERVERS: 'localhost',
        FILESYSTEM_PREFIX: '/mnt/efs', // Relies on the request uri having /images and that there's a subdir /mnt/efs/images
        CORS: '*',
      },
    })
    // Get rendered (static) images from EFS
    iipContainer.addMountPoints({
      readOnly: true,
      sourceVolume: railsEfsVolumeName,
      containerPath: '/mnt/efs/images',
    })

    const nginxImage = AssetHelpers.containerFromDockerfile(this, 'NginxImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile.nginx',
    })
    const nginxContainer = appTask.addContainer('nginxContainer', {
      image: nginxImage,
      essential: true,
      command: ['bash', 'project_root/nginx_entry.sh'],
      logging,
      environment: {
        RAILS_HOST: '127.0.0.1',
        RAILS_PORT: '3019',
        RAILS_STATIC_DIR: '/honeypot/public', // We're going to mount this from the rails container to get static assets
        IIP_HOST: '127.0.0.1',
        IIP_PORT: '9000',
      },
    })
    nginxContainer.addPortMappings({
      containerPort: 80,
    })
    // Get static assets from the Rails container
    nginxContainer.addVolumesFrom({
      readOnly: true,
      sourceContainer: 'railsContainer',
    })
    // Get rendered (static) images from EFS
    nginxContainer.addMountPoints({
      readOnly: true,
      sourceVolume: railsEfsVolumeName,
      containerPath: '/mnt/efs/images', // Mount the efs to the images dir so that requests to /images/* get served from the generated images
    })

    // Define default container for the task before adding the service to the targetGroup,
    // otherwise CDK will try to create SecurityGroups for all ports on all containers
    appTask.defaultContainer = nginxContainer

    const appService = new ecs.FargateService(this, 'AppService', {
      platformVersion: FargatePlatformVersion.VERSION1_4,
      taskDefinition: appTask,
      cluster: props.foundationStack.cluster,
      vpcSubnets: { subnetType: SubnetType.PRIVATE },
      desiredCount: 1,
    })

    appService.connections.allowFrom(fileSystem, Port.tcp(2049))
    appService.connections.allowTo(fileSystem, Port.tcp(2049))

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      healthCheck: {
        path: '/health',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
        port: '80',
      },
      deregistrationDelay: cdk.Duration.seconds(60),
      targetType: elbv2.TargetType.IP,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: props.foundationStack.vpc,
      targets: [appService],
    })

    const domainNameImport = cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`)
    this.hostname = `${props.hostnamePrefix}.${domainNameImport}`
    const elbv2Applistener = new elbv2.ApplicationListenerRule(this, 'ECSServiceRule2', {
      targetGroups: [targetGroup],
      pathPattern: '*',
      hostHeader: this.hostname,
      listener: props.foundationStack.publicLoadBalancer.defaultListener,
      priority: 2,
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
