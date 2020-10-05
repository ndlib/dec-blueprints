import * as cdk from '@aws-cdk/core'

export interface FoundationStackProps extends cdk.StackProps {}

export class FoundationStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props?: FoundationStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here
  }
}
