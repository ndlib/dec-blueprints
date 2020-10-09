import { App } from '@aws-cdk/core'
import { BeehiveStack } from '../lib/beehive-stack'
import { BuzzStack } from '../lib/buzz-stack'
import { CustomEnvironment } from '../lib/custom-environment'
import { FoundationStack } from '../lib/foundation-stack'
import { HoneycombStack } from '../lib/honeycomb-stack'
import { HoneypotStack } from '../lib/honeypot-stack'
import { Stacks } from '../lib/types'
import { getContextByNamespace } from '../lib/context-helpers'

const beehiveContext = getContextByNamespace('beehive')

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment): Stacks => {
  const foundationStack = new FoundationStack(app, `${namespace}-foundation`, { env })
  const beehiveStack = new BeehiveStack(app, `${namespace}-beehive`, {
    env,
    foundationStack,
    ...beehiveContext,
  })
  const buzzStack = new BuzzStack(app, `${namespace}-buzz`, { env, foundationStack })
  const honeycombStack = new HoneycombStack(app, `${namespace}-honeycomb`, { env, foundationStack })
  const honeypotStack = new HoneypotStack(app, `${namespace}-honeypot`, { env, foundationStack })

  return { foundationStack, beehiveStack, buzzStack, honeycombStack, honeypotStack }
}
