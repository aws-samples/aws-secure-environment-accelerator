import hashSum from 'hash-sum';
import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';

export class Document extends ssm.CfnDocument {
  constructor(scope: cdk.Construct, id: string, props: ssm.CfnDocumentProps) {
    super(scope, id, props);

    const hash = hashSum({ ...props, path: this.node.path });
    this.name = props.name ? `${props.name}-${hash}` : undefined;
  }
}
