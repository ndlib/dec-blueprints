import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../lib/foundation-stack'
import { HoneypotStack } from '../lib/honeypot-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const domainStackName = 'libraries-domain'
  const domainName = 'test.edu'
  const useExistingDnsZone = false
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { domainStackName, domainName, useExistingDnsZone })
  const stack = new HoneypotStack(app, 'MyBeehiveStack', { foundationStack })
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {},
  }, MatchStyle.EXACT))
})
