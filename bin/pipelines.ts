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
import { PipelineHostnames } from '../src/pipeline-constructs/hostnames'

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

  const honeycombContext = getContextByNamespace('honeycomb')
  const honeycombHostnames = new PipelineHostnames(honeycombContext.hostnamePrefix, env)
  const buzzContext = getContextByNamespace('buzz')
  const buzzHostnames = new PipelineHostnames(buzzContext.hostnamePrefix, env)
  const beehiveContext = getContextByNamespace('beehive')
  const beehiveHostnames = new PipelineHostnames(beehiveContext.hostnamePrefix, env)
  const honeypotContext = getContextByNamespace('honeypot')
  const honeypotHostnames = new PipelineHostnames(honeypotContext.hostnamePrefix, env)

  const buzzPipelineStack = new BuzzPipelineStack(app, `${namespace}-buzz-pipeline`, {
    hostnames: buzzHostnames,
    ...commonProps,
    ...buzzContext,
  })

  const beehivePipelineStack = new BeehivePipelineStack(app, `${namespace}-beehive-pipeline`, {
    hostnames: beehiveHostnames,
    honeycombHostnames,
    ...commonProps,
    ...beehiveContext,
  })

  const honeypotPipelineStack = new HoneypotPipelineStack(app, `${namespace}-honeypot-pipeline`, {
    hostnames: honeypotHostnames,
    ...commonProps,
    ...honeypotContext,
  })

  const honeycombPipelineStack = new HoneycombPipelineStack(app, `${namespace}-honeycomb-pipeline`, {
    hostnames: honeycombHostnames,
    buzzHostnames,
    beehiveHostnames,
    honeypotHostnames,
    ...commonProps,
    ...honeycombContext,
  })

  return { buzzPipelineStack, honeycombPipelineStack, honeypotPipelineStack }
}
