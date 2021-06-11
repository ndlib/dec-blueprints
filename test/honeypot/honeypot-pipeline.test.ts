/* eslint-disable import/first */
/* eslint-disable no-unused-expressions */
import { mocked } from 'ts-jest/utils'

jest.doMock('../../src/pipeline-constructs/rails-pipeline')
import { RailsPipeline } from '../../src/pipeline-constructs/rails-pipeline'
const MockedRailsPipeline = mocked(RailsPipeline, true)

import { expect as expectCDK, haveResource } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { HoneypotPipelineStack, CDPipelineStackProps } from '../../src/honeypot/honeypot-pipeline'
import { FoundationStack } from '../../src/foundation-stack'
import getGiven from 'givens'
import { CustomEnvironment } from '../../src/custom-environment'
import { PipelineFoundationStack } from '../../src/pipeline-foundation-stack'
import { PipelineHostnames } from '../../src/pipeline-constructs/hostnames'

// A set of variables that won't get set until used
interface lazyEvals {
  env: CustomEnvironment
  app: cdk.App
  foundationStack: FoundationStack
  pipelineFoundationStack: PipelineFoundationStack
  subject: HoneypotPipelineStack
  pipelineProps: CDPipelineStackProps
}
const lazyEval = getGiven<lazyEvals>()

describe('HoneypotPipeline', () => {
  lazyEval('env', () => ({
    name: 'test.env.name',
    domainName: 'test.env.domainName',
    domainStackName: 'test.env.domainStackName',
    networkStackName: 'test.env.networkStackName',
    region: 'test.env.region',
    account: 'test.env.account',
    createDns: true,
    useVpcId: 'test.env.useVpcId',
    slackNotifyStackName: 'test.env.slackNotifyStackName',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test.env.notificationReceivers',
    alarmsEmail: 'test.env.alarmsEmail',
    databaseConnectSG: 'test.env.databaseConnectSG',
  }))
  lazyEval('app', () => new cdk.App())
  lazyEval('foundationStack', () => new FoundationStack(lazyEval.app, 'MyFoundationStack', { env: lazyEval.env, honeycombHostnamePrefix: 'honeycomb-test' }))
  lazyEval('pipelineFoundationStack', () => new PipelineFoundationStack(lazyEval.app, 'MyPipelineFoundationStack', { env: lazyEval.env }))
  lazyEval('pipelineProps', () => ({
    env: lazyEval.env,
    appRepoOwner: 'test.pipelineProp.appRepoOwner',
    appRepoName: 'test.pipelineProp.appRepoName',
    appSourceBranch: 'test.pipelineProp.appSourceBranch',
    infraRepoOwner: 'test.pipelineProp.infraRepoOwner',
    infraRepoName: 'test.pipelineProp.infraRepoName',
    infraSourceBranch: 'test.pipelineProp.infraSourceBranch',
    pipelineFoundationStack: lazyEval.pipelineFoundationStack,
    testFoundationStack: lazyEval.foundationStack,
    prodFoundationStack: lazyEval.foundationStack,
    namespace: 'test.pipelineProp.namespace',
    oauthTokenPath: 'test.pipelineProp.oauthTokenPath',
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    hostnames: new PipelineHostnames('test.pipelineProp.hostnamePrefix', lazyEval.env),
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
  }))
  lazyEval('subject', () => new HoneypotPipelineStack(lazyEval.app, 'MyHoneypotPipelineStack', lazyEval.pipelineProps))

  describe('creates a RailsPipeline', () => {
    test('with the correct application source', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          appSource: {
            branch: 'test.pipelineProp.appSourceBranch',
            oauthToken: expect.any(Object),
            owner: 'test.pipelineProp.appRepoOwner',
            repo: 'test.pipelineProp.appRepoName',
          },
        }),
      )
    })

    test('with the correct infrastructure source', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          infraSource: {
            branch: 'test.pipelineProp.infraSourceBranch',
            oauthToken: expect.any(Object),
            owner: 'test.pipelineProp.infraRepoOwner',
            repo: 'test.pipelineProp.infraRepoName',
          },
        }),
      )
    })

    test('with the correct test stage', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          testStage: {
            additionalDeployContext: expect.any(Object),
            configPath: '/all/test.pipelineProp.namespace-test-honeypot',
            databaseSecurityGroup: expect.any(Object),
            hostname: 'test.pipelineProp.hostnamePrefix-test.test.env.domainName',
            namespace: 'test.pipelineProp.namespace-test',
            onDeployCreated: expect.any(Function),
            stackname: 'test.pipelineProp.namespace-test-honeypot',
            vpc: expect.any(Object),
          },
        }),
      )
    })

    test('with the correct production stage', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          prodStage: {
            additionalDeployContext: expect.any(Object),
            configPath: '/all/test.pipelineProp.namespace-prod-honeypot',
            databaseSecurityGroup: expect.any(Object),
            hostname: 'test.pipelineProp.hostnamePrefix.test.env.domainName',
            namespace: 'test.pipelineProp.namespace-prod',
            onDeployCreated: expect.any(Function),
            stackname: 'test.pipelineProp.namespace-prod-honeypot',
            vpc: expect.any(Object),
          },
        }),
      )
    })

    test('that will push containers to the Honeypot ECR from the pipeline foundation', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          ecr: lazyEval.pipelineFoundationStack.ecrs.Honeypot,
        }),
      )
    })

    test('that uses the same ECR overrides as the target stack expects for the rails container', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          containers: [expect.objectContaining({
            ecrNameContextOverride: 'honeypot:RailsEcrName',
            ecrTagContextOverride: 'honeypot:RailsEcrTag',
          })],
        }),
      )
    })

    test('with the correct path to the collection for applications smoke tests', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          smokeTestPath: 'spec/postman/spec.json',
        }),
      )
    })

    test('that puts its artifacts in the pipeline foundation stacks artifact bucket', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          artifactBucket: lazyEval.pipelineFoundationStack.artifactBucket,
        }),
      )
    })

    test('that will deploy the stacks to the given environment', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          env: lazyEval.env,
        }),
      )
    })

    test('with the given owner, contact, and namespace', async () => {
      lazyEval.subject
      expect(MockedRailsPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        'DeploymentPipeline',
        expect.objectContaining({
          contact: 'test.pipelineProp.contact',
          namespace: 'test.pipelineProp.namespace',
          owner: 'test.pipelineProp.owner',
        }),
      )
    })
  })
})
