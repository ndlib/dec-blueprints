import { App } from '@aws-cdk/core'
import { BeehiveStack } from '../src/beehive/beehive-stack'
import { BuzzStack } from '../src/buzz/buzz-stack'
import { CustomEnvironment } from '../src/custom-environment'
import { FoundationStack } from '../src/foundation-stack'
import { HoneycombStack } from '../src/honeycomb/honeycomb-stack'
import { HoneypotStack } from '../src/honeypot/honeypot-stack'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment): Stacks => {
  // Construct common props that are required by all service stacks
  const commonProps = {
    namespace,
    env: env,
  }

  const honeycombContext = getContextByNamespace('honeycomb')
  const beehiveContext = getContextByNamespace('beehive')
  const buzzContext = getContextByNamespace('buzz')
  const honeypotContext = getContextByNamespace('honeypot')

  const foundationStack = new FoundationStack(app, `${namespace}-foundation`, {
    honeycombHostnamePrefix: honeycombContext.hostnamePrefix,
    ...commonProps,
  })
  const beehiveStack = new BeehiveStack(app, `${namespace}-beehive`, {
    foundationStack,
    ...commonProps,
    ...beehiveContext,
  })
  const buzzStack = new BuzzStack(app, `${namespace}-buzz`, {
    foundationStack,
    ...commonProps,
    ...buzzContext,
  })
  const honeypotStack = new HoneypotStack(app, `${namespace}-honeypot`, {
    foundationStack,
    ...commonProps,
    ...honeypotContext,
  })
  const honeycombStack = new HoneycombStack(app, `${namespace}-honeycomb`, {
    foundationStack,
    honeypotStack,
    buzzStack,
    beehiveStack,
    ...commonProps,
    ...honeycombContext,
  })

  return { foundationStack, beehiveStack, buzzStack, honeycombStack, honeypotStack }
}
