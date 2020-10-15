import * as cdk from '@aws-cdk/core'
import { Bucket, BucketAccessControl } from '@aws-cdk/aws-s3'
import { Certificate, ICertificate } from '@aws-cdk/aws-certificatemanager'

export interface FoundationStackProps extends cdk.StackProps {
  readonly domainStackName: string;
}

export class FoundationStack extends cdk.Stack {
  public readonly logBucket: Bucket
  public readonly certificate: ICertificate

  constructor (scope: cdk.Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

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
