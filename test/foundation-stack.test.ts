import { expect as expectCDK, MatchStyle, matchTemplate } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { FoundationStack } from '../lib/foundation-stack'

test('Empty Stack', () => {
  const app = new cdk.App()
  // WHEN
  const stack = new FoundationStack(app, 'MyFoundationStack')
  // THEN
  expectCDK(stack).to(matchTemplate({
    Resources: {
      logBucket1FE17E85: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          AccessControl: 'LogDeliveryWrite',
          LifecycleConfiguration: {
            Rules: [
              {
                ExpirationInDays: 365,
                NoncurrentVersionExpirationInDays: 1,
                Status: 'Enabled',
              },
            ],
          },
          VersioningConfiguration: {
            Status: 'Enabled',
          },
        },
        UpdateReplacePolicy: 'Retain',
        DeletionPolicy: 'Retain',
      },
    },
  }, MatchStyle.EXACT))
})
