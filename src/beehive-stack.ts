import * as cdk from '@aws-cdk/core'
import { CloudFrontAllowedMethods, CloudFrontWebDistribution, OriginAccessIdentity, ViewerCertificate } from '@aws-cdk/aws-cloudfront'
import { CnameRecord, HostedZone } from '@aws-cdk/aws-route53'
import { Bucket } from '@aws-cdk/aws-s3'
import { SharedServiceStackProps } from './shared-stack-props'
import { FoundationStack } from './foundation-stack'
import { CustomEnvironment } from './custom-environment'
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment'

export interface BeehiveStackProps extends SharedServiceStackProps {
  readonly hostnamePrefix: string,
  readonly env: CustomEnvironment
  readonly foundationStack: FoundationStack
}

export class BeehiveStack extends cdk.Stack {
  public readonly hostname: string
//  public readonly bucket: Bucket
//  public readonly cloudfront: CloudFrontWebDistribution

  constructor (scope: cdk.Construct, id: string, props: BeehiveStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here

    if (props.env.name === 'prod') {
      this.hostname = `${props.hostnamePrefix || this.stackName}`
    } else {
      this.hostname = `${props.hostnamePrefix || this.stackName}` + `-${props.env.name}`
    }
    const webBucket = new Bucket(this, 'beehiveBucket', {
      serverAccessLogsBucket: props.foundationStack.logBucket,
      serverAccessLogsPrefix: `s3/${this.hostname}`,
    })

    const distribution = new CloudFrontWebDistribution(this, 'beehiveDistribution', {
      comment: this.hostname,
      aliasConfiguration: {
        names: [this.hostname + '.' + cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`)],
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
          defaultTtl: (props.env.name === 'dev') ? cdk.Duration.seconds(0) : cdk.Duration.days(1),
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
    // Create DNS record (conditionally)
    if (props.env.createDns) {
      new CnameRecord(this, 'BeehiveCNAME', { // eslint-disable-line no-new
        recordName: this.hostname,
        comment: this.hostname,
        domainName: distribution.distributionDomainName,
        zone: props.foundationStack.hostedZone,
        ttl: cdk.Duration.minutes(15),
      })
    }
    const appSourcePath = "../beehive/build";

    new BucketDeployment(this, 'DeployWebsite', {
      sources: [Source.asset(appSourcePath)],
      destinationBucket: webBucket,
      distribution: distribution,
    });
  }
}
