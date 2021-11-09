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

import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { StackOutput, getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { ArtifactOutputFinder } from '@aws-accelerator/common-outputs/src/artifacts';
import { CentralBucketOutputFinder } from '@aws-accelerator/common-outputs/src/central-bucket';
import * as c from '@aws-accelerator/common-config/src';
import { loadOutputs } from './utils/load-outputs';

interface VerifyFilesInput extends LoadConfigurationInput {
  rdgwScripts: string[];
  outputTableName: string;
}

interface RdgwArtifactsOutput {
  accountKey: string;
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

const s3 = new S3();
const dynamodb = new DynamoDB();

export const handler = async (input: VerifyFilesInput) => {
  console.log('Validate existence of all required files ...');
  console.log(JSON.stringify(input, null, 2));

  const { configRepositoryName, configFilePath, configCommitId, rdgwScripts, outputTableName } = input;

  const outputs = await loadOutputs(outputTableName, dynamodb);

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const errors: string[] = [];
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');

  // calling all file validation methods
  await verifyScpFiles(outputs, acceleratorConfig, errors);
  await verifyIamPolicyFiles(outputs, acceleratorConfig, errors);
  await verifyRdgwFiles(masterAccountKey, rdgwScripts, outputs, errors);
  await verifyCertificates(masterAccountKey, outputs, acceleratorConfig, errors);
  await verifyFirewallFiles(masterAccountKey, outputs, acceleratorConfig, errors);
  await verifyRsyslogFiles(outputs, errors);
  await verifySsmDocumentFiles(outputs, acceleratorConfig, errors);
  await verifyConfigRuleFiles(outputs, acceleratorConfig, errors);
  await verifyNfwFiles(masterAccountKey, outputs, acceleratorConfig, errors);

  if (errors.length > 0) {
    throw new Error(`There were errors while loading the configuration:\n${errors.join('\n')}`);
  }
};

async function verifyScpFiles(outputs: StackOutput[], config: c.AcceleratorConfig, errors: string[]): Promise<void> {
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'SCP',
  });
  const scpBucketName = artifactOutput.bucketName;
  const scpBucketPrefix = artifactOutput.keyPrefix;

  const globalOptionsConfig = config['global-options'];
  const policyConfigs = globalOptionsConfig.scps;

  const scpPolicies = policyConfigs.map(policyConfig => `${scpBucketPrefix}/${policyConfig.policy}`);
  await verifyFiles(scpBucketName, scpPolicies, errors);
}

async function verifyIamPolicyFiles(
  outputs: StackOutput[],
  config: c.AcceleratorConfig,
  errors: string[],
): Promise<void> {
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'IamPolicy',
  });
  const iamPolicyBucketName = artifactOutput.bucketName;
  const iamPolicyBucketPrefix = artifactOutput.keyPrefix;

  const policyFiles = listIamPolicyFileNames(config);
  const iamPolicies = policyFiles.map(policyFile => `${iamPolicyBucketPrefix}/${policyFile}`);
  await verifyFiles(iamPolicyBucketName, iamPolicies, errors);
}

async function verifyRdgwFiles(
  masterAccountKey: string,
  rdgwScripts: string[],
  outputs: StackOutput[],
  errors: string[],
): Promise<void> {
  const rdgwScriptsOutput: RdgwArtifactsOutput[] = getStackJsonOutput(outputs, {
    accountKey: masterAccountKey,
    outputType: 'RdgwArtifactsOutput',
  });
  if (rdgwScriptsOutput.length === 0) {
    return;
  }
  const rdgwBucketName = rdgwScriptsOutput[0].bucketName;
  const rdgwBucketPrefix = rdgwScriptsOutput[0].keyPrefix;

  const rdgwScriptFiles = rdgwScripts.map(rdgwScriptFile => `${rdgwBucketPrefix}${rdgwScriptFile}`);
  await verifyFiles(rdgwBucketName, rdgwScriptFiles, errors);
}

async function verifyFirewallFiles(
  masterAccountKey: string,
  outputs: StackOutput[],
  config: c.AcceleratorConfig,
  errors: string[],
): Promise<void> {
  const centralBucketOutput = CentralBucketOutputFinder.findOneByName({
    outputs,
    accountKey: masterAccountKey,
  });

  const firewallFiles: string[] = [];
  for (const [_, accountConfig] of config.getAccountConfigs()) {
    const firewallConfigs = accountConfig.deployments?.firewalls;
    if (!firewallConfigs || firewallConfigs.length === 0) {
      continue;
    }
    for (const firewallConfig of firewallConfigs.filter(firewall => c.FirewallEC2ConfigType.is(firewall))) {
      if (!firewallConfig.deploy) {
        continue;
      }
      if (!c.FirewallEC2ConfigType.is(firewallConfig)) {
        continue;
      }
      if (firewallConfig.license) {
        firewallFiles.push(...firewallConfig.license);
      }
      if (firewallConfig.config) {
        firewallFiles.push(firewallConfig.config);
      }
    }
  }
  await verifyFiles(centralBucketOutput.bucketName, firewallFiles, errors);
}

async function verifyNfwFiles(
  masterAccountKey: string,
  outputs: StackOutput[],
  config: c.AcceleratorConfig,
  errors: string[],
): Promise<void> {
  const centralBucketOutput = CentralBucketOutputFinder.findOneByName({
    outputs,
    accountKey: masterAccountKey,
  });

  const nfwFiles: string[] = [];
  for (const [_, accountConfig] of config.getAccountConfigs()) {
    for (const vpc of accountConfig?.vpc || []) {
      if (!vpc.nfw) {
        continue;
      }
      if (!c.AWSNetworkFirewallConfig.is(vpc.nfw)) {
        continue;
      }
      if (vpc.nfw.policy?.path) {
        nfwFiles.push(vpc.nfw.policy.path);
      }
    }
  }
  await verifyFiles(centralBucketOutput.bucketName, nfwFiles, errors);
}

async function verifyCertificates(
  masterAccountKey: string,
  outputs: StackOutput[],
  config: c.AcceleratorConfig,
  errors: string[],
): Promise<void> {
  const centralBucketOutput = CentralBucketOutputFinder.findOneByName({
    outputs,
    accountKey: masterAccountKey,
  });

  const certificateFiles: string[] = [];
  for (const { certificates } of Object.values(config.getCertificateConfigs())) {
    if (!certificates || certificates.length === 0) {
      continue;
    }
    for (const certificate of certificates) {
      if (c.ImportCertificateConfigType.is(certificate)) {
        certificateFiles.push(certificate.cert);
        certificateFiles.push(certificate['priv-key']);
      }
    }
  }
  await verifyFiles(centralBucketOutput.bucketName, certificateFiles, errors);
}

async function verifyRsyslogFiles(outputs: StackOutput[], errors: string[]): Promise<void> {
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'Rsyslog',
  });
  const rsyslogBucketName = artifactOutput.bucketName;
  const rsyslogBucketPrefix = artifactOutput.keyPrefix;

  const rsyslogConfigFile = `${rsyslogBucketPrefix}/rsyslog.conf`;
  await verifyFiles(rsyslogBucketName, [rsyslogConfigFile], errors);
}

async function verifyFiles(bucketName: string, fileNames: string[], errors: string[]): Promise<string[]> {
  for (const fileName of fileNames) {
    console.log(`checking file ${fileName} in s3 bucket ${bucketName}`);
    try {
      await s3.getObjectBody({
        Bucket: bucketName,
        Key: fileName,
      });
    } catch (e) {
      errors.push(`FileCheck: File not found at "s3://${bucketName}/${fileName}"`);
    }
  }
  return errors;
}

function listIamPolicyFileNames(config: c.AcceleratorConfig): string[] {
  const policyFileNames: string[] = [];
  for (const { iam: iamConfig } of Object.values(config.getIamConfigs())) {
    const policies = iamConfig.policies || [];
    const policyNames = policies.flatMap(u => u.policy);
    for (const policyName of policyNames) {
      if (!policyFileNames.includes(policyName)) {
        policyFileNames.push(policyName);
      }
    }
  }
  return policyFileNames;
}

async function verifySsmDocumentFiles(
  outputs: StackOutput[],
  config: c.AcceleratorConfig,
  errors: string[],
): Promise<void> {
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'SsmDocument',
  });
  const ssmDocumentsBucketName = artifactOutput.bucketName;
  const ssmDocumentsBucketPrefix = artifactOutput.keyPrefix;

  const globalOptionsConfig = config['global-options'];
  const automationDocuments = globalOptionsConfig['ssm-automation'].flatMap(d =>
    d.documents.flatMap(dc => dc.template),
  );
  const ssmDocuments = automationDocuments.map(ssmDoc => `${ssmDocumentsBucketPrefix}/${ssmDoc}`);
  await verifyFiles(ssmDocumentsBucketName, ssmDocuments, errors);
}

async function verifyConfigRuleFiles(
  outputs: StackOutput[],
  config: c.AcceleratorConfig,
  errors: string[],
): Promise<void> {
  const artifactOutput = ArtifactOutputFinder.findOneByName({
    outputs,
    artifactName: 'ConfigRules',
  });
  const configRulesBucketName = artifactOutput.bucketName;
  const configRulesBucketPrefix = artifactOutput.keyPrefix;

  const configRules = config['global-options']['aws-config']?.rules.filter(r => r.type === 'custom') || [];
  const configRuleFiles = configRules.map(rule =>
    `${configRulesBucketPrefix}/${rule['runtime-path'] || rule.name.toLowerCase()}`.endsWith('.zip')
      ? `${configRulesBucketPrefix}/${rule['runtime-path'] || rule.name.toLowerCase()}`
      : `${configRulesBucketPrefix}/${rule['runtime-path'] || rule.name.toLowerCase()}.zip`,
  );
  await verifyFiles(configRulesBucketName, configRuleFiles, errors);
}
