import * as cdk from '@aws-cdk/core';

export interface Tag {
  key: string;
  value: string;
}

export interface AddTagsToResource {
  resourceId: string;
  resourceType: 'subnet';
  targetAccountIds: string[];
  tags: Tag[];
}

export interface AddTagsToResourcesOutputProps {
  /**
   * List of dependencies that need to be resolved before calling `produceResources`.
   */
  dependencies: cdk.IDependable[];
  /**
   * Function used to produce resources with their tags. You need to define the resources as a function so that the
   * resources can be calculated lazily.
   */
  produceResources: () => AddTagsToResource[];
}

/**
 * Auxiliary construct that emits outputs that can be read by the `add-tags-to-shared-resources` step in the
 * state machine.
 */
export class AddTagsToResourcesOutput extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AddTagsToResourcesOutputProps) {
    super(scope, id);

    // Use cdk.Lazy here and add dependency on the subnets to make sure the tags are attached to the subnet before
    // rendering the tags
    const output = new cdk.CfnOutput(this, 'AddTagsToResources', {
      value: cdk.Lazy.stringValue({
        // Render the subnet IDs and tags and convert to a JSON string
        produce: () =>
          JSON.stringify({
            type: 'AddTagsToResources',
            resources: props.produceResources(),
          }),
      }),
    });
    for (const dependency of props.dependencies) {
      output.node.addDependency(dependency);
    }
  }
}
