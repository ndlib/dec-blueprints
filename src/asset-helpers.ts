import { ContainerImage } from '@aws-cdk/aws-ecs'
import { Repository } from '@aws-cdk/aws-ecr'
import { DockerImageAsset, DockerImageAssetProps } from '@aws-cdk/aws-ecr-assets'
import * as fs from 'fs'
import * as path from 'path'
import { Annotations, Construct } from '@aws-cdk/core'
import { ISource, Source } from '@aws-cdk/aws-s3-deployment'

export interface GetContainerImageProps extends DockerImageAssetProps {
  /**
   * If this override is found in context, will attempt to get the container image from
   * the given ECR tag instead of from a file.
   */
  readonly ecrTagContextOverride: string

  /**
   * If this override is found in context, will attempt to get the container image from
   * the given ECR name instead of from a file.
   */
  readonly ecrNameContextOverride: string
}

export class AssetHelpers {
  /**
   * Gets a container image either via context override if one was given, or from a local file
   * when a context override was not given
   *
   */
  static getContainerImage (scope: Construct, id: string, props: GetContainerImageProps): ContainerImage {
    if (props.ecrNameContextOverride && props.ecrTagContextOverride) {
      const ecrTag = scope.node.tryGetContext(props.ecrTagContextOverride)
      const ecrName = scope.node.tryGetContext(props.ecrNameContextOverride)
      if (ecrName && ecrTag) {
        Annotations.of(scope).addInfo(`AssetHelpers attempting to use '${ecrName}:${ecrTag}' for ${id}.`)
        const repo = Repository.fromRepositoryName(scope, id, ecrName)
        return ContainerImage.fromEcrRepository(repo, ecrTag)
      }
    }
    return this.containerFromDockerfile(scope, id, props)
  }

  /**
   * Tries to get a ContainerImage from a DockerImageAsset. If unfound, it will add a stack error
   *
   */
  static containerFromDockerfile (scope: Construct, id: string, props: DockerImageAssetProps): ContainerImage {
    const dockerFilePath = path.join(props.directory, props.file ?? '')
    if (!fs.existsSync(dockerFilePath)) {
      Annotations.of(scope).addError(`Cannot deploy this stack. Dockerfile not found at ${dockerFilePath}`)
      // The returned image shouldn't matter, since adding the error will prevent the stack from deploying
      return ContainerImage.fromRegistry('scratch')
    } else {
      Annotations.of(scope).addInfo(`AssetHelpers attempting to build from '${dockerFilePath} for ${id}.`)
      const dockerImageAsset = new DockerImageAsset(scope, id, props)
      return ContainerImage.fromDockerImageAsset(dockerImageAsset)
    }
  }

  /**
   * Tries to get a S3 Bucket deployment source from a directory. If unfound, it will add a stack error,
   * and return an empty Source.
   */
  static s3SourceFromAsset = (scope: Construct, sourceFilePath: string): ISource => {
    if (!fs.existsSync(sourceFilePath)) {
      Annotations.of(scope).addError(`Cannot deploy this stack. Bucket deployment source not found ${sourceFilePath}`)
      return Source.asset('/var/empty')
    }
    return Source.asset(sourceFilePath)
  }
}
