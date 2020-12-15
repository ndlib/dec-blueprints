import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../src/custom-environment'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'
import { FoundationStack } from '../src/foundation-stack'
import { BeehiveStack } from '../src/beehive/beehive-stack'
import { BeehivePipelineStack } from '../src/beehive/beehive-pipeline'
import { BuzzStack } from '../src/buzz/buzz-stack'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment, testStacks: Stacks, prodStacks: Stacks): Stacks => {
  const infraRepoName = app.node.tryGetContext('infraRepoName')
  const infraRepoOwner = app.node.tryGetContext('infraRepoOwner')
  const infraSourceBranch = app.node.tryGetContext('infraSourceBranch')
  const dockerCredentialsPath = app.node.tryGetContext('dockerCredentialsPath')
  const oauthTokenPath = app.node.tryGetContext('oauthTokenPath')

  const commonProps = {
    namespace,
    env: env,
    infraRepoOwner: infraRepoOwner,
    infraRepoName: infraRepoName,
    infraSourceBranch: infraSourceBranch,
    dockerCredentialsPath: dockerCredentialsPath,
    oauthTokenPath: oauthTokenPath,
  }

  const foundationStack = new FoundationStack(app, `${namespace}-foundation`, {
    ...commonProps,
  })

  const beehiveContext = getContextByNamespace('beehive')
  const beehivePipelineStack = new BeehivePipelineStack(app, `${namespace}-beehive-pipeline`, {
    foundationStack,
    testStack: testStacks.BeehiveStack,
    prodStack: prodStacks.BeehiveStack,
    ...commonProps,
    ...beehiveContext,
  })
  return { beehivePipelineStack }

  const buzzContext = getContextByNamespace('buzz')
  const buzzPipelineStack = new BuzzPipelineStack(app, `${namespace}-buzz-pipeline`, {
    foundationStack,
    testStack: testStacks.BuzzStack,
    prodStack: prodStacks.BuzzStack,
    ...commonProps,
    ...buzzContext,
  })
  return { buzzPipelineStack }
}
