import { expect as expectCDK, haveResource, haveResourceLike, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { HoneypotStack } from '../src/honeypot/honeypot-stack'
import { FoundationStack } from '../src/foundation-stack'
import { getContextByNamespace } from '../src/context-helpers'

describe('Production stack infrastructure', () => {
  const stack = () => {
    const app = new cdk.App()
    const env = {
      name: 'prod',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: false,
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
    }
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, honeycombHostnamePrefix: 'honeycomb-test' })
    const honeypotContext = getContextByNamespace('honeypot')
    return new HoneypotStack(app, 'MyTestStack', {
      foundationStack,
      env,
      appDirectory: './test/fixtures',
      ...honeypotContext,
    })
  }

  test('does not creates a DNS record', () => {
    const newStack = stack()
    expectCDK(newStack).notTo(haveResource('AWS::Route53::RecordSet'))
  })
})

describe('Dev stack infrastructure', () => {
  const stack = () => {
    const app = new cdk.App()
    const env = {
      name: 'dev',
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
    }
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, honeycombHostnamePrefix: 'honeycomb-test' })
    const honeypotContext = getContextByNamespace('honeypot')
    return new HoneypotStack(app, 'MyTestStack', {
      foundationStack,
      env,
      appDirectory: './test/fixtures',
      ...honeypotContext,
    })
  }

  test('creates a DNS record', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResource('AWS::Route53::RecordSet'))
  })
})
