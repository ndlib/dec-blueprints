import * as cdk from '@aws-cdk/core'
import { Bucket, BucketAccessControl, HttpMethods } from '@aws-cdk/aws-s3'
import { Certificate, ICertificate } from '@aws-cdk/aws-certificatemanager'
import { ISecurityGroup, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53'
import { CustomEnvironment } from './custom-environment'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
import { PrivateDnsNamespace } from '@aws-cdk/aws-servicediscovery'
import { HttpsAlb } from '@ndlib/ndlib-cdk'
import { Cluster } from '@aws-cdk/aws-ecs'

export interface FoundationStackProps extends cdk.StackProps {
  readonly env: CustomEnvironment

  /**
   * The hostname for honeycomb to add as an allowed origin in the media bucket
   */
  readonly honeycombHostnamePrefix: string
}

export class FoundationStack extends cdk.Stack {
  /**
   * The VPC to put all DEC services into
   */
  public readonly vpc: Vpc

  /**
   * Shared log bucket to put logs for the stacks in this project
   */
  public readonly logBucket: Bucket

  /**
   * The wildcard cert to use in all stacks. This will be imported from the specified
   * domain stack.
   */
  public readonly certificate: ICertificate

  /**
   * The Route53 HostedZone. Note: This will be undefined when env.createDns is false
   */
  public readonly hostedZone: IHostedZone | undefined

  /**
   * Shared log group to put logs for the stacks in this project
   */
  public readonly logs: LogGroup

  /**
   * Shared ALB for the project. Note: There are no checks to ensure that your rules
   * do not conflict with other stacks, so make sure to inspect the rules that other
   * stacks are creating.
   */
  public readonly publicLoadBalancer: HttpsAlb

  /**
   * Shared ECS cluster
   */
  public readonly cluster: Cluster

  /**
   * Shared Private DNS Namespace
   */
  public readonly privateNamespace: PrivateDnsNamespace

  /**
   * Media bucket shared between Honeycomb and Buzz for audio/video files
   */
  public readonly mediaBucket: Bucket

  /**
   * The SG that allows connectivity to the DB that will be used by all services
   * in DEC. This DB is managed outside of this infra code.
   */
  public readonly databaseSecurityGroup: ISecurityGroup

  constructor (scope: cdk.Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props)

    // #region Create a VPC prop that can be used by other stacks

    const vpcId = cdk.Fn.importValue(`${props.env.networkStackName}:VPCID`)

    this.vpc = Vpc.fromVpcAttributes(this, 'unpeered-network', {
      vpcId: vpcId,
      availabilityZones: [
        cdk.Fn.select(0, cdk.Fn.getAzs()),
        cdk.Fn.select(1, cdk.Fn.getAzs()),
      ],
      publicSubnetIds: [
        cdk.Fn.importValue(`${props.env.networkStackName}:PublicSubnet1ID`),
        cdk.Fn.importValue(`${props.env.networkStackName}:PublicSubnet2ID`),
      ],
      privateSubnetIds: [
        cdk.Fn.importValue(`${props.env.networkStackName}:PrivateSubnet1ID`),
        cdk.Fn.importValue(`${props.env.networkStackName}:PrivateSubnet2ID`),
      ],
    }) as Vpc
    // #endregion

    if (props.env.useExistingDnsZone) {
      this.hostedZone = HostedZone.fromLookup(this, 'HostedZone', { domainName: props.env.domainName })
    } else {
      if (props.env.createDns) {
        this.hostedZone = new HostedZone(this, 'HostedZone', {
          zoneName: props.env.domainName,
        })
      }
    }

    this.logs = new LogGroup(this, 'SharedLogGroup', {
      retention: RetentionDays.ONE_MONTH,
      logGroupName: this.stackName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Create a shared bucket for logging of DEC components
    this.logBucket = new Bucket(this, 'logBucket', {
      accessControl: BucketAccessControl.LOG_DELIVERY_WRITE,
      versioned: true,
      lifecycleRules: [{
        enabled: true,
        noncurrentVersionExpiration: cdk.Duration.days(1),
        expiration: cdk.Duration.days(365),
      }],
    })
    // Add shared certificate to use on ALBs, CloudFront Distributions
    this.certificate = Certificate.fromCertificateArn(this, 'certificate', cdk.Fn.importValue(`${props.env.domainStackName}:ACMCertificateARN`))

    this.publicLoadBalancer = new HttpsAlb(this, 'PublicLoadBalancer', {
      certificateArns: [cdk.Fn.importValue(`${props.env.domainStackName}:ACMCertificateARN`)],
      vpc: this.vpc,
      internetFacing: true,
    })

    this.cluster = new Cluster(this, 'Cluster', { vpc: this.vpc })

    this.privateNamespace = new PrivateDnsNamespace(this, 'PrivateNamespace', {
      vpc: this.vpc,
      name: this.stackName,
      description: 'Private Namespace for DEC',
    })

    this.mediaBucket = new Bucket(this, 'mediaBucket', {
      publicReadAccess: true,
      cors: [{
        allowedHeaders: ['*'],
        allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.POST],
        allowedOrigins: [`https://${props.honeycombHostnamePrefix}.${props.env.domainName}`],
        exposedHeaders: ['ETag'],
        maxAge: 3000,
      }],
    })

    this.databaseSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'PostgreSQLConnect', props.env.databaseConnectSG)
  }
}
