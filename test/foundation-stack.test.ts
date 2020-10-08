import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../lib/foundation-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const stack = new FoundationStack(app, 'MyFoundationStack')
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {},
  }, MatchStyle.EXACT))
})
