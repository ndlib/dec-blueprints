import { SynthUtils } from '@aws-cdk/assert'
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { HostedZone } from '@aws-cdk/aws-route53'
import { Stack } from '@aws-cdk/core'

export const mockHostedZoneFromLookup = (response?: any) => {
  jest.mock('@aws-cdk/aws-route53')
  const mockFromLookup = jest.spyOn(HostedZone, 'fromLookup')
  mockFromLookup.mockImplementation((scope, id, query) => {
    return response ?? {
      hostedZoneId: 'mockHostedZone-id',
      zoneName: 'mockHostedZone-name',
    }
  })
}

/**
 * Synthesizes the given stack in test and returns the properties for the given
 * logical id.
 * @param stack The stack to synth
 */
export const getPropertiesByLogicalId = (stack: Stack, logicalId: string) => {
  const template = SynthUtils.synthesize(stack).template
  if (template.Resources[logicalId] === undefined) {
    throw new Error(`${logicalId} not found in ${stack.stackName}.Resources.\n${JSON.stringify(template.Resources, null, 2)}`)
  }
  return template.Resources[logicalId].Properties
}
