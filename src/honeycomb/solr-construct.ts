import { Peer, Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import {
  AwsLogDriver,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
  Cluster,
} from '@aws-cdk/aws-ecs'
import { CustomEnvironment } from '../custom-environment'
import { FileSystem } from '@aws-cdk/aws-efs'
import { Annotations, Construct, Duration, Fn, Stack } from '@aws-cdk/core'
import { ApplicationListenerRule, ApplicationProtocol, ApplicationTargetGroup, Protocol } from '@aws-cdk/aws-elasticloadbalancingv2'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { LogGroup } from '@aws-cdk/aws-logs'
import { PrivateDnsNamespace } from '@aws-cdk/aws-servicediscovery'
import { HttpsAlb } from '@ndlib/ndlib-cdk'
import { AssetHelpers } from '../asset-helpers'

export interface SolrConstructProps {
  /**
   * The environment to deploy to
   */
  readonly env: CustomEnvironment

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
   * The directory containing the /docker/Dockerfile.solr file
   */
  readonly appDirectory: string

  /**
   * EFS file system to add solr index data to
   */
  readonly fileSystem: FileSystem

  /**
   * Optionally add this service to the public facing load balancer.
   */
  readonly publicLoadBalancer?: HttpsAlb

  /**
   * Hostname to use when public facing
   */
  readonly hostnamePrefix?: string
}

export class SolrConstruct extends Construct {
  readonly hostname: string

  constructor (scope: Construct, id: string, props: SolrConstructProps) {
    super(scope, id)
    const stackName = Stack.of(this).stackName

    const solrAccessPoint = props.fileSystem.addAccessPoint('solrAccessPoint', {
      path: '/solr',
      createAcl: {
        ownerUid: '8983',
        ownerGid: '8983',
        permissions: '755',
      },
      posixUser: {
        uid: '8983',
        gid: '8983',
      },
    })

    const solrSecurityGroup = new SecurityGroup(this, 'AppSecurityGroup', {
      vpc: props.vpc,
    })

    solrSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8983), 'Connection to Solr')

    const logging = AwsLogDriver.awsLogs({
      logGroup: props.logs,
      streamPrefix: `${stackName}-SolrTask`,
    })

    const solrTaskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: 2048,
    })

    solrTaskDefinition.addVolume({
      name: 'solr-data',
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
        authorizationConfig: {
          accessPointId: solrAccessPoint.accessPointId,
        },
        transitEncryption: 'ENABLED',
      },
    })

    const solrImage = AssetHelpers.getContainerImage(this, 'SolrImageAsset', {
      directory: props.appDirectory,
      file: 'docker/Dockerfile.solr',
      ecrNameContextOverride: 'honeycomb:SolrEcrName',
      ecrTagContextOverride: 'honeycomb:SolrEcrTag',
    })

    const solrContainer = solrTaskDefinition.addContainer('Solr', {
      image: solrImage,
      essential: true,
      logging: logging,
      environment: {
        SOLR_HOME: '/mnt/solr/solr',
      },
    })

    solrContainer.addMountPoints({
      sourceVolume: 'solr-data',
      containerPath: '/mnt/solr',
      readOnly: false,
    })

    solrContainer.addPortMappings({
      containerPort: 8983,
    })

    solrTaskDefinition.defaultContainer = solrContainer

    this.hostname = `solr.${props.privateNamespace.namespaceName}`

    const solrService = new FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: solrTaskDefinition,
      platformVersion: FargatePlatformVersion.VERSION1_4,
      securityGroups: [SecurityGroup.fromSecurityGroupId(this, 'Group', solrSecurityGroup.securityGroupId)],
      cloudMapOptions: {
        cloudMapNamespace: props.privateNamespace,
        name: 'solr',
      },
    })

    solrService.connections.allowFrom(props.fileSystem, Port.tcp(2049))
    solrService.connections.allowTo(props.fileSystem, Port.tcp(2049))

    if (props.publicLoadBalancer !== undefined) {
      if (props.hostnamePrefix === undefined) {
        Annotations.of(this).addError('hostnamePrefix is required when public facing.')
      } else {
        const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
          healthCheck: {
            port: '8983',
            protocol: Protocol.HTTP,
            interval: Duration.seconds(20),
            timeout: Duration.seconds(15),
            unhealthyThresholdCount: 10,
            path: '/solr/#/',
          },
          vpc: props.vpc,
          port: 443,
          protocol: ApplicationProtocol.HTTP,
          targets: [solrService],
        })

        const albRule = new ApplicationListenerRule(this, 'ECSServiceRule2', {
          targetGroups: [targetGroup],
          pathPattern: '*',
          hostHeader: props.hostnamePrefix + '.' + Fn.importValue(`${props.env.domainStackName}:DomainName`),
          listener: props.publicLoadBalancer.defaultListener,
          priority: 1,
        })

        if (props.env.createDns) {
          const cname = new CnameRecord(this, 'ServiceCNAME', {
            recordName: props.hostnamePrefix,
            domainName: props.publicLoadBalancer.loadBalancerDnsName,
            zone: HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
              hostedZoneId: Fn.importValue(`${props.env.domainStackName}:Zone`),
              zoneName: Fn.importValue(`${props.env.domainStackName}:DomainName`),
            }),
            ttl: Duration.minutes(15),
          })
        }
      }
    }
  }
}
