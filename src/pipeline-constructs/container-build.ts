import { Construct } from '@aws-cdk/core'
import { BuildSpec, BuildEnvironmentVariableType, PipelineProject, LinuxBuildImage } from '@aws-cdk/aws-codebuild'
import { ISecret } from '@aws-cdk/aws-secretsmanager'
import { Repository } from '@aws-cdk/aws-ecr'
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions'
import { GitHubSource } from './github-source'

export interface ContainerBuildProps {

  /**
   * The Secrets Manager secret to allow authenticated Docker logins
   */
  readonly dockerCredentials: ISecret

  /**
   * The ECR to push the built image to
   */
  readonly ecr: Repository;

  /**
   * The source to find the Dockerfile in
   */
  readonly appSource: GitHubSource;

  /**
   * A friendly name for the container. This will be used as part of the tag when pushed to ECR
   */
  readonly containerName: string;

  /**
   * The name of the context override to use within a cdk deploy to point it to this built image.
   * This should match whatever the target stack is using for its ecrTagOverride override when
   * calling AssetHelpers.getContainerImage for this container.
   */
  readonly ecrTagContextOverride: string

  /**
   * The name of the context override to use within a cdk deploy to point it to this built image.
   * This should match whatever the target stack is using for its ecrNameOverride override when
   * calling AssetHelpers.getContainerImage for this container.
   */
  readonly ecrNameContextOverride: string

  /**
   * Optional override to find the dockerfile. By default, will look
   * in the top level directory of the source code for 'Dockerfile'
   */
  readonly dockerfile?: string;

  /**
   * Any build args to pass to Docker build
   */
  readonly buildArgs?: { [key: string]: string };
}

export class ContainerBuild extends Construct {
  /**
   * The friendly name given to this container
   */
  readonly containerName: string

  /**
   * The tag that will be used when pushing this container to ECR. Note:
   * This requires interpolation of pipeline variables, which will only happen
   * inside of an Action's environment variables. Using this anywhere else
   * will leave an unresolved token.
   */
  readonly imageTag: string

  /**
   * The Build action created to associate with a Pipeline
   */
  readonly action: CodeBuildAction

  /**
   * The name of the context override to use within a cdk deploy to point it to this built image.
   * This should match whatever the target stack is using for its ecrTagOverride override when
   * calling AssetHelpers.getContainerImage for this container.
   */
  readonly ecrTagContextOverride: string

  /**
   * The name of the context override to use within a cdk deploy to point it to this built image.
   * This should match whatever the target stack is using for its ecrNameOverride override when
   * calling AssetHelpers.getContainerImage for this container.
   */
  readonly ecrNameContextOverride: string

  /**
   * The ECR that this container will get pushed to
   */
  readonly ecr: Repository

  /**
   * The associated application source that this container was built from
   */
  readonly appSource: GitHubSource

  constructor (scope: Construct, id: string, props: ContainerBuildProps) {
    super(scope, id)

    this.containerName = props.containerName
    this.ecrNameContextOverride = props.ecrNameContextOverride
    this.ecrTagContextOverride = props.ecrTagContextOverride
    this.appSource = props.appSource
    this.ecr = props.ecr
    this.imageTag = `${props.containerName}-${props.appSource.variables.commitId}`

    const dockerfile = props.dockerfile ?? 'Dockerfile'

    let buildArgs = ''
    if (props.buildArgs !== undefined) {
      Object.entries(props.buildArgs).forEach((val) => {
        buildArgs += ` --build-arg "${val[0]}=${val[1]}"`
      })
    }

    const buildContainerProject = new PipelineProject(this, id, {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_2_0,
        privileged: true,
      },
      buildSpec: BuildSpec.fromObject({
        env: {
          shell: 'bash',
        },
        phases: {
          build: {
            commands: [
              'set -e',
              `if [[ $( aws ecr describe-images --region us-east-1 --repository-name=$REPO_NAME --image-ids=imageTag=$IMAGE_TAG ) ]]; then \
                echo "$REPO_NAME:$IMAGE_TAG already exists. Skipping this build."; \
              else \
                echo "$REPO_NAME:$IMAGE_TAG not found. Continuing to build."; \
                echo $DOCKERHUB_PASSWORD | docker login --username $DOCKERHUB_USERNAME --password-stdin; \
                $(aws ecr get-login --no-include-email --region $AWS_REGION); \
                docker build ${buildArgs} -f ${dockerfile} -t $REPO_URI:$IMAGE_TAG .; \
                docker push $REPO_URI:$IMAGE_TAG; \
              fi`,
            ],
          },
        },
        version: '0.2',
      }),
    })
    props.dockerCredentials.grantRead(buildContainerProject)
    props.ecr.grantPullPush(buildContainerProject)
    props.ecr.grant(buildContainerProject, 'ecr:DescribeImages')

    this.action = new CodeBuildAction({
      input: props.appSource.artifact,
      project: buildContainerProject,
      actionName: props.containerName,
      runOrder: 1,
      environmentVariables: {
        DOCKERHUB_USERNAME: {
          type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          value: `${props.dockerCredentials.secretName}:username`,
        },
        DOCKERHUB_PASSWORD: {
          type: BuildEnvironmentVariableType.SECRETS_MANAGER,
          value: `${props.dockerCredentials.secretName}:password`,
        },
        REPO_NAME: { value: props.ecr.repositoryName },
        REPO_URI: { value: props.ecr.repositoryUri },
        IMAGE_TAG: { value: this.imageTag },
      },
    })
  }
}
