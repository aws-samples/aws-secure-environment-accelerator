import * as yaml from 'js-yaml';
import * as cdk from '@aws-cdk/core';
import * as cnf from '@aws-cdk/aws-config';
import { ConfigRule } from '@config-rules/vpc-config-rule';

export type OrganizationConformancePackProps = Omit<cnf.CfnOrganizationConformancePackProps, 'templateBody' | 'templateS3Uri'>;

export class OrganizationConformancePack extends cdk.Construct {
  private readonly props: OrganizationConformancePackProps;
  private readonly rules: ConfigRule[] = [];

  constructor(scope: cdk.Construct, id: string, props: OrganizationConformancePackProps) {
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

    new cnf.CfnOrganizationConformancePack(this, 'Resource', {
      ...this.props,
      templateBody: templateYaml,
    });
  }
}
