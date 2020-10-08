import * as cdk from '@aws-cdk/core'
import { SharedServiceStackProps } from './shared-stack-props'

export interface HoneycombStackProps extends SharedServiceStackProps {}

export class HoneycombStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props: HoneycombStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here
  }
}
