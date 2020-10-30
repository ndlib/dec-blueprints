import { expect as expectCDK, haveResource, haveResourceLike, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { HoneypotStack } from '../lib/honeypot-stack'
import { FoundationStack } from '../lib/foundation-stack'
import { getContextByNamespace } from '../lib/context-helpers'

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
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: true,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
    }
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })
    const honeypotContext = getContextByNamespace('honeypot')
    return new HoneypotStack(app, 'MyTestStack', {
      foundationStack,
      env,
      ...honeypotContext,
    })
  }

  test('does not create a DNS record', () => {
    const newStack = stack()
    expectCDK(newStack).notTo(haveResource('AWS::Route53::RecordSet'))
  })
})
