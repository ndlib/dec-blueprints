import * as cdk from '@aws-cdk/core'
import { SharedServiceStackProps } from './shared-stack-props'

export interface BeehiveStackProps extends SharedServiceStackProps {}

export class BeehiveStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props: BeehiveStackProps) {
    super(scope, id, props)

    // The code that defines your stack goes here
  }
}
