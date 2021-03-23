import { Construct, Stack, StackProps, RemovalPolicy } from '@aws-cdk/core'
import { ArtifactBucket } from '@ndlib/ndlib-cdk'
import { BucketEncryption } from '@aws-cdk/aws-s3'
import { Repository, TagMutability } from '@aws-cdk/aws-ecr'

export class PipelineFoundationStack extends Stack {
  /**
   * Shared bucket for holding pipeline artifacts
   */
  public readonly artifactBucket: ArtifactBucket
  public readonly ecrs: { [key: string]: Repository }

  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)
    this.artifactBucket = new ArtifactBucket(this, 'Bucket', {
      encryption: BucketEncryption.KMS_MANAGED,
    })
    this.ecrs = {}
  }

  /**
   * Adds a repo to the foundation stack that can be used by pipelines and service stacks.
   * Note: You will still be expected to push images to this repo before trying to use it
   * in a service stack. This is added to the foundation only to create a logical space
   * where it will persist beyond the services and pipelines.
   *
   * @param id The id to use for the repo
   */
  public addEcr (id: string) : Repository {
    const repo = new Repository(this, id, {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.IMMUTABLE,
    })
    this.ecrs[id] = repo
    return repo
  }
}
