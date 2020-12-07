import { expect as expectCDK, haveResource, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { HoneypotPipelineStack } from '../../lib/honeypot/honeypot-pipeline'
import { getContextByNamespace } from '../../lib/context-helpers'
import { FoundationStack } from '../../lib/foundation-stack'
import helpers = require('../../test/helpers')

describe('CodeBuild actions', () => {
  beforeEach(() => {
    helpers.mockDockerCredentials()
  })
  const stack = () => {
    const app = new cdk.App()
    // WHEN
    const env = {
      name: 'test',
      domainName: 'test.edu',
      domainStackName: 'test-edu-domain',
      networkStackName: 'test-network',
      region: 'test-region',
      account: 'test-account',
      createDns: true,
      useVpcId: '123456',
      slackNotifyStackName: 'slack-test',
      createGithubWebhooks: false,
      useExistingDnsZone: false,
      notificationReceivers: 'test@test.edu',
      alarmsEmail: 'test@test.edu',
      oauthTokenPath: '/path/to/oauth',
      dockerCredentialsPath: '/all/dockerhub/credentials',
    }
    const hostnamePrefix = 'honeypot-test'
    const honeypotContext = getContextByNamespace('honeypot')
    const foundationStack = new FoundationStack(app, 'MyFoundationStack', { env })

    return new HoneypotPipelineStack(app, 'MyHoneypotPipelineStack', {
      env,
      foundationStack,
      hostnamePrefix,
      ...honeypotContext,
      namespace: 'testNamespace',
      appSourceArtifact: 'testAppArtifact',
    })
  }
  // Check for Desired resources with proper configurations

  test('test for codebuild project', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodeBuild::Project', {
    }))
  })
})
