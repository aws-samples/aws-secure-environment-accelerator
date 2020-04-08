import * as aws from 'aws-sdk';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

interface ModifyCoreScpInput {
  roleName: string;
  policyName: string;
}

export const handler = async (input: ModifyCoreScpInput) => {
  console.log(`Starting CodeBuild project...`);
  console.log(JSON.stringify(input, null, 2));

  const { roleName, policyName } = input;

  // Find the core policy
  const organizations = new Organizations();
  const response = await organizations.getPolicyByName({
    Filter: 'SERVICE_CONTROL_POLICY',
    Name: policyName,
  });
  const policy = response?.Policy;
  const policyId = policy?.PolicySummary?.Id;
  if (!policy || !policyId) {
    throw new Error(`Cannot find service control policy with name "${policyName}"`);
  }

  // Parse the policy and find the statement
  const content = JSON.parse(policy.Content!);
  const statement = content.Statement;
  if (!statement) {
    throw new Error(`The SCP with ID "${policyName}" does not have a Statement field`);
  }

  // Add our role to all the statements
  const role = `arn:aws:iam::*:role/${roleName}`;
  let hasChanged = false;
  if (Array.isArray(statement)) {
    // tslint:disable-next-line: no-any
    const hasChangedList = statement.map((element: any) => addRoleToStatement(role, element));
    hasChanged = hasChangedList.some((v) => v === true);
  } else {
    hasChanged = addRoleToStatement(role, statement);
  }

  if (hasChanged) {
    console.log(`Updating the secure control policy with name ${policyName}`);

    // Only update the policy when we made changes to the statement
    await organizations.updatePolicy({
      PolicyId: policyId,
      Content: JSON.stringify(content),
    });
  } else {
    console.log(`No changes had to be made to the secure control policy with name ${policyName}`);
  }
};

/**
 * Add the given role to the condition `Condition.ArnNotLike.aws:PrincipalARN` of the given statement.
 *
 * @param role The role to add to the statement
 * @param statement The statement to add the role to
 * @returns True if the statement has been changed
 */
// tslint:disable-next-line: no-any
function addRoleToStatement(role: string, statement: any) {
  const arnNotLikeCondition = statement.Condition?.ArnNotLike;
  if (!arnNotLikeCondition) {
    return false;
  }
  const principalArnNotLikeCondition = arnNotLikeCondition?.['aws:PrincipalARN'];
  if (!principalArnNotLikeCondition) {
    return false;
  }

  if (Array.isArray(principalArnNotLikeCondition)) {
    if (!principalArnNotLikeCondition.includes(role)) {
      principalArnNotLikeCondition.push(role);
      return true;
    }
  } else if (typeof principalArnNotLikeCondition === 'string') {
    arnNotLikeCondition['aws:PrincipalARN'] = [principalArnNotLikeCondition, role];
    return true;
  } else {
    throw new Error(`Cannot add role to statement condition ${JSON.stringify(arnNotLikeCondition)}`);
  }
  return false;
}
