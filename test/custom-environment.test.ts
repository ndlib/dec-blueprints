import { App } from '@aws-cdk/core'
import { CustomEnvironment } from '../lib/custom-environment'

describe('CustomEnvironment', () => {
  test('returns the correct object and adds the environment name', () => {
    const contextObject = {
      environments: {
        test: {
          name: 'test',
          account: 'accountValue',
          region: 'regionValue',
          createDns: true,
          domainName: 'domainNameValue',
          domainStackName: 'domainStackValue',
          useExistingDnsZone: true,
          slackNotifyStackName: 'slackNotifyStackNameValue',
          createGithubWebhooks: false,
        },
      },
    }
    process.env.CDK_CONTEXT_JSON = JSON.stringify(contextObject)
    const app = new App()
    const testEnvironment = CustomEnvironment.fromContext(app.node, 'test')
    expect(testEnvironment).toEqual(contextObject.environments.test)
  })

  test('throws an exception if environments is not defined in context', () => {
    const contextObject = {
      environment: {
        test: {
          name: 'test',
          account: 'accountValue',
          region: 'regionValue',
          createDns: true,
          domainName: 'domainNameValue',
          domainStackName: 'domainStackValue',
          useExistingDnsZone: true,
          slackNotifyStackName: 'slackNotifyStackNameValue',
          createGithubWebhooks: false,
        },
      },
    }
    process.env.CDK_CONTEXT_JSON = JSON.stringify(contextObject)
    const app = new App()
    expect(() => CustomEnvironment.fromContext(app.node, 'test'))
      .toThrow("Context key 'environments' is required.")
  })

  test('throws an exception if the name given is not defined in environments context', () => {
    const contextObject = {
      environments: {
        test: {
          name: 'test',
          account: 'accountValue',
          region: 'regionValue',
          createDns: true,
          domainName: 'domainNameValue',
          domainStackName: 'domainStackValue',
          useExistingDnsZone: true,
          slackNotifyStackName: 'slackNotifyStackNameValue',
          createGithubWebhooks: false,
        },
      },
    }
    process.env.CDK_CONTEXT_JSON = JSON.stringify(contextObject)
    const app = new App()
    expect(() => CustomEnvironment.fromContext(app.node, 'prod'))
      .toThrow("Context key 'environments.prod' is required.")
  })
})
