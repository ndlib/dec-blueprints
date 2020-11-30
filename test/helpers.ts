/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { IGrantable } from '@aws-cdk/aws-iam'
import { HostedZone } from '@aws-cdk/aws-route53'
import { ISecret, Secret } from '@aws-cdk/aws-secretsmanager'
import { SecretValue } from '@aws-cdk/core'
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
      secretName: 'test-secret',
      grantRead: (grantee: IGrantable) => (grantee),
    }
  },
  )
}
