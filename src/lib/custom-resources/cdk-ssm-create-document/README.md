# SSM Create Document

This is a custom resource create SSM Document
`createDocument`, `updateDocument`, `updateDocumentDefaultVersion`, `describeDocumentPermission`, `modifyDocumentPermission` and `deleteDocument` API calls.

## Usage

    import { SSMDocument } from '@aws-accelerator/custom-resource-ssm-create-document';

    const ssmDocument = new SSMDocument(accountStack, `SsmDocument-${document.name}`, {
      content: JSON.stringify(content),
      name: documentName,
      roleArn: ssmDocumentRole.roleArn,
      type: 'Automation',
    });
