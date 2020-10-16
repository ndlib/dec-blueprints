import * as cdk from '@aws-cdk/core'
import { CloudFrontAllowedMethods, CloudFrontWebDistribution, OriginAccessIdentity, ViewerCertificate } from '@aws-cdk/aws-cloudfront'
import { Bucket } from '@aws-cdk/aws-s3'
import { SharedServiceStackProps } from './shared-stack-props'
import { FoundationStack } from './foundation-stack'

export interface BeehiveStackProps extends SharedServiceStackProps {
  readonly domainStackName: string,
  readonly hostnamePrefix: string,
  readonly foundationStack: FoundationStack
}

export class BeehiveStack extends cdk.Stack {
  public readonly hostname: string
  public readonly bucket: Bucket
  public readonly cloudfront: CloudFrontWebDistribution

  constructor (scope: cdk.Construct, id: string, props: BeehiveStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

    this.hostname = `${props.hostnamePrefix || this.stackName}`
    const webBucket = new Bucket(this, 'beehiveBucket', {
      serverAccessLogsBucket: props.foundationStack.logBucket,
      serverAccessLogsPrefix: `s3/${this.hostname}`,
    })

    this.cloudfront = new CloudFrontWebDistribution(this, 'beehiveDistrobution', {
      comment: this.hostname,
      aliasConfiguration: {
        names: [props.hostnamePrefix + '.' + cdk.Fn.importValue(`${props.domainStackName}:DomainName`)],
        acmCertRef: props.foundationStack.certificate.certificateArn,
      },
      originConfigs: [{
        s3OriginSource: {
          s3BucketSource: webBucket,
          originAccessIdentity: new OriginAccessIdentity(this, 'beehiveOAI', {
            comment: `Static Assets in ${webBucket.bucketName}`,
          }),
        },
        behaviors: [{
          allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
          isDefaultBehavior: true,
          defaultTtl: (props.env === 'dev') ? cdk.Duration.seconds(0) : cdk.Duration.days(1),
        }],
      }],
      loggingConfig: {
        bucket: props.foundationStack.logBucket,
        includeCookies: true,
        prefix: `web/${this.hostname}`,
      },
      errorConfigurations: [
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: '/',
        },
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: '/',
        },
      ],
    })
  }
}
