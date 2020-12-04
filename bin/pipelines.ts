import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../src/custom-environment'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'
import { FoundationStack } from '../src/foundation-stack'
import { BuzzStack } from '../src/buzz/buzz-stack'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment, testStacks: Stacks, prodStacks: Stacks): Stacks => {
  const infraRepoName = app.node.tryGetContext('infraRepoName')
  const infraRepoOwner = app.node.tryGetContext('infraRepoOwner')
  const infraSourceBranch = app.node.tryGetContext('infraSourceBranch')
  const dockerhubCredentialsPath = app.node.tryGetContext('dockerhubCredentialsPath')
  const oauthTokenPath = app.node.tryGetContext('oauthTokenPath')

  const commonProps = {
    namespace,
    env: env,
    infraRepoOwner: infraRepoOwner,
    infraRepoName: infraRepoName,
    infraSourceBranch: infraSourceBranch,
    dockerhubCredentialsPath: dockerhubCredentialsPath,
    oauthTokenPath: oauthTokenPath,
  }

  const foundationStack = new FoundationStack(app, `${namespace}-foundation`, {
    ...commonProps,
  })

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
