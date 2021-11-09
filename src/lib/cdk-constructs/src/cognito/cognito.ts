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

import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as cognito from '@aws-cdk/aws-cognito';


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

export class CognitoIdentityPoolRoleMapping extends cdk.Construct {
  private readonly resource: cognito.CfnIdentityPoolRoleAttachment;

  constructor(scope: cdk.Construct, id: string, private readonly props: CognitoIdentityPoolRoleMappingConfigurationProps) {
    super(scope, id);

    const { authenticatedRole, identityPool, unauthenticatedRole } = props;

    this.resource = new cognito.CfnIdentityPoolRoleAttachment(this, 'RoleAttachment', {
      identityPoolId: identityPool.id,
      roles: {
        "authenticated": authenticatedRole.roleArn
      }
    });

    if (unauthenticatedRole) {
      this.resource.roles.unauthenticated = unauthenticatedRole.roleArn
    }
  }
}

export class CognitoIdentityPool extends cdk.Construct {
  private readonly resource: cognito.CfnIdentityPool;

  constructor(scope: cdk.Construct, id: string, private readonly props: CognitoIdentityPoolConfigurationProps) {
    super(scope, id);

    const { identityPoolName, allowUnauthenticatedIdentities } = props;

    this.resource = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName,
      allowUnauthenticatedIdentities
    });
  }

  get id(): string {
    return this.resource.ref;
  }

}

export class CognitoUserPoolDomain extends cdk.Construct {
  private readonly resource: cognito.CfnUserPoolDomain;

  constructor(scope: cdk.Construct, id: string, private readonly props: CognitoUserPoolDomainConfigurationProps) {
    super(scope, id);

    const { domainPrefix, userPool } = props;

    this.resource = new cognito.CfnUserPoolDomain(this, 'UserPoolDomain', {
      userPoolId: userPool.id,
      domain: domainPrefix
    });

  }

  get id(): string {
    return this.resource.ref;
  }
}


export class CognitoUserPool extends cdk.Construct {

  private readonly resource: cognito.CfnUserPool;

  constructor(scope: cdk.Construct, id: string, private readonly props: CognitoUserPoolConfigurationProps) {
    super(scope, id);

    const { userPoolName, usernameAttributes } = props;

    this.resource = new cognito.CfnUserPool(this, 'UserPool', {
      userPoolName,
      usernameAttributes
    });

  }

  get id(): string {
    return this.resource.ref;
  }

}
