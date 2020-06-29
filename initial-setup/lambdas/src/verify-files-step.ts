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

export const handler = async (input: VerifyFilesInput) => {
  console.log('Validate existence of all required files ...');
  console.log(JSON.stringify(input, null, 2));

  const { configRepositoryName, stackOutputSecretId, configFilePath, configCommitId, rdgwScripts } = input;

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const s3 = new S3();
  const errors: string[] = [];
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');

  const verifyFiles = async (bucketName: string, fileNames: string[]): Promise<void> => {
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
  };

  const verifyScpFiles = async (): Promise<void> => {
    const artifactOutput = ArtifactOutputFinder.findOneByName({
      outputs,
      artifactName: 'SCP',
    });
    const scpBucketName = artifactOutput.bucketName;
    const scpBucketPrefix = artifactOutput.keyPrefix;

    const globalOptionsConfig = acceleratorConfig['global-options'];
    const policyConfigs = globalOptionsConfig.scps;

    const scpPolicies: string[] = [];
    for (const policyConfig of policyConfigs) {
      const policyKey = `${scpBucketPrefix}/${policyConfig.policy}`;
      scpPolicies.push(policyKey);
    }
    await verifyFiles(scpBucketName, scpPolicies);
  };

  const verifyIamPolicyFiles = async (): Promise<void> => {
    const artifactOutput = ArtifactOutputFinder.findOneByName({
      outputs,
      artifactName: 'IamPolicy',
    });
    const iamPolicyBucketName = artifactOutput.bucketName;
    const iamPolicyBucketPrefix = artifactOutput.keyPrefix;

    const policyFiles = listIamPolicyFileNames(acceleratorConfig);
    const iamPolicies: string[] = [];
    for (const policyFile of policyFiles) {
      const policyKey = `${iamPolicyBucketPrefix}/${policyFile}`;
      iamPolicies.push(policyKey);
    }
    await verifyFiles(iamPolicyBucketName, iamPolicies);
  };

  const verifyRdgwFiles = async (): Promise<void> => {
    const rdgwScriptsOutput: RdgwArtifactsOutput[] = getStackJsonOutput(outputs, {
      accountKey: masterAccountKey,
      outputType: 'RdgwArtifactsOutput',
    });
    if (rdgwScriptsOutput.length === 0) {
      return;
    }
    const rdgwBucketName = rdgwScriptsOutput[0].bucketName;
    const rdgwBucketPrefix = rdgwScriptsOutput[0].keyPrefix;

    const rdgwScriptFiles: string[] = [];
    for (const rdgwScriptFile of rdgwScripts) {
      const rdgwScript = `${rdgwBucketPrefix}${rdgwScriptFile}`;
      rdgwScriptFiles.push(rdgwScript);
    }
    await verifyFiles(rdgwBucketName, rdgwScriptFiles);
  };

  const verifyFirewallLicenses = async (): Promise<void> => {
    const centralBucketOutput = CentralBucketOutputFinder.findOneByName({
      outputs,
      accountKey: masterAccountKey,
    });

    const firewallLicenses: string[] = [];
    for (const [_, accountConfig] of acceleratorConfig.getAccountConfigs()) {
      const firewallConfig = accountConfig.deployments?.firewall;
      if (!firewallConfig) {
        continue;
      }
      if (firewallConfig.license) {
        firewallLicenses.push(...firewallConfig.license);
      }
    }
    await verifyFiles(centralBucketOutput.bucketName, firewallLicenses);
  };

  const verifyCertificates = async (): Promise<void> => {
    const centralBucketOutput = CentralBucketOutputFinder.findOneByName({
      outputs,
      accountKey: masterAccountKey,
    });

    const certificateFiles: string[] = [];
    for (const { certificates } of Object.values(acceleratorConfig.getCertificateConfigs())) {
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
    await verifyFiles(centralBucketOutput.bucketName, certificateFiles);
  };

  // calling all file validation methods
  await verifyScpFiles();
  await verifyIamPolicyFiles();
  await verifyRdgwFiles();
  await verifyCertificates();
  await verifyFirewallLicenses();

  if (errors.length > 0) {
    throw new Error(`There were errors while loading the configuration:\n${errors.join('\n')}`);
  }
};

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
