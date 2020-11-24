import { expect as expectCDK, haveResource, haveResourceLike, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BuzzStack } from '../lib/buzz/buzz-stack'
import { getContextByNamespace } from '../lib/context-helpers'
import { FoundationStack } from '../lib/foundation-stack'

describe('non-production infrastructure', () => {
  const stack = () => {
    const app = new cdk.App()
    // WHEN
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      oauthTokenPath: '/path/to/oauth',
    }
    const hostnamePrefix = 'buzz-test'
    const buzzContext = getContextByNamespace('buzz')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    return new BuzzStack(app, 'MyBuzzStack', {
      env,
      foundationStack,
      appDirectory: '../buzz',
      hostnamePrefix,
      ...buzzContext,
    })
  }
  // Check for Desired resources with proper configurations

  test('creates load balancer security group in assigned VPC', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::EC2::SecurityGroup', {
      VpcId: { 'Fn::ImportValue': 'test-network:VPCID' },
    }))
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

  test('creates ECS Service with proper containers ', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ECS::Service', {
      LoadBalancers: [
        {
          ContainerName: 'RailsContainer',
        },
      ],
    }))
  })

  test('creates ELB Listener with proper header', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [
        {
          Field: 'host-header',
          Values: [
            {
              'Fn::Join': [
                '',
                [
                  'buzz-test.',
                  {
                    'Fn::ImportValue': 'test-edu-domain:DomainName',
                  },
                ],
              ],
            },
          ],
        },
      ],
    }))
  })
})

describe('production infrastructure', () => {
  const stack = () => {
    const app = new cdk.App()
    // WHEN
    const env = {
      name: 'prod',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      oauthTokenPath: '/path/to/oauth',
    }
    const buzzContext = getContextByNamespace('buzz')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    return new BuzzStack(app, 'MyBuzzStack', {
      env,
      name: 'prod',
      hostnamePrefix: 'buzz',
      foundationStack,
      appDirectory: '../buzz',
      ...buzzContext,
    })
  }

  // Check for expected resources with desired configuration
  test('creates ELB Listener with proper header', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [
        {
          Field: 'host-header',
          Values: [
            {
              'Fn::Join': [
                '',
                [
                  'buzz.',
                  {
                    'Fn::ImportValue': 'test-edu-domain:DomainName',
                  },
                ],
              ],
            },
          ],
        },
      ],
    }))
  })
})
