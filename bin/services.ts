import { App } from '@aws-cdk/core'
import { BeehiveStack } from '../src/beehive-stack'
import { BuzzStack } from '../src/buzz/buzz-stack'
import { CustomEnvironment } from '../src/custom-environment'
import { FoundationStack } from '../src/foundation-stack'
import { HoneycombStack } from '../src/honeycomb/honeycomb-stack'
import { HoneypotStack } from '../src/honeypot-stack'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'

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

  const honeycombContext = getContextByNamespace('honeycomb')
  const honeycombStack = new HoneycombStack(app, `${namespace}-honeycomb`, {
    foundationStack,
    ...commonProps,
    ...honeycombContext,
  })

  const buzzContext = getContextByNamespace('buzz')
  const buzzStack = new BuzzStack(app, `${namespace}-buzz`, {
    foundationStack,
    ...commonProps,
    ...buzzContext,
  })

  const honeypotContext = getContextByNamespace('honeypot')
  const honeypotStack = new HoneypotStack(app, `${namespace}-honeypot`, {
    foundationStack,
    ...commonProps,
    ...honeypotContext,
  })

  return { foundationStack, beehiveStack, buzzStack, honeycombStack, honeypotStack }
}
