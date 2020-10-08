import * as cdk from '@aws-cdk/core'
import { SharedServiceStackProps } from './shared-stack-props'

export interface HoneypotStackProps extends SharedServiceStackProps {}

export class HoneypotStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props: HoneypotStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here
  }
}
