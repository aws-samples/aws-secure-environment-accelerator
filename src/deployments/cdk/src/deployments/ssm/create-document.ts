import { STS } from '@aws-accelerator/common/src/aws/sts';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as ssm from '@aws-cdk/aws-ssm';
import * as yaml from 'js-yaml';

export interface CreateDocumentProps {
  acceleratorExecutionRoleName: string;
  centralBucketName: string;
  centralAccountId: string;
  config: c.AcceleratorConfig;
  accountStacks: AccountStacks;
}

export async function createDocument(props: CreateDocumentProps) {
  const { acceleratorExecutionRoleName, config, centralAccountId, centralBucketName, accountStacks } = props;
  const documentContents = await getSsmDocumentsContent({
    assumeRoleName: acceleratorExecutionRoleName,
    config,
    sourceAccountId: centralAccountId,
    sourceBucketName: centralBucketName,
  });
  const documentsConfig = config['global-options']['ssm-automation'];
  for (const documentConfig of documentsConfig) {
    for (const account of documentConfig.accounts) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(account, documentConfig.region);
      if (!accountStack) {
        throw new Error(`Account Stack didn't find for account "${account}" and region "${documentConfig}"`);
      }
      for (const document of documentConfig.documents) {
        let content;
        if (document.template.endsWith('.json')) {
          content = JSON.parse(documentContents?.[document.name]!);
        } else {
          content = yaml.load(documentContents?.[document.name]!);
        }
        content.description = document.description;
        new ssm.CfnDocument(accountStack, document.name, {
          content,
          documentType: 'Automation',
          name: document.name,
        });
      }
    }
  }
}

const getSsmDocumentsContent = async (props: {
  assumeRoleName: string;
  sourceAccountId: string;
  sourceBucketName: string;
  config: c.AcceleratorConfig;
}): Promise<{ [documentName: string]: string } | undefined> => {
  const { assumeRoleName, sourceAccountId, sourceBucketName, config } = props;
  const ssmDocumentsContent: { [policyName: string]: string } = {};

  const sts = new STS();
  const sourceAccountCredentials = await sts.getCredentialsForAccountAndRole(sourceAccountId, assumeRoleName);

  const s3 = new S3(sourceAccountCredentials);
  const artifactsPrefix = 'ssm-documents/';
  const documentsConfig = config['global-options']['ssm-automation'];
  for (const documentConfig of documentsConfig) {
    for (const document of documentConfig.documents) {
      const documentKey = artifactsPrefix + document.template;
      try {
        const documentContent = await s3.getObjectBodyAsString({
          Bucket: sourceBucketName,
          Key: documentKey,
        });
        ssmDocumentsContent[document.name] = documentContent;
      } catch (e) {
        console.warn(`Cannot load SSM Document Content s3://${sourceBucketName}/${documentKey}`);
        throw e;
      }
    }
  }
  return ssmDocumentsContent;
};
