# Security Hub Enable Standards

This is a custom resource to share SSM Document to accounts. Will use `ssm` `modifyDocumentPermission` API call.

## Usage

    import { SSMDocumentShare } from '@aws-accelerator/custom-resource-ssm-document-share';

    const ssmDocumentShare = new SSMDocumentShare(accountStack, `SsmDocument${document.name}`, {
      accountIds: shareAccountIds,
      name: documentName,
      roleArn: ssmDocumentRole.roleArn,
    });
