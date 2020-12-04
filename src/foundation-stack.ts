import * as cdk from '@aws-cdk/core'
import { Bucket, BucketAccessControl, BucketEncryption } from '@aws-cdk/aws-s3'
import { Certificate, CertificateValidation, ICertificate } from '@aws-cdk/aws-certificatemanager'
import { Vpc } from '@aws-cdk/aws-ec2'
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53'
import { CustomEnvironment } from './custom-environment'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
import { PrivateDnsNamespace } from '@aws-cdk/aws-servicediscovery'
import { HttpsAlb } from '@ndlib/ndlib-cdk'

import { Cluster } from '@aws-cdk/aws-ecs'

export interface FoundationStackProps extends cdk.StackProps {
  readonly env: CustomEnvironment
}

export class FoundationStack extends cdk.Stack {
  public readonly vpc: Vpc
  public readonly logBucket: Bucket
  public readonly artifactBucket: Bucket
  public readonly certificate: ICertificate
  public readonly hostedZone: IHostedZone
  public readonly logs: LogGroup
  public readonly publicLoadBalancer: HttpsAlb
  public readonly cluster: Cluster
  public readonly privateNamespace: PrivateDnsNamespace

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

    let certificateValidation = CertificateValidation.fromDns()
    if (props.env.useExistingDnsZone) {
      this.hostedZone = HostedZone.fromLookup(this, 'HostedZone', { domainName: props.env.domainName })
    } else {
      this.hostedZone = new HostedZone(this, 'HostedZone', {
        zoneName: props.env.domainName,
      })
      certificateValidation = CertificateValidation.fromDns(this.hostedZone)
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

    this.artifactBucket = new Bucket(this, 'artifactBucket', {
      encryption: BucketEncryption.KMS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
  }
}
