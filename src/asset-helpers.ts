import { ContainerImage } from '@aws-cdk/aws-ecs'
import { DockerImageAsset, DockerImageAssetProps } from '@aws-cdk/aws-ecr-assets'
import * as fs from 'fs'
import * as path from 'path'
import { Annotations, Construct, Stack } from '@aws-cdk/core'

export class AssetHelpers {
  /**
   * Tries to get a ContainerImage from a DockerImageAsset. If unfound, it will add a stack error
   */
  static containerFromDockerfile (scope: Construct, id: string, props: DockerImageAssetProps): ContainerImage {
    const dockerFilePath = path.join(props.directory, props.file ?? '')
    if (!fs.existsSync(dockerFilePath)) {
      Annotations.of(scope).addError(`Cannot deploy this stack. Dockerfile not found at ${dockerFilePath}`)
      // The returned image shouldn't matter, since adding the error will prevent the stack from deploying
      return ContainerImage.fromRegistry('scratch')
    } else {
      const dockerImageAsset = new DockerImageAsset(scope, id, props)
      return ContainerImage.fromDockerImageAsset(dockerImageAsset)
    }
  }
}
