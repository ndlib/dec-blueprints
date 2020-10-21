import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BeehiveStack } from '../lib/beehive-stack'
import { FoundationStack } from '../lib/foundation-stack'
import { getContextByNamespace } from '../lib/context-helpers'

test('Test Stack', () => {
  const app = new cdk.App()
  // WHEN
  const env = {
    name: 'test',
    domainName: 'test.edu',
    domainStackName: 'test-edu-domain',
    region: 'test-region',
    account: 'test-account',
    createDns: true,
    useVpcId: '123456',
    slackNotifyStackName: 'slack-test',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test@test.edu',
    alarmsEmail: 'test@test.edu',
  }
  const useExistingDnsZone = false
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, useExistingDnsZone })
  const beehiveContext = getContextByNamespace('beehive')

  const stack = new BeehiveStack(app, 'MyBeehiveStack', { foundationStack, env, ...beehiveContext })
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {
      beehiveBucket45D50636: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          LoggingConfiguration: {
            DestinationBucketName: {
              'Fn::ImportValue': 'MyFoundationStack:ExportsOutputReflogBucket1FE17E857A1D72F0',
            },
            LogFilePrefix: 's3/MyBeehiveStack-test',
          },
        },
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Retain',
      },
      beehiveBucketPolicy7B5E0A2A: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: {
            Ref: 'beehiveBucket45D50636',
          },
          PolicyDocument: {
            Statement: [
              {
                Action: [
                  's3:GetObject*',
                  's3:GetBucket*',
                  's3:List*',
                ],
                Effect: 'Allow',
                Principal: {
                  CanonicalUser: {
                    'Fn::GetAtt': [
                      'beehiveOAI4A084BEC',
                      'S3CanonicalUserId',
                    ],
                  },
                },
                Resource: [
                  {
                    'Fn::GetAtt': [
                      'beehiveBucket45D50636',
                      'Arn',
                    ],
                  },
                  {
                    'Fn::Join': [
                      '',
                      [
                        {
                          'Fn::GetAtt': [
                            'beehiveBucket45D50636',
                            'Arn',
                          ],
                        },
                        '/*',
                      ],
                    ],
                  },
                ],
              },
            ],
            Version: '2012-10-17',
          },
        },
      },
      beehiveOAI4A084BEC: {
        Type: 'AWS::CloudFront::CloudFrontOriginAccessIdentity',
        Properties: {
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
        },
      },
      beehiveDistributionCFDistribution7C6BE6D1: {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Aliases: [
              {
                'Fn::Join': [
                  '',
                  [
                    'MyBeehiveStack-test.',
                    {
                      'Fn::ImportValue': 'test-edu-domain:DomainName',
                    },
                  ],
                ],
              },
            ],
            Comment: 'MyBeehiveStack-test',
            CustomErrorResponses: [
              {
                ErrorCode: 404,
                ResponseCode: 200,
                ResponsePagePath: '/',
              },
              {
                ErrorCode: 403,
                ResponseCode: 200,
                ResponsePagePath: '/',
              },
            ],
            DefaultCacheBehavior: {
              AllowedMethods: [
                'GET',
                'HEAD',
                'OPTIONS',
              ],
              CachedMethods: [
                'GET',
                'HEAD',
              ],
              Compress: true,
              DefaultTTL: 86400,
              ForwardedValues: {
                Cookies: {
                  Forward: 'none',
                },
                QueryString: false,
              },
              TargetOriginId: 'origin1',
              ViewerProtocolPolicy: 'redirect-to-https',
            },
            DefaultRootObject: 'index.html',
            Enabled: true,
            HttpVersion: 'http2',
            IPV6Enabled: true,
            Logging: {
              Bucket: {
                'Fn::ImportValue': 'MyFoundationStack:ExportsOutputFnGetAttlogBucket1FE17E85DomainNameD13114CA',
              },
              IncludeCookies: true,
              Prefix: 'web/MyBeehiveStack-test',
            },
            Origins: [
              {
                ConnectionAttempts: 3,
                ConnectionTimeout: 10,
                DomainName: {
                  'Fn::GetAtt': [
                    'beehiveBucket45D50636',
                    'RegionalDomainName',
                  ],
                },
                Id: 'origin1',
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
            PriceClass: 'PriceClass_100',
            ViewerCertificate: {
              AcmCertificateArn: {
                'Fn::ImportValue': 'test-edu-domain:ACMCertificateARN',
              },
              SslSupportMethod: 'sni-only',
            },
          },
        },
      },
      BeehiveCNAMEE7FBFA4E: {
        Type: 'AWS::Route53::RecordSet',
        Properties: {
          Name: 'MyBeehiveStack-test.test.edu.',
          Type: 'CNAME',
          Comment: 'MyBeehiveStack-test',
          HostedZoneId: {
            'Fn::ImportValue': 'MyFoundationStack:ExportsOutputRefHostedZoneDB99F8662BBAE844',
          },
          ResourceRecords: [
            {
              'Fn::GetAtt': [
                'beehiveDistributionCFDistribution7C6BE6D1',
                'DomainName',
              ],
            },
          ],
          TTL: '900',
        },
      },
    },
  }, MatchStyle.EXACT))
})
