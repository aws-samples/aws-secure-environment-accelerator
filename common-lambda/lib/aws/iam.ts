import aws from 'aws-sdk';
import iam from 'aws-sdk/clients/iam';

export class IAM {
  private readonly client: aws.IAM;

  constructor(credentials?: aws.Credentials) {
    this.client = new aws.IAM({
      credentials,
    });
  }

  async getRole(name: string): Promise<iam.Role> {
    let response = await this.client.getRole({
      RoleName: name,
    }).promise();
    return response.Role;
  }

  async createOrUpdateRole(input: iam.CreateRoleRequest): Promise<iam.Role> {
    const role = await this.getRole(input.RoleName);
    if (role) {
      const assumeRolePolicyDocument = unescape(role.AssumeRolePolicyDocument!!);
      if (assumeRolePolicyDocument === input.AssumeRolePolicyDocument) {
        console.log(`Role "${input.RoleName}" up to date`);
      } else {
        console.log(`Updating trust policy of role "${input.RoleName}"`);
        await this.client.updateAssumeRolePolicy({
          RoleName: input.RoleName,
          PolicyDocument: input.AssumeRolePolicyDocument,
        });
      }
      return role;
    }
    console.log(`Creating role "${input.RoleName}"`);
    const response = await this.client.createRole(input).promise();
    return response.Role;
  }
}
