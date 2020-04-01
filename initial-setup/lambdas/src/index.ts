import * as aws from 'aws-sdk';
import { Organizations } from '../../../../common-lambda/lib/aws/organizations';

const accountName = 'shared-network';

/**
 * This handle runs in the master account.
 */
//export const handler: Handler<void> = async () => {
export const handler = async () => {
    const organizations = new Organizations();

    // create account using account-vending-machine
    const response = await organizations.createAccount(accountName);
    console.log(response);
};

(async () => handler())();
