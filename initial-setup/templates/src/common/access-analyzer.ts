import * as cdk from '@aws-cdk/core';
import * as accessanalyzer from '@aws-cdk/aws-accessanalyzer';

export class AccessAnalyzer extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    // create IAM access analyzer in only security account
    // note: security account delegated as access analyzer administrator in previous step
    const accessAnalyzer = new accessanalyzer.CfnAnalyzer(this, 'OrgAccessAnalyzer', {
      analyzerName: 'OrgAccessAnalyzer',
      type: 'ORGANIZATION',
    });
  }
}
