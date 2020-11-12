import { App } from '@aws-cdk/core'
import { BeehiveStack } from '../lib/beehive-stack'
import { BuzzStack } from '../lib/buzz-stack'
import { CustomEnvironment } from '../lib/custom-environment'
import { FoundationStack } from '../lib/foundation-stack'
import { HoneycombStack } from '../lib/honeycomb-stack'
import { HoneypotStack } from '../lib/honeypot-stack'
import { Stacks } from '../lib/types'
import { getContextByNamespace } from '../lib/context-helpers'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment): Stacks => {
  // Construct common props that are required by all service stacks
  const commonProps = {
    namespace,
    env: env,
  }

  const foundationStack = new FoundationStack(app, `${namespace}-foundation`, {
    ...commonProps,
  })

  const beehiveContext = getContextByNamespace('beehive')
  const beehiveStack = new BeehiveStack(app, `${namespace}-beehive`, {
    foundationStack,
    ...commonProps,
    ...beehiveContext,
  })

  const buzzStack = new BuzzStack(app, `${namespace}-buzz`, { foundationStack, ...commonProps })
  const honeycombStack = new HoneycombStack(app, `${namespace}-honeycomb`, { foundationStack, ...commonProps })

  const honeypotContext = getContextByNamespace('honeypot')
  const honeypotStack = new HoneypotStack(app, `${namespace}-honeypot`, {
    foundationStack,
    ...commonProps,
    ...honeypotContext,
  })

  return { foundationStack, beehiveStack, buzzStack, honeycombStack, honeypotStack }
}
