import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import {
  AccountConfig,
  IamConfigType,
  IamPolicyConfigType,
  IamUserConfigType,
  IamRoleConfigType,
  AcceleratorConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { Account, getAccountId } from '../utils/accounts';
import { Secret } from '@aws-cdk/aws-secretsmanager';

export interface AccountDefaultSettingsAssetsProps extends cdk.StackProps {
  accountId: string;
  accountKey: string;
  accountConfig: AccountConfig | any;
  acceleratorConfig: AcceleratorConfig;
  accounts: Account[];
  userPasswords: { [userId: string]: Secret };
}

export class AccountDefaultSettingsAssets extends cdk.Construct {
  readonly kmsKeyIdForEbsDefaultEncryption: string;

  constructor(scope: cdk.Construct, id: string, props: AccountDefaultSettingsAssetsProps) {
    super(scope, id);
    const { accountId, accountKey, accountConfig, acceleratorConfig, accounts, userPasswords } = props;

    // kms key used for default EBS encryption
    const kmsKey = new kms.Key(this, 'EBS-DefaultEncryption', {
      alias: 'alias/EBS-Default-key',
      description: 'PBMM - Key used to encrypt/decrypt EBS by default',
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'key-consolepolicy-3',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountPrincipal(accountId)],
            actions: ['kms:*'],
            resources: ['*'],
          }),
        ],
      }),
    });

    // save the kmsKeyArn for later use
    this.kmsKeyIdForEbsDefaultEncryption = kmsKey.keyId;

    const iamConfig = accountConfig.iam;

    const customerManagedPolicies: { [policyName: string]: iam.ManagedPolicy } = {};
    // method to create IAM Policy
    const createIamPolicy = (policyName: string, policy: string): void => {
      const iamPolicy = new iam.ManagedPolicy(this, `IAM-Policy-${policyName}-${accountKey}`, {
        managedPolicyName: policyName,
        description: `PBMM - ${policyName}`,
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['*'],
            resources: ['*'],
          }),
        ],
      });
      customerManagedPolicies[policyName] = iamPolicy;
    };

    // method to create IAM User & Group
    const createIamUser = (userIds: string[], groupName: string, policies: string[], boundaryPolicy: string): void => {
      const iamGroup = new iam.Group(this, `IAM-Group-${groupName}-${accountKey}`, {
        groupName,
        managedPolicies: policies.map(x => iam.ManagedPolicy.fromAwsManagedPolicyName(x)),
      });

      for (const userId of userIds) {
        const iamUser = new iam.User(this, `IAM-User-${userId}-${accountKey}`, {
          userName: userId,
          password: userPasswords[userId].secretValue,
          groups: [iamGroup],
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
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
    ): void => {
      if (sourceAccount && sourceAccountRole && trustPolicy) {
        const sourceAccountId = getAccountId(accounts, sourceAccount);

        const iamRole = new iam.Role(this, `IAM-Role-${role}-${accountKey}`, {
          roleName: role,
          description: `PBMM - ${role}`,
          assumedBy: new iam.ArnPrincipal(`arn:aws:iam::${sourceAccountId}:role/${sourceAccountRole}`),
          managedPolicies: policies.map(x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x)),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      } else {
        const iamRole = new iam.Role(this, `IAM-Role-${role}`, {
          roleName: role,
          description: `PBMM - ${role}`,
          assumedBy: new iam.ServicePrincipal(`${type}.amazonaws.com`),
          managedPolicies: policies.map(x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x)),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      }
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
      for (const iamRole of iamRoles!) {
        if (!IamRoleConfigType.is(iamRole)) {
          console.log(
            `IAM config - roles is not defined for account with key - ${accountKey}. Skipping Roles creation.`,
          );
        } else {
          createIamRole(
            iamRole.role,
            iamRole.type,
            iamRole.policies,
            iamRole['boundary-policy'],
            iamRole['source-account'],
            iamRole['source-account-role'],
            iamRole['trust-policy'],
          );
        }
      }
    }
  }
}
