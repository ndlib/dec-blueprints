import { expect as expectCDK, haveResource, haveResourceLike, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { HoneypotStack } from '../../src/honeypot/honeypot-stack'
import { FoundationStack } from '../../src/foundation-stack'
import { getContextByNamespace } from '../../src/context-helpers'

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
    }
    const hostnamePrefix = 'honeypot-test'
    const honeypotContext = getContextByNamespace('honeypot')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    return new HoneypotStack(app, 'MyHoneypotStack', {
      env,
      foundationStack,
      appDirectory: './test/fixtures',
      hostnamePrefix,
      ...honeypotContext,
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
          ContainerName: 'ruby24',
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
                  'honeypot-test.',
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
    }
    const honeypotContext = getContextByNamespace('honeypot')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    return new HoneypotStack(app, 'MyHoneypotStack', {
      env,
      name: 'prod',
      hostnamePrefix: 'honeypot',
      foundationStack,
      appDirectory: './test/fixtures',
      ...honeypotContext,
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
                  'honeypot.',
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
