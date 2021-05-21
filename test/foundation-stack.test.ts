import { expect as expectCDK, haveOutput, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../src/foundation-stack'
import helpers = require('../test/helpers')

describe('FoundationStack', () => {
  const stack = () => {
    const app = new cdk.App()
    return new FoundationStack(app, 'MyTestStack', {
      env: {
        name: 'test',
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
      },
      honeycombHostnamePrefix: 'honeycomb-test',
    })
  }

  describe('when useExistingDnsZone is true', () => {
    beforeEach(() => {
      helpers.mockHostedZoneFromLookup()
    })

    const stack = () => {
      const app = new cdk.App()
      return new FoundationStack(app, 'MyTestStack', {
        env: {
          name: 'test',
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
        },
        honeycombHostnamePrefix: 'honeycomb-test',
      })
    }

    test('does not create a Route53 Zone', () => {
      const newStack = stack()
      expectCDK(newStack).notTo(haveResource('AWS::Route53::HostedZone'))
    })

    describe('S3 Bucket tests', () => {
      test('creates a bucket with ACL for logging', () => {
        const newStack = stack()
        expectCDK(newStack).to(haveResource('AWS::S3::Bucket', {
          AccessControl: 'LogDeliveryWrite',
        }))
      })

      test('Log Bucket expires old versions', () => {
        const newStack = stack()
        expectCDK(newStack).to(haveResourceLike('AWS::S3::Bucket', {
          LifecycleConfiguration: {
            Rules: [
              {
                NoncurrentVersionExpirationInDays: 1,
                Status: 'Enabled',
              },
            ],
          },
        }))
      })

      test('Log Bucket expires objects after 365 days', () => {
        const newStack = stack()
        expectCDK(newStack).to(haveResourceLike('AWS::S3::Bucket', {
          LifecycleConfiguration: {
            Rules: [
              {
                ExpirationInDays: 365,
                Status: 'Enabled',
              },
            ],
          },
        }))
      })
    })
  })

  describe('when useExistingDnsZone is false', () => {
    const stack = () => {
      const app = new cdk.App()
      return new FoundationStack(app, 'MyTestStack', {
        env: {
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
        },
        honeycombHostnamePrefix: 'honeycomb-test',
      })
    }

    test('creates a Route53 Zone', () => {
      const newStack = stack()
      expectCDK(newStack).to(haveResource('AWS::Route53::HostedZone', {
        Name: 'test.edu.',
      }))
    })
    describe('S3 Bucket tests', () => {
      test('creates a bucket with ACL for logging', () => {
        const newStack = stack()
        expectCDK(newStack).to(haveResource('AWS::S3::Bucket', {
          AccessControl: 'LogDeliveryWrite',
        }))
      })

      test('Log Bucket expires old versions', () => {
        const newStack = stack()
        expectCDK(newStack).to(haveResourceLike('AWS::S3::Bucket', {
          LifecycleConfiguration: {
            Rules: [
              {
                NoncurrentVersionExpirationInDays: 1,
                Status: 'Enabled',
              },
            ],
          },
        }))
      })

      test('Log Bucket expires objects after 365 days', () => {
        const newStack = stack()
        expectCDK(newStack).to(haveResourceLike('AWS::S3::Bucket', {
          LifecycleConfiguration: {
            Rules: [
              {
                ExpirationInDays: 365,
                Status: 'Enabled',
              },
            ],
          },
        }))
      })
    })
  })

  test('puts proper ACM certificate on load balancer', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::ElasticLoadBalancingV2::Listener', {
      Certificates: [
        {
          CertificateArn: {
            'Fn::ImportValue': 'test-edu-domain:ACMCertificateARN',
          },
        },
      ],
    }))
  })
})
