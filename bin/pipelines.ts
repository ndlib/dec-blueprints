import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../src/custom-environment'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'
import { FoundationStack } from '../src/foundation-stack'
import { BuzzStack } from '../src/buzz/buzz-stack'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'
import { PipelineFoundationStack } from '../src/pipeline-foundation-stack'

export const instantiateStacks = (app: App, namespace: string, env: CustomEnvironment, testStacks: Stacks, prodStacks: Stacks): Stacks => {
  const infraRepoName = app.node.tryGetContext('infraRepoName')
  const infraRepoOwner = app.node.tryGetContext('infraRepoOwner')
  const infraSourceBranch = app.node.tryGetContext('infraSourceBranch')
  const dockerhubCredentialsPath = app.node.tryGetContext('dockerhubCredentialsPath')
  const oauthTokenPath = app.node.tryGetContext('oauthTokenPath')
  
  const pipelineFoundationStack = new PipelineFoundationStack(app, `${namespace}-deployment-foundation`, { env })
  const commonProps = {
    namespace,
    env: env,
    infraRepoOwner: infraRepoOwner,
    infraRepoName: infraRepoName,
    infraSourceBranch: infraSourceBranch,
    dockerhubCredentialsPath: dockerhubCredentialsPath,
    oauthTokenPath: oauthTokenPath,
    pipelineFoundationStack,
    testFoundationStack: testStacks.foundationStack,
    prodFoundationStack: prodStacks.foundationStack,
  }


  const buzzContext = getContextByNamespace('buzz')
  const buzzPipelineStack = new BuzzPipelineStack(app, `${namespace}-buzz-pipeline`, {
    testStack: testStacks.BuzzStack,
    prodStack: prodStacks.BuzzStack,
    ...commonProps,
    ...buzzContext,
  })
  return { buzzPipelineStack }
}
