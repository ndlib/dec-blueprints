import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BeehiveStack } from '../lib/beehive-stack'
import { FoundationStack } from '../lib/foundation-stack'
import { getContextByNamespace } from '../lib/context-helpers'

test('Test Stack', () => {
  const app = new cdk.App()
  // WHEN
  const domainStackName = 'libraries-domain'
  const useExistingDnsZone = false
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { domainStackName, useExistingDnsZone })
  const beehiveContext = getContextByNamespace('beehive')

  const stack = new BeehiveStack(app, 'MyBeehiveStack', { foundationStack, ...beehiveContext })
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
            LogFilePrefix: 's3/MyBeehiveStack',
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
      beehiveDistrobutionCFDistributionAA148562: {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Aliases: [
              {
                'Fn::Join': [
                  '',
                  [
                    'undefined.',
                    {
                      'Fn::ImportValue': 'undefined:DomainName',
                    },
                  ],
                ],
              },
            ],
            Comment: 'MyBeehiveStack',
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
              Prefix: 'web/MyBeehiveStack',
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
                'Fn::ImportValue': 'libraries-domain:ACMCertificateARN',
              },
              SslSupportMethod: 'sni-only',
            },
          },
        },
      },
    },
  }, MatchStyle.EXACT))
})
