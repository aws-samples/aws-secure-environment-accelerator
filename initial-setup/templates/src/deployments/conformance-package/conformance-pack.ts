import * as yaml from 'js-yaml';
import * as cdk from '@aws-cdk/core';
import * as cnf from '@aws-cdk/aws-config';
import { ConfigRule } from '@config-rules/vpc-config-rule';

export type ConformancePackProps = Omit<cnf.CfnConformancePackProps, 'templateBody' | 'templateS3Uri'>;

export class ConformancePack extends cdk.Construct {
  private readonly props: ConformancePackProps;
  private readonly rules: ConfigRule[] = [];

  constructor(scope: cdk.Construct, id: string, props: ConformancePackProps) {
    super(scope, id);
    this.props = props;
  }

  addConfigRule(rule: ConfigRule) {
    this.rules.push(rule);
  }

  renderToCloudFormation() {
    // Build config rule CloudFormation template
    // tslint:disable-next-line: no-any
    const resources: { [resourceName: string]: any } = {};
    for (const [index, rule] of Object.entries(this.rules)) {
      resources[`Rule${index}`] = rule.renderToCloudFormation();
    }

    return {
      Resources: resources,
    };
  }

  protected onPrepare() {
    const template = this.renderToCloudFormation();
    const templateYaml = yaml.dump(template);

    console.debug('ConformancePack.onPrepare');
    console.debug(templateYaml);

    new cnf.CfnConformancePack(this, 'Resource', {
      ...this.props,
      templateBody: templateYaml,
    });
  }
}
