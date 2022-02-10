/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface CognitoUserPoolDomainConfigurationProps {
  domainPrefix: string;
  userPool: CognitoUserPool;
}

export interface CognitoUserPoolConfigurationProps {
  userPoolName: string;
  usernameAttributes: string[];
}

export interface CognitoIdentityPoolConfigurationProps {
  identityPoolName: string;
  allowUnauthenticatedIdentities: boolean;
}

export interface CognitoIdentityPoolRoleMappingConfigurationProps {
  authenticatedRole: iam.IRole;
  unauthenticatedRole?: iam.IRole;
  identityPool: CognitoIdentityPool;
}

export class CognitoIdentityPoolRoleMapping extends Construct {
  private readonly resource: cognito.CfnIdentityPoolRoleAttachment;

  constructor(scope: Construct, id: string, private readonly props: CognitoIdentityPoolRoleMappingConfigurationProps) {
    super(scope, id);

    const { authenticatedRole, identityPool, unauthenticatedRole } = props;

    this.resource = new cognito.CfnIdentityPoolRoleAttachment(this, 'RoleAttachment', {
      identityPoolId: identityPool.id,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    if (unauthenticatedRole) {
      this.resource.roles.unauthenticated = unauthenticatedRole.roleArn;
    }
  }
}

export class CognitoIdentityPool extends Construct {
  private readonly resource: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, private readonly props: CognitoIdentityPoolConfigurationProps) {
    super(scope, id);

    const { identityPoolName, allowUnauthenticatedIdentities } = props;

    this.resource = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName,
      allowUnauthenticatedIdentities,
    });
  }

  get id(): string {
    return this.resource.ref;
  }
}

export class CognitoUserPoolDomain extends Construct {
  private readonly resource: cognito.CfnUserPoolDomain;

  constructor(scope: Construct, id: string, private readonly props: CognitoUserPoolDomainConfigurationProps) {
    super(scope, id);

    const { domainPrefix, userPool } = props;

    this.resource = new cognito.CfnUserPoolDomain(this, 'UserPoolDomain', {
      userPoolId: userPool.id,
      domain: domainPrefix,
    });
  }

  get id(): string {
    return this.resource.ref;
  }
}

export class CognitoUserPool extends Construct {
  private readonly resource: cognito.CfnUserPool;

  constructor(scope: Construct, id: string, private readonly props: CognitoUserPoolConfigurationProps) {
    super(scope, id);

    const { userPoolName, usernameAttributes } = props;

    const externalId: string = Math.random().toString(11).slice(2);

    const snsRole = new iam.Role(this, 'MfaSnsRole', {
      assumedBy: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      externalIds: [externalId],
      inlinePolicies: {
        snspublish: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['sns:Publish'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    this.resource = new cognito.CfnUserPool(this, 'UserPool', {
      userPoolName,
      usernameAttributes,
      userPoolAddOns: {
        advancedSecurityMode: 'ENFORCED',
      },
      mfaConfiguration: 'ON',
      enabledMfas: ['SMS_MFA'],
      smsConfiguration: {
        externalId,
        snsCallerArn: snsRole.roleArn,
      },
      accountRecoverySetting: {
        recoveryMechanisms: [
          {
            name: 'verified_email',
            priority: 1,
          },
        ],
      },
    });
  }

  get id(): string {
    return this.resource.ref;
  }
}
