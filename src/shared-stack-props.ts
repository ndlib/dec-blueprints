import { StackProps } from '@aws-cdk/core'
import { FoundationStack } from './foundation-stack'

/**
 * A set of properties that are commonly used by service stacks
 */
export interface SharedServiceStackProps extends StackProps {
  foundationStack?: FoundationStack
}
