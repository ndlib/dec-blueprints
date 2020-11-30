/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { HostedZone } from '@aws-cdk/aws-route53'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import cxapi = require('@aws-cdk/cx-api')

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

export const mockDockerCredentials = (response?: any) => {
  jest.mock('@aws-cdk/aws-secretsmanager')
  const mockCredentialsFromLookup = jest.spyOn(Secret, 'fromSecretNameV2')
  mockCredentialsFromLookup.mockImplementation((scope, id, query) => {
    return response ?? {
      username: 'username',
      password: 'password',
    }
  })
}
