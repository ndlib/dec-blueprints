import { App } from '@aws-cdk/core'
import { BeehiveStack } from '../lib/beehive-stack'
import { BeehivePipelineStack} from '../lib/beehive-pipeline'
import { CustomEnvironment } from '../lib/custom-environment'
import { FoundationStack } from '../lib/foundation-stack'
import { getContextByNamespace } from '../lib/context-helpers'
import { Stacks } from '../lib/types'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment, testStacks: Stacks, prodStacks: Stacks): Stacks => {

  // Construct common props that are required by all service stacks
  const commonProps = {
    namespace,
    env: env,
  }

  const foundationStack = new FoundationStack(app, `${namespace}-foundation`, {
    ...commonProps,
  })

  const beehiveContext = getContextByNamespace('beehive')
  const beehivePipelineStack = new BeehivePipelineStack(app, `${namespace}-beehive-pipeline`, {
    foundationStack,
    testStack: testStacks.beehiveStack,
    ...commonProps,
    ...beehiveContext,
  })

  return {}
}
