import { Secret } from '@aws-cdk/aws-ecs'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { Construct, Stack } from '@aws-cdk/core'

export class ECSSecretsHelper {
  /**
   * A helper for getting SSM keys that are managed outside of this application. Assumes the parameter path is
   * enforcing the /all/stackname/key pattern. Do not use this for SSM parameters that are defined by this
   * application, use Secret.fromSsmParameter(secretParameter) directly instead.
   *
   * @param scope Scope of the ECS task
   * @param task Used for uniquely naming the secret to the task it's associated with
   * @param key The key to find under the /all/stackname path
   */
  static fromSSM (scope: Construct, task: string, key: string):Secret {
    const stackName = Stack.of(scope).stackName
    const secretParameter = StringParameter.fromSecureStringParameterAttributes(scope, `${task}${key}`, {
      parameterName: `/all/${stackName}/${key}`,
      version: 1,
    })
    return Secret.fromSsmParameter(secretParameter)
  }
}
