import { PipelineProject, PipelineProjectProps } from '@aws-cdk/aws-codebuild';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { Construct, Fn, Stack } from '@aws-cdk/core';

export interface ICDKPipelineProjectProps extends PipelineProjectProps {
  /**
   * The stack that this project will deploy to. Will add permissions
   * to create change sets on these stacks.
   */
  readonly targetStack: Stack;
  /**
   * The stacks that the target stack will depend on. Will add permissions
   * to also create change sets on these stacks. Note: This can be ignored
   * if using the cdk deploy --exclusively option.
   */
  readonly dependsOnStacks: Stack[];
};

/**
 * Convenience class for creating a PipelineProject that will use cdk to deploy
 * the service stacks in this application. Primarily handles adding the necessary
 * permissions for cdk to make changes to the target stacks involved.
 */
export class CDKPipelineProject extends PipelineProject {
  constructor(scope: Construct, id: string, props: ICDKPipelineProjectProps) {
    super(scope, id, props);

    // CDK will try to read logs when generating output for failed events
    this.addToRolePolicy(new PolicyStatement({
      actions: [ 'logs:DescribeLogGroups'],
      resources: [ '*' ],
    }));
    
    // Anytime cdk deploys a stack without --exclusively, it will try to also update the stacks it depends on.
    // So, we need to give the pipeline permissions to update the target stack and the stacks it depends on.
    this.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudformation:CreateChangeSet',
        'cloudformation:DeleteStack',
        'cloudformation:DeleteChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:GetTemplate',        
      ],
      resources: [props.targetStack, ...props.dependsOnStacks].map(s => Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/' + s.stackName + '/*')),
    }));

    // Add permissions to read CDK bootstrap stack/bucket
    this.addToRolePolicy(new PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: [ Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/CDKToolkit/*') ],
    }));
    this.addToRolePolicy(new PolicyStatement({
      // TODO: Is there a way to get the bucket name?
      actions: [
        's3:ListBucket',
        's3:GetObject',
        's3:PutObject',
      ],
      resources: [ 'arn:aws:s3:::cdktoolkit-stagingbucket-*' ],
    }));
  }
};