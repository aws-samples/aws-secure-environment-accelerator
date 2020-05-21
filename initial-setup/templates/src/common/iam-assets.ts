import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import {
  IamConfig,
  IamConfigType,
  IamPolicyConfigType,
  IamUserConfigType,
  IamRoleConfigType,
} from '@aws-pbmm/common-lambda/lib/config';
import { Account, getAccountId } from '../utils/accounts';
import { Secret } from '@aws-cdk/aws-secretsmanager';

export interface IamAssetsProps {
  accountKey: string;
  iamConfig?: IamConfig;
  iamPoliciesDefinition: { [policyName: string]: string };
  accounts: Account[];
  userPasswords: { [userId: string]: Secret };
}

export class IamAssets extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: IamAssetsProps) {
    super(scope, id);
    const { accountKey, iamConfig, iamPoliciesDefinition, accounts, userPasswords } = props;

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
            actions: typeof(statement.Action) === 'string' ? [statement.Action] : statement.Action,
            resources: typeof(statement.Resource) === 'string'? [statement.Resource]: statement.Resource,
          }),
        );
      }
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
          managedPolicies: policies.map(
            x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x),
          ),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      } else {
        const iamRole = new iam.Role(this, `IAM-Role-${role}`, {
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
