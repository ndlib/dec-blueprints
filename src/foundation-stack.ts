import * as cdk from '@aws-cdk/core'
import { Bucket, BucketAccessControl } from '@aws-cdk/aws-s3'
import { Certificate, CertificateValidation, ICertificate } from '@aws-cdk/aws-certificatemanager'
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53'

export interface FoundationStackProps extends cdk.StackProps {
  readonly domainStackName: string;
  readonly useExistingDnsZone: boolean;
}

export class FoundationStack extends cdk.Stack {
  public readonly logBucket: Bucket
  public readonly certificate: ICertificate
  public readonly hostedZone: IHostedZone

  constructor (scope: cdk.Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

    let certificateValidation = CertificateValidation.fromDns()
    if (props.useExistingDnsZone) {
      this.hostedZone = HostedZone.fromLookup(this, 'HostedZone', { domainName: cdk.Fn.importValue(`${props.domainStackName}:DomainName`) })
    } else {
      this.hostedZone = new HostedZone(this, 'HostedZone', {
        zoneName: cdk.Fn.importValue(`${props.domainStackName}:DomainName`),
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
    this.certificate = Certificate.fromCertificateArn(this, 'certificate', cdk.Fn.importValue(`${props.domainStackName}:ACMCertificateARN`))
  }
}
