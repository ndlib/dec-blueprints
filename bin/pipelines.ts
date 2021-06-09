import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../src/custom-environment'
import { Stacks } from '../src/types'
import { getContextByNamespace } from '../src/context-helpers'
import { BuzzPipelineStack } from '../src/buzz/buzz-pipeline'
import { BeehiveStack } from '../src/beehive/beehive-stack'
import { BeehivePipelineStack } from '../src/beehive/beehive-pipeline'
import { PipelineFoundationStack } from '../src/pipeline-foundation-stack'
import { HoneycombPipelineStack } from '../src/honeycomb/honeycomb-pipeline'
import { HoneypotPipelineStack } from '../src/honeypot/honeypot-pipeline'

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

<<<<<<< HEAD
  const beehiveContext = getContextByNamespace('beehive')
  const beehivePipelineStack = new BeehivePipelineStack(app, `${namespace}-beehive-pipeline`, {
    testStack: testStacks.BeehiveStack,
    prodStack: prodStacks.BeehiveStack,
    ...commonProps,
    ...beehiveContext,
=======
  const honeypotContext = getContextByNamespace('honeypot')
  const honeypotPipelineStack = new HoneypotPipelineStack(app, `${namespace}-honeypot-pipeline`, {
    ...commonProps,
    ...honeypotContext,
>>>>>>> main
  })

  const honeycombContext = getContextByNamespace('honeycomb')
  const honeycombPipelineStack = new HoneycombPipelineStack(app, `${namespace}-honeycomb-pipeline`, {
    ...commonProps,
    ...honeycombContext,
    honeypotPipelineStack,
    buzzPipelineStack,
    // beehivePipelineStack,
  })

  return { buzzPipelineStack, honeycombPipelineStack, honeypotPipelineStack }
}
