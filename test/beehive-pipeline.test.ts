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
    pipelineFoundationStack: lazyEval.pipelineFoundationStack,
    testFoundationStack: lazyEval.foundationStack,
    prodFoundationStack: lazyEval.foundationStack,
    namespace: 'test.pipelineProp.namespace',
    oauthTokenPath: 'test.pipelineProp.oauthTokenPath',
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    hostnamePrefix: 'test.pipelineProp.hostnamePrefix',
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
  }))

/*
   env: lazyEval.env,
    appRepoOwner: 'test.pipelineProp.appRepoOwner',
    appRepoName: 'test.pipelineProp.appRepoName',
    appSourceBranch: 'test.pipelineProp.appSourceBranch',
    infraRepoOwner: 'test.pipelineProp.infraRepoOwner',
    infraRepoName: 'test.pipelineProp.infraRepoName',
    infraSourceBranch: 'test.pipelineProp.infraSourceBranch',
    pipelineFoundationStack: lazyEval.pipelineFoundationStack,
    namespace: 'test.pipelineProp.namespace',
    testFoundationStack: lazyEval.foundationStack,
    prodFoundationStack: lazyEval.foundationStack,
//    .qaSpecPath',
    oauthTokenPath: 'test.pipelineProp.oauthTokenPath',
    hostnamePrefix: 'test.pipelineProp.hostnamePrefix',
    dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
    owner: 'test.pipelineProp.owner',
    contact: 'test.pipelineProp.contact',
 //   networkStackName: 'test.pipelineProp.networkStackName',
 //   domainStackName: 'test.pipelineProp.domainStackName',
 //   createDns: true,
 //   slackNotifyStackName: 'test.pipelineProp.slackstack',
 //   notificationReceivers: 'test.pipelineProp.notificationReceivers',
 */

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
    jest.doMock('../src/cdk-pipeline-deploy')
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
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
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
          'beehive:hostnamePrefix': 'test.pipelineProp.hostnamePrefix-prep', // Adds -test to the provided hostname
          'beehive:appDirectory': '$CODEBUILD_SRC_DIR_AppCode/build',
          infraDirectory: '$CODEBUILD_SRC_DIR',
        },
      }),
    )
  })

  test('calls the CDKPipelineProject with the correct properties to create the production deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../src/cdk-pipeline-deploy')
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
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
        dependsOnStacks: [],
        appBuildCommands: [
          'npm install',
          'npm run build',
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
  test('runs smoke test against prod stack', () => {
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

  test('Has and SNS approval topic', () => {
    expectCDK(lazyEval.subject).to(haveResource('AWS::SNS::Topic'))
  })
})
