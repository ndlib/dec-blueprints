import { GitHubSourceAction, GitHubSourceActionProps, GitHubSourceVariables } from '@aws-cdk/aws-codepipeline-actions'
import { Artifact } from '@aws-cdk/aws-codepipeline'
import { Construct } from '@aws-cdk/core'

export type GitHubSourceProps = Omit<GitHubSourceActionProps, 'output'|'actionName'>
export class GitHubSource extends Construct {
  readonly artifact: Artifact
  readonly action: GitHubSourceAction

  /**
   * Handles the common case of constructing a source action and artifact of the same name
   * and then exposes these for future use in a Pipeline
   */
  constructor (scope: Construct, id: string, props: GitHubSourceProps) {
    super(scope, id)
    this.artifact = new Artifact(id)
    this.action = new GitHubSourceAction({ ...props, actionName: id, output: this.artifact })
  }

  /**
   * Alias for this.action.variables
   */
  get variables (): GitHubSourceVariables {
    return this.action.variables
  }
}
