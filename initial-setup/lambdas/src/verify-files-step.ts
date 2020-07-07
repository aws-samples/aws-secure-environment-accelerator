import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { ArtifactOutputFinder } from '@aws-pbmm/common-outputs/lib/artifacts';
import { CentralBucketOutputFinder } from '@aws-pbmm/common-outputs/lib/central-bucket';
import * as c from '@aws-pbmm/common-lambda/lib/config';

interface VerifyFilesInput extends LoadConfigurationInput {
  stackOutputSecretId: string;
  rdgwScripts: string[];
}

interface RdgwArtifactsOutput {
  accountKey: string;
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

const s3 = new S3();
const secrets = new SecretsManager();

export const handler = async (input: VerifyFilesInput) => {
  console.log('Validate existence of all required files ...');
  console.log(JSON.stringify(input, null, 2));

  const { configRepositoryName, stackOutputSecretId, configFilePath, configCommitId, rdgwScripts } = input;
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const errors: string[] = [];
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');

  // calling all file validation methods
  await verifyScpFiles(outputs, acceleratorConfig, errors);
  await verifyIamPolicyFiles(outputs, acceleratorConfig, errors);
  await verifyRdgwFiles(masterAccountKey, rdgwScripts, outputs, errors);
  await verifyCertificates(masterAccountKey, outputs, acceleratorConfig, errors);
  await verifyFirewallFiles(masterAccountKey, outputs, acceleratorConfig, errors);
  await verifyRsyslogFiles(outputs, errors);

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
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }
    if (firewallConfig.license) {
      firewallFiles.push(...firewallConfig.license);
    }
    firewallFiles.push(firewallConfig.config);
  }
  await verifyFiles(centralBucketOutput.bucketName, firewallFiles, errors);
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
