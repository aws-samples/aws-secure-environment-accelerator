import * as cdk from '@aws-cdk/core';

// tslint:disable-next-line: no-any
export type Producer = () => any;

export interface JsonOutputProps extends Omit<cdk.CfnOutputProps, 'value'> {
  readonly type: string;
  /**
   * Function used to produce a value or the value itself.
   */
  // tslint:disable-next-line: no-any
  readonly value: any | Producer;
}

/**
 * Auxiliary construct that emits outputs that can be read by the `add-tags-to-shared-resources` step in the
 * state machine.
 */
export class JsonOutputValue extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: JsonOutputProps) {
    super(scope, id);

    let value;
    if (typeof props.value === 'function') {
      value = cdk.Lazy.stringValue({
        produce: () =>
          JSON.stringify({
            type: props.type,
            value: props.value(),
          }),
      });
    } else {
      value = JSON.stringify({
        type: props.type,
        value: props.value,
      });
    }

    new cdk.CfnOutput(this, 'Output', {
      value,
      description: props.description,
      condition: props.condition,
      exportName: props.exportName,
    });
  }
}
