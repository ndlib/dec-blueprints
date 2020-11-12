import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../lib/foundation-stack'
import { HoneycombStack } from '../lib/honeycomb-stack'

test('Empty Stack', () => {
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
    slackNotifyStackName: 'slack-test',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test@test.edu',
    alarmsEmail: 'test@test.edu',
  }
  const networkStackName = 'network'
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env, networkStackName })
  const stack = new HoneycombStack(app, 'MyBeehiveStack', { foundationStack })
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {},
  }, MatchStyle.EXACT))
})
