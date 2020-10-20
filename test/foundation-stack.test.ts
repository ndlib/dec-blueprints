import { expect as expectCDK, haveResource } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../lib/foundation-stack'
import helpers = require('../test/helpers')

describe('when useExistingDnsZone is true', () => {
  beforeEach(() => {
    helpers.mockHostedZoneFromLookup()
  })

  const stack = () => {
    const app = new cdk.App()
    return new FoundationStack(app, 'MyTestStack', {
      domainStackName: 'test-edu=domain',
      domainName: 'test.edu',
      useExistingDnsZone: true,
    })
  }

  test('does not create a Route53 Zone', () => {
    const newStack = stack()
    expectCDK(newStack).notTo(haveResource('AWS::Route53::HostedZone'))
  })
})
