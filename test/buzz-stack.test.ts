import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BuzzStack } from '../lib/buzz-stack'
import { FoundationStack } from '../lib/foundation-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const domainStackName = 'libraries-domain'
  const domainName = 'test.edu'
  const useExistingDnsZone = false
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { domainStackName, domainName, useExistingDnsZone })
  const stack = new BuzzStack(app, 'MyBeehiveStack', { foundationStack })
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {},
  }, MatchStyle.EXACT))
})
