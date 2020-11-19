import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../lib/custom-environment'
import { Stacks } from '../lib/types'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment, testStacks: Stacks, prodStacks: Stacks): Stacks => {

  const beehiveContext = getContextByNamespace('beehive')
  const beehivePipelineStack = new BeehivePipelineStack(app, `${namespace}-beehive-pipeline`, {
    foundationStack,
    ...commonProps,
    ...beehiveContext,
  })

  return {}
}
