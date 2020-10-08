import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { BeehiveStack } from '../lib/beehive-stack'
import { FoundationStack } from '../lib/foundation-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const foundationStack = new FoundationStack(app, 'MyFoundationStack')
  const stack = new BeehiveStack(app, 'MyBeehiveStack', { foundationStack })
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {},
  }, MatchStyle.EXACT))
})
