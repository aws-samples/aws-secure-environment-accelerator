import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import {
  IamConfig,
  IamConfigType,
  IamPolicyConfigType,
  IamUserConfigType,
  IamRoleConfigType,
} from '@aws-accelerator/common-config/src';
import { Account, getAccountId } from '../utils/accounts';
import { IBucket } from '@aws-cdk/aws-s3';
import { createPolicyName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamPolicyOutput, CfnIamRoleOutput, CfnIamUserOutput, CfnIamGroupOutput } from '../deployments/iam';

export interface IamAssetsProps {
  accountKey: string;
  iamConfig?: IamConfig;
  iamPoliciesDefinition: { [policyName: string]: string };
  accounts: Account[];
  userPasswords: { [userId: string]: cdk.SecretValue };
  logBucket: IBucket;
}

export class IamAssets extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: IamAssetsProps) {
    super(scope, id);
    const { accountKey, iamConfig, iamPoliciesDefinition, accounts, userPasswords, logBucket } = props;

    const customerManagedPolicies: { [policyName: string]: iam.ManagedPolicy } = {};
    // method to create IAM Policy
    const createIamPolicy = (policyName: string, policy: string): void => {
      const iamPolicyDef = iamPoliciesDefinition[policyName];
      const iamPolicyJson = JSON.parse(iamPolicyDef);
      const statementArray = iamPolicyJson.Statement;

      const iamPolicy = new iam.ManagedPolicy(this, `IAM-Policy-${policyName}-${accountKey}`, {
        managedPolicyName: policyName,
        description: `PBMM - ${policyName}`,
      });

      for (const statement of statementArray) {
        iamPolicy.addStatements(
          new iam.PolicyStatement({
            effect: statement.Effect === 'Allow' ? iam.Effect.ALLOW : iam.Effect.DENY,
            actions: typeof statement.Action === 'string' ? [statement.Action] : statement.Action,
            resources: typeof statement.Resource === 'string' ? [statement.Resource] : statement.Resource,
          }),
        );
      }
      customerManagedPolicies[policyName] = iamPolicy;
      new CfnIamPolicyOutput(this, `IamPolicy${policyName}Output`, {
        policyName: iamPolicy.managedPolicyName,
        policyArn: iamPolicy.managedPolicyArn,
        policyKey: 'IamCustomerManagedPolicy',
      });
    };

    // method to create IAM User & Group
    const createIamUser = (userIds: string[], groupName: string, policies: string[], boundaryPolicy: string): void => {
      const iamGroup = new iam.Group(this, `IAM-Group-${groupName}-${accountKey}`, {
        groupName,
        managedPolicies: policies.map(x => iam.ManagedPolicy.fromAwsManagedPolicyName(x)),
      });

      new CfnIamGroupOutput(this, `IamGroup${groupName}Output`, {
        groupName: iamGroup.groupName,
        groupArn: iamGroup.groupArn,
        groupKey: 'IamAccountGroup',
      });

      for (const userId of userIds) {
        const iamUser = new iam.User(this, `IAM-User-${userId}-${accountKey}`, {
          userName: userId,
          password: userPasswords[userId],
          groups: [iamGroup],
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });

        new CfnIamUserOutput(this, `IamUser${userId}Output`, {
          userName: iamUser.userName,
          userArn: iamUser.userArn,
          userKey: 'IamAccountUser',
        });
      }
    };

    // method to create IAM Role
    const createIamRole = (
      role: string,
      type: string,
      policies: string[],
      boundaryPolicy: string,
      sourceAccount?: string,
      sourceAccountRole?: string,
      trustPolicy?: string,
    ): iam.Role => {
      if (sourceAccount && sourceAccountRole && trustPolicy) {
        const sourceAccountId = getAccountId(accounts, sourceAccount);

        return new iam.Role(this, `IAM-Role-${role}-${accountKey}`, {
          roleName: role,
          description: `PBMM - ${role}`,
          assumedBy: new iam.ArnPrincipal(`arn:aws:iam::${sourceAccountId}:role/${sourceAccountRole}`),
          managedPolicies: policies.map(
            x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x),
          ),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      } else {
        return new iam.Role(this, `IAM-Role-${role}`, {
          roleName: role,
          description: `PBMM - ${role}`,
          assumedBy: new iam.ServicePrincipal(`${type}.amazonaws.com`),
          managedPolicies: policies.map(
            x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x),
          ),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      }
    };

    const createIamSSMLogArchivePolicy = (): iam.ManagedPolicy => {
      const policyName = createPolicyName('SSMAccessPolicy');
      const iamSSMLogArchiveAccessPolicy = new iam.ManagedPolicy(this, `IAM-SSM-LogArchive-Policy-${accountKey}`, {
        managedPolicyName: policyName,
        description: policyName,
      });

      iamSSMLogArchiveAccessPolicy.addStatements(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['kms:DescribeKey', 'kms:GenerateDataKey*', 'kms:Decrypt', 'kms:Encrypt', 'kms:ReEncrypt*'],
          resources: [logBucket.encryptionKey?.keyArn || '*'],
        }),

        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: ['*'], // TODO: limit resource to be SSM key only
        }),

        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetEncryptionConfiguration'],
          resources: [logBucket.bucketArn],
        }),

        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject', 's3:PutObjectAcl'],
          resources: [logBucket.arnForObjects('*')],
        }),
      );
      new CfnIamPolicyOutput(this, `IamSsmPolicyOutput`, {
        policyName: iamSSMLogArchiveAccessPolicy.managedPolicyName,
        policyArn: iamSSMLogArchiveAccessPolicy.managedPolicyArn,
        policyKey: 'IamSsmAccessPolicy',
      });
      return iamSSMLogArchiveAccessPolicy;
    };

    if (!IamConfigType.is(iamConfig)) {
      console.log(
        `IAM config is not defined for account with key - ${accountKey}. Skipping Policies/Users/Roles creation.`,
      );
    } else {
      const iamPolicies = iamConfig.policies;
      for (const iamPolicy of iamPolicies!) {
        if (!IamPolicyConfigType.is(iamPolicy)) {
          console.log(
            `IAM config - policies is not defined for account with key - ${accountKey}. Skipping Policies creation.`,
          );
        } else {
          createIamPolicy(iamPolicy['policy-name'], iamPolicy.policy);
        }
      }

      const iamUsers = iamConfig.users;
      for (const iamUser of iamUsers!) {
        if (!IamUserConfigType.is(iamUser)) {
          console.log(
            `IAM config - users is not defined for account with key - ${accountKey}. Skipping Users creation.`,
          );
        } else {
          createIamUser(iamUser['user-ids'], iamUser.group, iamUser.policies, iamUser['boundary-policy']);
        }
      }

      const iamRoles = iamConfig.roles;
      if (!iamRoles) {
        return;
      }

      const ssmLogArchivePolicy =
        iamRoles.filter(i => i['ssm-log-archive-access']).length > 0 ? createIamSSMLogArchivePolicy() : undefined;

      for (const iamRole of iamRoles) {
        if (!IamRoleConfigType.is(iamRole)) {
          console.log(
            `IAM config - roles is not defined for account with key - ${accountKey}. Skipping Roles creation.`,
          );
        } else {
          const role = createIamRole(
            iamRole.role,
            iamRole.type,
            iamRole.policies,
            iamRole['boundary-policy'],
            iamRole['source-account'],
            iamRole['source-account-role'],
            iamRole['trust-policy'],
          );

          if (iamRole.type === 'ec2') {
            new iam.CfnInstanceProfile(this, `IAM-Instance-Profile-${iamRole.role}-${accountKey}`, {
              path: '/',
              roles: [role.roleName],
              instanceProfileName: createIamInstanceProfileName(iamRole.role),
            });
          }

          new CfnIamRoleOutput(this, `IamRole${iamRole.role}Output`, {
            roleName: role.roleName,
            roleArn: role.roleArn,
            roleKey: 'IamAccountRole',
          });

          if (iamRole['ssm-log-archive-access'] && ssmLogArchivePolicy) {
            role.addManagedPolicy(ssmLogArchivePolicy);
          }
        }
      }
    }
  }
}

export function createIamInstanceProfileName(iamRoleName: string) {
  return `${iamRoleName}-ip`;
}
