#!/usr/bin/env node
import 'source-map-support/register'
import { App, Aspects } from '@aws-cdk/core'
import { StackTags } from '@ndlib/ndlib-cdk'
import { getRequiredContext } from '../src/context-helpers'
import { CustomEnvironment } from '../src/custom-environment'
import * as services from './services'
import * as pipelines from './pipelines'

const app = new App()

const stackType = getRequiredContext(app.node, 'stackType')
const namespace = getRequiredContext(app.node, 'namespace')
const envName = getRequiredContext(app.node, 'env')
const env = CustomEnvironment.fromContext(app.node, envName)

switch (stackType) {
  case 'service':
    services.instantiateStacks(app, namespace, env)
    break
  case 'pipeline':
    {
      // We need to instantiate all test and prod stacks here in the same way that the pipelines
      // will deploy them. This is just so that cdk will be aware of the dependencies and create
      // the required exports on the foundation stacks.
      const testStacks = services.instantiateStacks(app, `${namespace}-test`, env)
      const prodStacks = services.instantiateStacks(app, `${namespace}-prod`, env)
      pipelines.instantiateStacks(app, namespace, env, testStacks, prodStacks)
    }
    break
  default:
    throw new Error(`Context key stackType must be on of 'service' or 'pipeline'. Got ${stackType}.`)
}

Aspects.of(app).add(new StackTags())
