import { expect as expectCDK, objectLike, haveResourceLike, arrayWith, Capture, encodedJson } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { HoneypotPipelineStack, CDPipelineStackProps } from '../src/honeypot/honeypot-pipeline'
import { FoundationStack } from '../src/foundation-stack'
import { mocked } from 'ts-jest/utils'
import getGiven from 'givens'
import { CustomEnvironment } from '../src/custom-environment'
import { PipelineFoundationStack } from '../src/pipeline-foundation-stack'
import helpers = require('../test/helpers')

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
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    dockerhubCredentialsPath: 'test.context.dockerhubCredentialsPath',
  })

  lazyEval('env', () => ({
    name: 'test.env.name',
    domainName: 'test.env.domainName',
    domainStackName: 'test.env.domainStackName',
    networkStackName: 'test.env.networkStackName',
    createDns: true,
    region: 'test.env.region',
    account: 'test.env.account',
    useVpcId: 'test.env.useVpcId',
    slackNotifyStackName: 'test.env.slackNotifyStackName',
    createGithubWebhooks: false,
    useExistingDnsZone: false,
    notificationReceivers: 'test.env.notificationReceivers',
    alarmsEmail: 'test.env.alarmsEmail',
  }))
  lazyEval('app', () => new cdk.App())
  lazyEval('foundationStack', () => new FoundationStack(lazyEval.app, 'MyFoundationStack', { env: lazyEval.env, honeycombHostnamePrefix: 'honeycomb-test' }))
  lazyEval('pipelineFoundationStack', () => new PipelineFoundationStack(lazyEval.app, 'MyPipelineFoundationStack', { env: lazyEval.env }))
  lazyEval('pipelineProps', () => ({
    env: lazyEval.env,
    domainStackName: 'test.pipelineProp.domainStackName',
    networkStackName: 'test.pipelineProp.networkStackName',
    createDns: true,
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
  lazyEval('subject', () => new HoneypotPipelineStack(lazyEval.app, 'MyHoneypotPipelineStack', lazyEval.pipelineProps))

  test('test stage runs smoke tests that make requests to the test host, and over https', () => {
    // First make sure that the action sets a TARGET_HOST variable in the env to be the correct host name
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: arrayWith(objectLike({
        Name: 'Test',
        Actions: arrayWith(objectLike({
          Name: 'SmokeTests',
          Configuration: objectLike({
            EnvironmentVariables: encodedJson([{
              name: 'TARGET_HOST',
              type: 'PLAINTEXT',
              value: 'test.pipelineProp.hostnamePrefix-test.test.env.domainName',
            }]),
          }),
        })),
      })),
    }))

    // Then make sure that the build command runs newman with the same TARGET_HOST as the app-host
    const buildCommands = Capture.anyType()
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      ServiceRole: {
        'Fn::GetAtt': [
          'testpipelinePropnamespaceSmokeTestsRoleE1D617EA',
          'Arn',
        ],
      },
      Source: {
        BuildSpec: encodedJson(objectLike({
          phases: objectLike({
            build: {
              commands: buildCommands.capture(),
            },
          }),
        })),
      },
    }))
    const regex = /newman run .* --env-var app-host=\${TARGET_HOST} --env-var host-protocol=https/
    expect(buildCommands.capturedValue[0]).toEqual(expect.stringMatching(regex))
  })

  test('smoke tests uses the newman image and gets dockerhub credentials from context', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodeBuild::Project', {
      Environment: {
        Image: 'postman/newman:5',
        RegistryCredential: {
          Credential: 'test.context.dockerhubCredentialsPath',
          CredentialProvider: 'SECRETS_MANAGER',
        },
      },
    }))
  })

  test('calls the CDKPipelineProject with the correct properties to create the test deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../src/cdk-pipeline-deploy')
    const CDKPipelineDeploy = (await import('../src/cdk-pipeline-deploy')).CDKPipelineDeploy
    const HoneypotPipelineStack = (await import('../src/honeypot/honeypot-pipeline')).HoneypotPipelineStack
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new HoneypotPipelineStack(lazyEval.app, 'MyHoneypotPipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployTest', // Creates a CodeBuild project with an id of namespace-DeployTest
      expect.objectContaining({
        namespace: 'test.pipelineProp.namespace-test', // Adds -test to the provided namespace
        targetStack: 'test.pipelineProp.namespace-test-honeypot', // Targets the test stack
        contextEnvName: 'test.env.name',
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
        additionalContext: {
          'honeypot:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
          'honeypot:hostnamePrefix': 'test.pipelineProp.hostnamePrefix-test', // Adds -test to the provided hostname
          createDns: 'true',
          domainStack: 'test.env.domainStackName',
          infraDirectory: '$CODEBUILD_SRC_DIR',
          networkStack: 'test.env.networkStackName',
          owner: 'test.pipelineProp.owner',
          contact: 'test.pipelineProp.contact',
        },
      }),
    )
  })

  test('calls the CDKPipelineProject with the correct properties to create the prod deployment', async () => {
    // Mock the pipeine deploy then reimport its dependencies
    jest.doMock('../src/cdk-pipeline-deploy')
    const CDKPipelineDeploy = (await import('../src/cdk-pipeline-deploy')).CDKPipelineDeploy
    const HoneypotPipelineStack = (await import('../src/honeypot/honeypot-pipeline')).HoneypotPipelineStack
    const MockedCDKPipelineDeploy = mocked(CDKPipelineDeploy, true)
    MockedCDKPipelineDeploy.mockImplementation(helpers.mockCDKPipelineDeploy)

    // Must instantiate the stack in this scope or the mock won't work
    const subject = new HoneypotPipelineStack(lazyEval.app, 'MyHoneypotPipelineStack', lazyEval.pipelineProps)

    // A lot of this should be separated out into different expectations/tests, but manual mocking
    // of the local module is pretty painful, so doing this all in one shot. Adding some comments
    // to call out some of the expectations
    expect(MockedCDKPipelineDeploy).toHaveBeenCalledWith(
      expect.any(Object),
      'test.pipelineProp.namespace-DeployProd', // Creates a CodeBuild project with an id of namespace-DeployProd
      expect.objectContaining({
        namespace: 'test.pipelineProp.namespace-prod', // Adds -prod to the provided namespace
        targetStack: 'test.pipelineProp.namespace-prod-honeypot', // Targets the prod stack
        contextEnvName: 'test.env.name',
        dockerhubCredentialsPath: 'test.pipelineProp.dockerhubCredentialsPath',
        additionalContext: {
          'honeypot:appDirectory': '$CODEBUILD_SRC_DIR_AppCode',
          'honeypot:hostnamePrefix': 'test.pipelineProp.hostnamePrefix', // Uses the provided hostname without modification
          createDns: 'true',
          domainStack: 'test.env.domainStackName',
          infraDirectory: '$CODEBUILD_SRC_DIR',
          networkStack: 'test.env.networkStackName',
          owner: 'test.pipelineProp.owner',
          contact: 'test.pipelineProp.contact',
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

  test('test stage runs actions in the following order: deploy->smoke tests->approval', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: arrayWith(objectLike({
        Name: 'Test',
        Actions: [
          objectLike({
            Name: 'Deploy',
            RunOrder: 1,
          }),
          objectLike({
            Name: 'SmokeTests',
            RunOrder: 98,
          }),
          objectLike({
            Name: 'Approval',
            RunOrder: 99,
          }),
        ],
      })),
    }))
  })

  test('production stage runs actions in the following order: deploy', () => {
    expectCDK(lazyEval.subject).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: arrayWith(objectLike({
        Name: 'Production',
        Actions: [
          objectLike({
            Name: 'Deploy',
            RunOrder: 1,
          }),
        ],
      })),
    }))
  })
})
