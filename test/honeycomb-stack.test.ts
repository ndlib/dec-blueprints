import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../lib/foundation-stack'
import { HoneycombStack } from '../lib/honeycomb-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const domainStackName = 'libraries-domain'
  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { domainStackName })
  const stack = new HoneycombStack(app, 'MyBeehiveStack', { foundationStack })
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {},
  }, MatchStyle.EXACT))
})
