import { ScheduledEvent } from 'aws-lambda';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { AcceleratorConfig, AcceleratorUpdateConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { getFormatedObject, getStringFromObject } from '@aws-pbmm/common-lambda/lib/util/utils';
import { pretty } from '@aws-pbmm/common-lambda/lib/util/perttier';

interface RemoveAccountOrganization extends ScheduledEvent {
  version?: string;
}

const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION! || 'ca-central-1';
const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME! || 'PBMMAccel-Config-Repo';
const configFilePath = process.env.CONFIG_FILE_PATH! || 'raw/config.json';
const configBranch = process.env.CONFIG_BRANCH_NAME! || 'master';
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;
const acceleratorAccountsSecretId = process.env.ACCOUNTS_SECRET_ID! || 'accelerator/accounts';
const configRootFilePath = process.env.CONFIG_ROOT_FILE_PATH! || 'config.yaml';

const codecommit = new CodeCommit(undefined, defaultRegion);
const secrets = new SecretsManager(undefined, defaultRegion);

export const handler = async (input: RemoveAccountOrganization) => {
  console.log(`RemoveAccountFromOrganization, Remove account configuration from Accelerator config...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;
  const invokedBy = requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  if (invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    };
  }
  console.log(`Reading account information from request`);
  const { accountId } = requestDetail.requestParameters;

  const accoutsString = await secrets.getSecret(acceleratorAccountsSecretId);
  const accounts = JSON.parse(accoutsString.SecretString!) as Account[];
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) {
    console.error(`Account is not processed through Accelerator Statemachine "${accountId}"`);
    return;
  }
  await removeAccountConfig(account);
  return 'SUCCESS';
};

async function removeAccountConfig(account: Account): Promise<string> {
  console.log(`Removing Account "${account.name}" from Configuration`);
  const extension = configRootFilePath?.split('.').slice(-1)[0];
  const format = extension === 'json' ? 'json' : 'yaml';

  const rawConfigResponse = await codecommit.getFile(configRepositoryName, configFilePath, configBranch);
  const rawConfig: AcceleratorConfig = getFormatedObject(rawConfigResponse.fileContent.toString(), format);
  let isMandatoryAccount = true;
  let accountInfo = Object.entries(rawConfig['mandatory-account-configs']).find(
    ([_, accConfig]) => accConfig.email === account.email,
  );
  if (!accountInfo) {
    isMandatoryAccount = false;
    accountInfo = Object.entries(rawConfig['workload-account-configs']).find(
      ([_, accConfig]) => accConfig.email === account.email,
    );
  }
  console.log(
    accountInfo,
    isMandatoryAccount,
    account,
    Object.entries(rawConfig['mandatory-account-configs']).find(([_, accConfig]) => accConfig.email === account.email),
  );
  if (!accountInfo) {
    return 'NO_ACCOUNT_FOUND';
  }
  const filename = accountInfo[1]['file-name'];
  if (filename === configRootFilePath) {
    const configResponse = await codecommit.getFile(configRepositoryName, filename, configBranch);
    const config: AcceleratorUpdateConfig = getFormatedObject(configResponse.fileContent.toString(), format);
    if (isMandatoryAccount) {
      const accountConfig = Object.entries(config['mandatory-account-configs']).find(
        ([_, accConfig]) => accConfig.email === account.email,
      );
      if (!accountConfig) {
        return 'NO_ACCOUNT_FOUND';
      }
      const accountKey = accountConfig[0];
      const accountConfigObject = accountConfig[1];
      accountConfigObject.deleted = true;
      config['mandatory-account-configs'][accountKey] = accountConfigObject;
    } else {
      const accountConfig = Object.entries(config['workload-account-configs']).find(
        ([_, accConfig]) => accConfig.email === account.email,
      );
      if (!accountConfig) {
        return 'NO_ACCOUNT_FOUND';
      }
      const accountKey = accountConfig[0];
      const accountConfigObject = accountConfig[1];
      accountConfigObject.deleted = true;
      config['workload-account-configs'][accountKey] = accountConfigObject;
    }
    try {
      console.log('Commiting');
      await codecommit.commit({
        branchName: configBranch,
        repositoryName: configRepositoryName,
        putFiles: [
          {
            filePath: filename,
            fileContent: pretty(getStringFromObject(config, format), format),
          },
        ],
        parentCommitId: configResponse.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`Config is already update for account: ${account.email}`);
      } else {
        throw Error(error);
      }
    }
  } else {
    const accountConfigResponse = await codecommit.getFile(configRepositoryName, filename, configBranch);
    // tslint:disable-next-line: no-any
    const accountsConfig: { [accountKey: string]: any } = getFormatedObject(
      accountConfigResponse.fileContent.toString(),
      format,
    );
    const accountConfig = Object.entries(accountsConfig).find(([_, accConfig]) => accConfig.email === account.email);
    if (accountConfig) {
      const accountKey = accountConfig[0];
      const accountConfigObject = accountConfig[1];
      accountConfigObject.deleted = true;
      accountsConfig[accountKey] = accountConfigObject;
      try {
        await codecommit.commit({
          branchName: configBranch,
          repositoryName: configRepositoryName,
          putFiles: [
            {
              filePath: filename,
              fileContent: pretty(getStringFromObject(accountsConfig, format), format),
            },
          ],
          parentCommitId: accountConfigResponse.commitId,
        });
      } catch (error) {
        if (error.code === 'NoChangeException') {
          console.log(`Config is already update for account: ${accountKey}`);
        } else {
          throw Error(error);
        }
      }
    }
  }
  return 'SUCCESS';
}

// handler({
//   "version": "0",
//   "id": "063896d5-6665-37db-9f42-336a79948386",
//   "detail-type": "AWS API Call via CloudTrail",
//   "source": "aws.organizations",
//   "account": "538235518685",
//   "time": "2020-07-28T12:42:51Z",
//   "region": "us-east-1",
//   "resources": [],
//   "detail": {
//       "eventVersion": "1.05",
//       "userIdentity": {
//           "type": "AssumedRole",
//           "principalId": "AROAX2UKWH3O4FA6K6N3J:nkoppula-Isengard",
//           "arn": "arn:aws:sts::538235518685:assumed-role/Admin/nkoppula-Isengard",
//           "accountId": "538235518685",
//           "accessKeyId": "ASIAX2UKWH3O37T7SPYF",
//           "sessionContext": {
//               "sessionIssuer": {
//                   "type": "Role",
//                   "principalId": "AROAX2UKWH3O4FA6K6N3J",
//                   "arn": "arn:aws:iam::538235518685:role/Admin",
//                   "accountId": "538235518685",
//                   "userName": "Admin"
//               },
//               "webIdFederationData": {},
//               "attributes": {
//                   "mfaAuthenticated": "false",
//                   "creationDate": "2020-07-28T12:42:02Z"
//               }
//           }
//       },
//       "eventTime": "2020-07-28T12:42:51Z",
//       "eventSource": "organizations.amazonaws.com",
//       "eventName": "RemoveAccountFromOrganization",
//       "awsRegion": "us-east-1",
//       "sourceIPAddress": "72.21.198.64",
//       "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0, aws-internal/3 aws-sdk-java/1.11.820 Linux/4.9.217-0.1.ac.205.84.332.metal1.x86_64 OpenJDK_64-Bit_Server_VM/25.252-b09 java/1.8.0_252 vendor/Oracle_Corporation",
//       "requestParameters": {
//           "accountId": "588801414845"
//       },
//       "responseElements": null,
//       "requestID": "c2f84452-62c8-47f5-9b17-597fa9ddf55b",
//       "eventID": "43ce4997-99b8-4e3b-a243-f34ec6bbd7e5",
//       "eventType": "AwsApiCall"
//   }
// });
