import aws from './aws-client';
import * as ssm from 'aws-sdk/clients/ssm';
import { throttlingBackOff } from './backoff';

export class SSM {
  private readonly client: aws.SSM;
  private readonly cache: { [roleArn: string]: aws.Credentials } = {};

  constructor(credentials?: aws.Credentials, region?: string) {
    this.client = new aws.SSM({
      credentials,
      region,
    });
  }

  async getParameter(name: string): Promise<ssm.GetParameterResult> {
    return throttlingBackOff(() =>
      this.client
        .getParameter({
          Name: name,
        })
        .promise(),
    );
  }

  async getParameterHistory(name: string): Promise<ssm.ParameterHistory[]> {
    const parameterVersions: ssm.ParameterHistory[] = [];
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

  async putParameter(name: string, value: string): Promise<ssm.PutParameterResult> {
    return throttlingBackOff(() =>
      this.client
        .putParameter({
          Name: name,
          Type: 'String',
          Value: value,
        })
        .promise(),
    );
  }
}
