import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../src/foundation-stack'
import { BeehivePipelineStack, CDPipelineStackProps } from '../src/beehive/beehive-pipeline'
import { expect as expectCDK, objectLike, haveResourceLike, haveResource, arrayWith, stringLike } from '@aws-cdk/assert'
import { mocked } from 'ts-jest/utils'
import getGiven from 'givens'
import { CustomEnvironment } from '../src/custom-environment'
import { PipelineHostnames } from '../src/pipeline-constructs/hostnames'
import helpers = require('../test/helpers')

// A set of variables that won't get set until used
interface lazyEvals {
  env: CustomEnvironment
  app: cdk.App
  foundationStack: FoundationStack
  subject: BeehivePipelineStack
  pipelineProps: CDPipelineStackProps
}
const lazyEval = getGiven<lazyEvals>()

describe('BeehivePipeline', () => {
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    dockerhubCredentialsPath: 'test.context.dockerhubCredentialsPath',
  })
  lazyEval('app', () => new cdk.App())
  lazyEval('env', () => ({
    name: 'test.env.name',
    domainName: 'test.env.domainName',
    domainStackName: 'test.env.domainStackName',
    networkStackName: 'test.env.networkStackName',
    region: 'test.env.region',
    account: 'test.env.account',
    createDns: true,
    slackNotifyStackName: 'test.env.slackNotifyStackName',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test.env.notificationReceivers',
    alarmsEmail: 'test.env.alarmsEmail',
    oauthTokenPath: 'test.env.oauthTokenPath',
    databaseConnectSG: 'test.env.databaseConnectSG',
  }))
  lazyEval('foundationStack', () => new FoundationStack(lazyEval.app, 'MyFoundationStack', {
    env: lazyEval.env,
    honeycombHostnamePrefix: 'honeycomb-test',
  }))
  lazyEval('pipelineProps', () => ({
    env: lazyEval.env,
    appRepoOwner: 'test.pipelineProp.appRepoOwner',
    appRepoName: 'test.pipelineProp.appRepoName',
    appSourceBranch: 'test.pipelineProp.appSourceBranch',
    infraRepoOwner: 'test.pipelineProp.infraRepoOwner',
    infraRepoName: 'test.pipelineProp.infraRepoName',
    infraSourceBranch: 'test.pipelineProp.infraSourceBranch',
    foundationStack: lazyEval.foundationStack,
    namespace: 'test.pipelineProp.namespace',
    qaSpecPath: 'test.pipelineProp.qaSpecPath',
    oauthTokenPath: 'test.pipelineProp.oauthTokenPath',
    hostnames: new PipelineHostnames('test.pipelineProp.hostnamePrefix', lazyEval.env),
    honeycombHostnames: new PipelineHostnames('test.pipelineProp.honeycombHostnamePrefix', lazyEval.env),
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
    networkStackName: 'test.pipelineProp.networkStackName',
    domainStackName: 'test.pipelineProp.domainStackName',
    createDns: true,
    slackNotifyStackName: 'test.pipelineProp.slackstack',
    notificationReceivers: 'test.pipelineProp.notificationReceivers',
    testFoundationStack: lazyEval.foundationStack,
    prodFoundationStack: lazyEval.foundationStack,
  }))
  lazyEval('subject', () => new BeehivePipelineStack(lazyEval.app, 'MyBeehivePipelineStack', lazyEval.pipelineProps))

  test('uses encrypted artifact bucket', () => {
    // const pipelineStack = subject()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
            },
          },
        ],
      },
    }))
  })

  test('calls the CDKPipelineProject with the correct properties to create the test deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../src/pipeline-constructs/cdk-deploy')
    const CDKPipelineDeploy = (await import('../src/pipeline-constructs/cdk-deploy')).CdkDeploy
    const BeehivePipelineStack = (await import('../src/beehive/beehive-pipeline')).BeehivePipelineStack
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new BeehivePipelineStack(lazyEval.app, 'MyBeehivePipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployTest', // Creates a CodeBuild project with an id of namespace-DeployTest
      expect.objectContaining({
        contextEnvName: 'test.env.name',
        targetStack: 'test.pipelineProp.namespace-test-beehive', // Targets the test stack
        dockerCredentials: expect.any(Object),
        dependsOnStacks: [],
        appBuildCommands: [
          'npm install -g yarn',
          'yarn install',
          'yarn build',
        ],
        namespace: 'test.pipelineProp.namespace-test', // Adds -test to the provided namespace
        additionalContext: {
          owner: 'test.pipelineProp.owner',
          contact: 'test.pipelineProp.contact',
          networkStack: 'test.env.networkStackName',
          domainStack: 'test.env.domainStackName',
          createDns: 'true',
          'beehive:hostnamePrefix': 'test.pipelineProp.hostnamePrefix-test', // Adds -test to the provided hostname
          'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
          infraDirectory: '$CODEBUILD_SRC_DIR',
        },
        additionalEnvironmentVariables: {
          // Adds -test to the provided hostnames
          PUBLIC_URL: { value: 'https://test.pipelineProp.hostnamePrefix-test.test.env.domainName' },
          HONEYCOMB_URL: { value: 'https://test.pipelineProp.honeycombHostnamePrefix-test.test.env.domainName' },
        },
      }),
    )
  })

  test('calls the CDKPipelineProject with the correct properties to create the production deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../src/pipeline-constructs/cdk-deploy')
    const CDKPipelineDeploy = (await import('../src/pipeline-constructs/cdk-deploy')).CdkDeploy
    const BeehivePipelineStack = (await import('../src/beehive/beehive-pipeline')).BeehivePipelineStack
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new BeehivePipelineStack(lazyEval.app, 'MyBeehivePipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployProd', // Creates a CodeBuild project with an id of namespace-DeployProd
      expect.objectContaining({
        contextEnvName: 'test.env.name',
        targetStack: 'test.pipelineProp.namespace-prod-beehive', // Targets the prod stack
        dockerCredentials: expect.any(Object),
        dependsOnStacks: [],
        appBuildCommands: [
          'npm install -g yarn',
          'yarn install',
          'yarn build',
        ],
        namespace: 'test.pipelineProp.namespace-prod', // Adds -prod to the provided namespace
        additionalContext: {
          owner: 'test.pipelineProp.owner',
          contact: 'test.pipelineProp.contact',
          networkStack: 'test.env.networkStackName',
          domainStack: 'test.env.domainStackName',
          createDns: 'true',
          'beehive:hostnamePrefix': 'test.pipelineProp.hostnamePrefix',
          'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
          infraDirectory: '$CODEBUILD_SRC_DIR',
        },
        additionalEnvironmentVariables: {
          PUBLIC_URL: { value: 'https://test.pipelineProp.hostnamePrefix.test.env.domainName' },
          HONEYCOMB_URL: { value: 'https://test.pipelineProp.honeycombHostnamePrefix.test.env.domainName' },
        },
      }),
    )
  })

  test('creates a CodePipeline with stages in the following order: Source->Test->Production', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', objectLike({
      Stages: [
        objectLike({
          Name: 'Source',
        }),
        objectLike({
          Name: 'Test',
        }),
        objectLike({
          Name: 'Production',
        }),
      ],
    })))
  })

  test('runs smoke test against test stack', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman:5',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'StaticHostSmokeTestsTestRoleF3DD8E52',
          'Arn',
        ],
      },
    }))
  })
  test('runs smoke test against prod stack', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman:5',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'StaticHostSmokeTestsProdRole8965C9BD',
          'Arn',
        ],
      },
    }))
  })

  test('Has and SNS approval topic', () => {
    expectCDK(lazyEval.subject).to(haveResource('AWS::SNS::Topic'))
  })
})
