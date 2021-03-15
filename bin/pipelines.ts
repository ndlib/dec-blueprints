import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../src/custom-environment'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'
import { HoneypotPipelineStack } from '../src/honeypot/honeypot-pipeline'
import { PipelineFoundationStack } from '../src/pipeline-foundation-stack'
import { HoneycombPipelineStack } from '../src/honeycomb/honeycomb-pipeline'

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

  const honeypotContext = getContextByNamespace('honeypot')
  const honeypotPipelineStack = new HoneypotPipelineStack(app, `${namespace}-honeypot-pipeline`, {
    foundationStack: testStacks.foundationStack,
    testStack: testStacks.HoneypotStack,
    prodStack: prodStacks.HoneypotStack,
    ...commonProps,
    ...honeypotContext,
  })

  return { buzzPipelineStack, honeypotPipelineStack }
  const honeycombContext = getContextByNamespace('honeycomb')
  const honeycombPipelineStack = new HoneycombPipelineStack(app, `${namespace}-honeycomb-pipeline`, {
    ...commonProps,
    ...honeycombContext,
  })
  return { buzzPipelineStack, honeycombPipelineStack }
}
