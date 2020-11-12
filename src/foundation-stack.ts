import * as cdk from '@aws-cdk/core'
import { Bucket, BucketAccessControl } from '@aws-cdk/aws-s3'
import { Certificate, CertificateValidation, ICertificate } from '@aws-cdk/aws-certificatemanager'
import { Vpc, IVpc } from '@aws-cdk/aws-ec2'
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53'
import { CustomEnvironment } from './custom-environment'

export interface FoundationStackProps extends cdk.StackProps {
  readonly env: CustomEnvironment;
  readonly networkStackName: string
}

export class FoundationStack extends cdk.Stack {
  public readonly vpc: IVpc
  public readonly logBucket: Bucket
  public readonly certificate: ICertificate
  public readonly hostedZone: IHostedZone

  constructor (scope: cdk.Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

    // #region Create a VPC prop that can be used by other stacks

    const vpcId = cdk.Fn.importValue(`${props.networkStackName}:VPCID`)

    this.vpc = Vpc.fromVpcAttributes(this, 'unpeered-network', {
      vpcId: vpcId,
      availabilityZones: [
        cdk.Fn.select(0, cdk.Fn.getAzs()),
        cdk.Fn.select(1, cdk.Fn.getAzs()),
      ],
      publicSubnetIds: [
        cdk.Fn.importValue(`${props.networkStackName}:PublicSubnet1ID`),
        cdk.Fn.importValue(`${props.networkStackName}:PublicSubnet2ID`),
      ],
      privateSubnetIds: [
        cdk.Fn.importValue(`${props.networkStackName}:PrivateSubnet1ID`),
        cdk.Fn.importValue(`${props.networkStackName}:PrivateSubnet2ID`),
      ],
    })
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
  }
}
