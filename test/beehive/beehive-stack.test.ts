import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BeehiveStack } from '../../src/beehive/beehive-stack'
import { FoundationStack } from '../../src/foundation-stack'

describe('non-production infrastructure', () => {
  const stack = () => {
    const app = new cdk.App()
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      databaseConnectSG: 'test.env.databaseConnectSG',
    }
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, honeycombHostnamePrefix: 'honeycomb-test' })
    return new BeehiveStack(app, 'MyTestStack', {
      foundationStack,
      env,
      hostnamePrefix: 'MyTestStack-test',
      appDirectory: './test/fixtures',
    })
  }

  test('creates an S3 Bucket with logging', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::S3::Bucket', {
      LoggingConfiguration: {
        LogFilePrefix: {
          'Fn::Join': [
            '',
            [
              's3/MyTestStack-test.',
              {
                'Fn::ImportValue': 'test-edu-domain:DomainName',
              },
            ],
          ],
        },
        DestinationBucketName: { 'Fn::ImportValue': 'MyFoundationStack:ExportsOutputReflogBucket1FE17E857A1D72F0' },
      },
    }))
  })

  test('creates an Origin Access Identity for CloudFront', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::CloudFront::CloudFrontOriginAccessIdentity', {
      CloudFrontOriginAccessIdentityConfig: {
        Comment: {
          'Fn::Join': [
            '',
            [
              'Static Assets in ',
              {
                Ref: 'beehiveBucket45D50636',
              },
            ],
          ],
        },
      },
    }))
  })

  test('creates a CloudFront distribution with proper alias', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: [
          {
            'Fn::Join': [
              '',
              [
                'MyTestStack-test.',
                {
                  'Fn::ImportValue': 'test-edu-domain:DomainName',
                },
              ],
            ],
          },
        ],
      },
    }))
  })

  test('creates CloudFront with proper OriginConfig', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Origins: [
          {
            S3OriginConfig: {
              OriginAccessIdentity: {
                'Fn::Join': [
                  '',
                  [
                    'origin-access-identity/cloudfront/',
                    {
                      Ref: 'beehiveOAI4A084BEC',
                    },
                  ],
                ],
              },
            },
          },
        ],
      },
    }))
  })

  test('CloudFront distribution gets proper ACM certificate', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        ViewerCertificate: {
          AcmCertificateArn: {
            'Fn::ImportValue': 'test-edu-domain:ACMCertificateARN',
          },
          SslSupportMethod: 'sni-only',
        },
      },
    }))
  })

  test('CloudFront distribution has propper logging configuration', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Logging: {
          Bucket: { 'Fn::ImportValue': 'MyFoundationStack:ExportsOutputFnGetAttlogBucket1FE17E85RegionalDomainName90114C32' },
          IncludeCookies: true,
          Prefix: {
            'Fn::Join': [
              '',
              [
                'web/MyTestStack-test.',
                {
                  'Fn::ImportValue': 'test-edu-domain:DomainName',
                },
              ],
            ],
          },
        },
      },
    }))
  })

  test('create DNS record in Route53', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::Route53::RecordSet', {
      Name: 'MyTestStack-test.test.edu.',
      Type: 'CNAME',
      Comment: {
        'Fn::Join': [
          '',
          [
            'MyTestStack-test.',
            {
              'Fn::ImportValue': 'test-edu-domain:DomainName',
            },
          ],
        ],
      },
      HostedZoneId: { 'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefHostedZoneDB99F8662BBAE844' },
      ResourceRecords: [
        {
          'Fn::GetAtt': [
            'beehiveDistributionCFDistribution7C6BE6D1',
            'DomainName',
          ],
        },
      ],
      TTL: '900',
    }))
  })
})

describe('production infrastructure', () => {
  const stack = () => {
    const app = new cdk.App()
    const env = {
      name: 'prod',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: true,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      databaseConnectSG: 'test.env.databaseConnectSG',
    }
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, honeycombHostnamePrefix: 'honeycomb-test' })
    return new BeehiveStack(app, 'MyTestStack', {
      foundationStack,
      env,
      hostnamePrefix: 'MyTestStack',
      appDirectory: './test/fixtures',
    })
  }

  test('creates an S3 Bucket with logging', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::S3::Bucket', {
      LoggingConfiguration: {
        LogFilePrefix: {
          'Fn::Join': [
            '',
            [
              's3/MyTestStack.',
              {
                'Fn::ImportValue': 'test-edu-domain:DomainName',
              },
            ],
          ],
        },
        DestinationBucketName: { 'Fn::ImportValue': 'MyFoundationStack:ExportsOutputReflogBucket1FE17E857A1D72F0' },
      },
    }))
  })

  test('creates an Origin Access Identity for CloudFront', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::CloudFront::CloudFrontOriginAccessIdentity', {
      CloudFrontOriginAccessIdentityConfig: {
        Comment: {
          'Fn::Join': [
            '',
            [
              'Static Assets in ',
              {
                Ref: 'beehiveBucket45D50636',
              },
            ],
          ],
        },
      },
    }))
  })

  test('creates a CloudFront distribution with proper alias', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: [
          {
            'Fn::Join': [
              '',
              [
                'MyTestStack.',
                {
                  'Fn::ImportValue': 'test-edu-domain:DomainName',
                },
              ],
            ],
          },
        ],
      },
    }))
  })

  test('CloudFront distribution gets proper ACM certificate', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        ViewerCertificate: {
          AcmCertificateArn: {
            'Fn::ImportValue': 'test-edu-domain:ACMCertificateARN',
          },
          SslSupportMethod: 'sni-only',
        },
      },
    }))
  })

  test('CloudFront distribution has propper logging configuration', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Logging: {
          Bucket: { 'Fn::ImportValue': 'MyFoundationStack:ExportsOutputFnGetAttlogBucket1FE17E85RegionalDomainName90114C32' },
          IncludeCookies: true,
          Prefix: {
            'Fn::Join': [
              '',
              [
                'web/MyTestStack.',
                {
                  'Fn::ImportValue': 'test-edu-domain:DomainName',
                },
              ],
            ],
          },
        },
      },
    }))
  })
})

describe('do not create dns', () => {
  const stack = () => {
    const app = new cdk.App()
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: false,
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: true,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      databaseConnectSG: 'test.env.databaseConnectSG',
    }
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, honeycombHostnamePrefix: 'honeycomb-test' })
    return new BeehiveStack(app, 'MyTestStack', {
      foundationStack,
      env,
      hostnamePrefix: 'MyTestStack',
      appDirectory: './test/fixtures',
    })
  }

  test('does not create a DNS record', () => {
    const newStack = stack()
    expectCDK(newStack).notTo(haveResource('AWS::Route53::RecordSet'))
  })
})
