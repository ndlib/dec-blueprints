import { SynthUtils } from '@aws-cdk/assert'
import { PipelineProject } from '@aws-cdk/aws-codebuild'
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions'
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { IGrantable } from '@aws-cdk/aws-iam'
import { HostedZone } from '@aws-cdk/aws-route53'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { Construct, Stack } from '@aws-cdk/core'
import { mocked } from 'ts-jest/utils'
import { CDKPipelineDeploy, ICDKPipelineDeployProps } from '../src/cdk-pipeline-deploy'

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
 * Provides a function that can be passed as a mock constructor for the CDKPipelineDeploy project
 * such as in a mockImplementation call. We can do more to mock out the actual module later if it's
 * ever moved to ndlib-cdk.
 */
export const mockCDKPipelineDeploy = (scope: Construct, id: string, props: ICDKPipelineDeployProps) => {
  const mock = {
    project: { addToRolePolicy: jest.fn() },
    action: { actionProperties: { actionName: 'MockedCDKPipelineDeployAction' }, bind: jest.fn(() => ({ configuration: undefined })) },
  }
  return mock as unknown as CDKPipelineDeploy
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
