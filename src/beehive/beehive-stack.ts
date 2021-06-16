import * as cdk from '@aws-cdk/core'
import { CloudFrontAllowedMethods, CloudFrontWebDistribution, OriginAccessIdentity } from '@aws-cdk/aws-cloudfront'
import { CnameRecord } from '@aws-cdk/aws-route53'
import { Bucket } from '@aws-cdk/aws-s3'
import { SharedServiceStackProps } from '../shared-stack-props'
import { FoundationStack } from '../foundation-stack'
import { CustomEnvironment } from '../custom-environment'
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment'
import { AssetHelpers } from '../asset-helpers'

export interface BeehiveStackProps extends SharedServiceStackProps {
  readonly hostnamePrefix: string;
  readonly appDirectory: string;
  readonly env: CustomEnvironment;
  readonly foundationStack: FoundationStack;
}

export class BeehiveStack extends cdk.Stack {
  public readonly hostname: string

  constructor (scope: cdk.Construct, id: string, props: BeehiveStackProps) {
    super(scope, id, props)

    const domainNameImport = cdk.Fn.importValue(`${props.env.domainStackName}:DomainName`)
    this.hostname = `${props.hostnamePrefix}.${domainNameImport}`

    const webBucket = new Bucket(this, 'beehiveBucket', {
      serverAccessLogsBucket: props.foundationStack.logBucket,
      serverAccessLogsPrefix: `s3/${this.hostname}`,
    })

    const distribution = new CloudFrontWebDistribution(this, 'beehiveDistribution', {
      comment: this.hostname,
      aliasConfiguration: {
        names: [this.hostname],
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
    if (props.env.createDns && props.foundationStack.hostedZone) {
      new CnameRecord(this, 'BeehiveCNAME', { // eslint-disable-line no-new
        recordName: props.hostnamePrefix, // this.hostname,
        comment: this.hostname,
        domainName: distribution.distributionDomainName,
        zone: props.foundationStack.hostedZone,
        ttl: cdk.Duration.minutes(15),
      })
    }

    const hostnameOut = new cdk.CfnOutput(this, 'Hostname', {
      value: this.hostname,
      description: 'The server hostname distribution domain name.',
    })

    const deployBucket = new BucketDeployment(this, 'DeployWebsite', {
      sources: [AssetHelpers.s3SourceFromAsset(this, props.appDirectory)],
      destinationBucket: webBucket,
      distribution: distribution,
    })
  }
}
