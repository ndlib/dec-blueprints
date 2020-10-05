import * as cdk from '@aws-cdk/core'
import { SharedServiceStackProps } from './shared-stack-props'

export interface BuzzStackProps extends SharedServiceStackProps {}

export class BuzzStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props: BuzzStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here
  }
}
