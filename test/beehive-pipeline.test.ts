import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../src/foundation-stack'
import { BeehivePipelineStack, CDPipelineStackProps} from '../src/beehive/beehive-pipeline'
import { expect as expectCDK, objectLike, haveResourceLike, haveResource, arrayWith, stringLike } from '@aws-cdk/assert'
import { mocked } from 'ts-jest/utils'
import getGiven from 'givens'
import helpers = require('../test/helpers')
import { CustomEnvironment } from '../src/custom-environment'

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

  //const app = new cdk.App()

  lazyEval('env', () => ({
  //const env = {
    name: 'test',
    domainName: 'test.edu',
    domainStackName: 'test-edu-domain',
    networkStackName: 'test-network',
    region: 'test-region',
    account: 'test-account',
    createDns: true,
    slackNotifyStackName: 'slack-test',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test@test.edu',
    alarmsEmail: 'test@test.edu',
    oauthTokenPath: 'test-oauthTokenPath',
  }))

  lazyEval('foundationStack', () => new FoundationStack(lazyEval.app, 'MyFoundationStack', { env: lazyEval.env }))

//  const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })

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
    hostnamePrefix: 'test.pipelineProp.hostnamePrefix',
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
    networkStackName: 'test.pipelineProp.networkStackName',
    domainStackName: 'test.pipelineProp.domainStackName',
    createDns: true,
    slackNotifyStackName: 'test.pipelineProp.slackstack',
    notificationReceivers: 'test.pipelineProp.notificationReceivers',
  }))

  lazyEval('subject', () => new BeehivePipelineStack(lazyEval.app, 'MyBeehivePipelineStack', lazyEval.pipelineProps))

  xtest('uses encrypted artifact bucket', () => {
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
    jest.doMock('../src/cdk-pipeline-deploy')
    const CDKPipelineDeploy = (await import('../src/cdk-pipeline-deploy')).CDKPipelineDeploy
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
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
        infraSourceArtifact,
        appSourceArtifact,
        dependsOnStacks: [],
        appBuildCommands: [
          'npm install',
          'npm run build',
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
      }),
    )
  })


xtest('creates a CodePipeline with stages in the following order: Source->Test->Production', () => {
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

  test.todo('deploy prod stack')

  xtest('runs smoke test against test stack', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'StaticHostSmokeTestsTestRoleF3DD8E52',
          'Arn',
        ],
      },
    }))
  })
  test.todo('waits for approval at test stage')
  xtest('runs smoke test against prod stack', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman',
      },
      ServiceRole: {
        'Fn::GetAtt': [
          'StaticHostSmokeTestsProdRole8965C9BD',
          'Arn',
        ],
      },
    }))
  })

  xtest('Has and SNS approval topic', () => {
    expectCDK(lazyEval.subject).to(haveResource('AWS::SNS::Topic'))
  })
})
