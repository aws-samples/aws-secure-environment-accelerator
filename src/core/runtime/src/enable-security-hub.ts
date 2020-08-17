import { SecurityHub } from '@aws-accelerator/common/src/aws/security-hub';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { sendResponse } from './utils';
import { SUCCESS, FAILED } from 'cfn-response';
import { delay } from '@aws-accelerator/common/src/util/delay';

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Enable Secutiry Hub Standards ...`);
  const requestType = event.RequestType;
  const resourceId = 'Enable-Security-Hub';
  if (requestType === 'Delete') {
    // ToDo
    await sendResponse(event, context, SUCCESS, {}, resourceId);
    return;
  }
  try {
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;
    const standards = event.ResourceProperties.Standards;

    const accountId = event.ResourceProperties.AccountID;

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName!);

    const hub = new SecurityHub(credentials);
    console.log(`Enabling Security Hub in ${accountId}`);
    const standardsResponse = await hub.describeStandards();

    // Enable standards and Disabling unnecessary Controls for eash standard
    for (const standard of standards) {
      const standardArn = standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn;
      const enableResonse = await hub.batchEnableStandards([standardArn!]);
      await delay(3000);
      for (const responseStandard of enableResonse.StandardsSubscriptions || []) {
        const standardControls = await hub.describeStandardControls(responseStandard.StandardsSubscriptionArn);
        for (const disableConrtol of standard['controls-to-disable']) {
          const standardControl = standardControls.Controls?.find(x => x.ControlId === disableConrtol);
          if (standardControl) {
            console.log(`Disabling Control "${disableConrtol}" for Standard "${standard.name}"`);
            await hub.updateStandardControls(standardControl.StandardsControlArn!);
          } else {
            console.log(`Control "${disableConrtol}" not found for Standard "${standard.name}"`);
          }
        }
      }
    }
    await sendResponse(event, context, SUCCESS, {}, resourceId);
  } catch (error) {
    console.error(error);
    await sendResponse(event, context, FAILED, {}, resourceId);
  }
};
