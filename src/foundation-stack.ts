import * as cdk from '@aws-cdk/core'
import { Bucket, BucketAccessControl } from '@aws-cdk/aws-s3'

export interface FoundationStackProps extends cdk.StackProps {}

export class FoundationStack extends cdk.Stack {

  public readonly logBucket: Bucket

  constructor (scope: cdk.Construct, id: string, props?: FoundationStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

    this.logBucket = new Bucket(this, 'logBucket',{
      accessControl: BucketAccessControl.LOG_DELIVERY_WRITE,
      versioned: true,
      lifecycleRules:[{
        enabled: true,
        noncurrentVersionExpiration: cdk.Duration.days(1),
        expiration: cdk.Duration.days(365),
      }],
      })
  }
}
