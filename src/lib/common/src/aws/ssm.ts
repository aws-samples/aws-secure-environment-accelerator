import aws from './aws-client';
import * as sts from 'aws-sdk/clients/ssm';
import { throttlingBackOff } from './backoff';

export class SSM {
  private readonly client: aws.SSM;
  private readonly cache: { [roleArn: string]: aws.Credentials } = {};

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.SSM({
      credentials,
    });
  }

  async getParameter(name: string): Promise<sts.GetParameterResult> {
    return throttlingBackOff(() =>
      this.client
        .getParameter({
          Name: name,
        })
        .promise(),
    );
  }

  async getParameterHistory(name: string): Promise<sts.ParameterHistory[]> {
    const parameterVersions: sts.ParameterHistory[] = [];
    let token: string | undefined;
    do {
      const response = await throttlingBackOff(() =>
        this.client.getParameterHistory({ Name: name, NextToken: token, MaxResults: 50 }).promise(),
      );
      token = response.NextToken;
      parameterVersions.push(...response.Parameters!);
    } while (token);
    return parameterVersions;
  }
}
