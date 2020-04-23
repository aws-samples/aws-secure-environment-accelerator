import * as cdk from '@aws-cdk/core';
import { JsonOutputValue, JsonOutputProps } from './json-output';

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

export interface AddTagsToResourcesOutputProps extends Omit<JsonOutputProps, 'value' | 'type'> {
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
    const output = new JsonOutputValue(this, 'AddTagsToResources', {
      type: 'AddTagsToResources',
      value: props.produceResources,
      description: props.description,
      condition: props.condition,
      exportName: props.exportName,
    });
    for (const dependency of props.dependencies) {
      output.node.addDependency(dependency);
    }
  }
}
