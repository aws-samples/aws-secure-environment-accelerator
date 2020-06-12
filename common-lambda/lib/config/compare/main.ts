import { CodeCommit } from '../../aws/codecommit';
import { AcceleratorConfig } from '..';
import { compareConfiguration, LHS, RHS } from '../../aws/config-diff';
import * as path from 'path';
import * as fs from 'fs';
import * as compareAccounts from './accounts';
import * as vpcConfig from './vpc';
import { Diff } from 'deep-diff';

const SUBNET_DEFINITIONS = ['vpc', 'subnets', 'definitions'];
const ROUTE_TABLES = ['vpc', 'route-tables'];
const NACLS = ['vpc', 'subnets', 'nacls'];
const CIDR = ['vpc', 'subnets', 'definitions', 'cidr', 'ipv4', 'value'];
const CIDR2 = ['vpc', 'subnets', 'definitions', 'cidr2', 'ipv4', 'value'];
const TGW = ['vpc', 'tgw-attach'];

/**
 * Retrieve and compare previous and the current configuration from CodeCommit
 */
export async function compareAcceleratorConfig(props: {
  repositoryName: string;
  filePath: string;
  commitId: string;
  previousCommitId: string;
}): Promise<AcceleratorConfig | undefined> {
  const { repositoryName, filePath, commitId, previousCommitId } = props;

  const validateConfig = async (
    accountNames: string[],
    differences: Diff<LHS, RHS>[],
  ): Promise<void> => {
    // below functions check whether sub accounts removed from config file
    await compareAccounts.deletedSubAccount(accountNames, differences);

    // the below function checks renaming of the sub accounts
    await vpcConfig.deletedConfigDependency(differences, 'account-name');
    // await compareAccounts.editedAccountDependency(accountNames, differences);
    // await compareAccounts.editedAccountDependencyArray(accountNames, differences);

    // below functions check whether vpc related configuration removed from config file
    await vpcConfig.deletedConfig(differences, 'vpc');
    await vpcConfig.deletedConfigDependency(differences, 'vpc');
    await vpcConfig.deletedConfigDependencyArray(differences, 'vpc');

    // below functions check whether subnets related configuration removed from config file
    await vpcConfig.editedConfigDependencyArray(differences, SUBNET_DEFINITIONS);
    await vpcConfig.deletedConfigDependencyArray(differences, 'subnets');
    await vpcConfig.deletedConfigDependency(differences, 'definitions');
    await vpcConfig.deletedConfigDependency(differences, 'share-to-ou-accounts');

    await vpcConfig.deletedConfigDependencyArray(differences, 'share-to-specific-accounts');
    await vpcConfig.editedConfigDependency(differences, ['share-to-specific-accounts']);

    // below functions check whether route tables related configuration removed from config file
    await vpcConfig.editedConfigDependencyArray(differences, ROUTE_TABLES);

    // below functions check whether nacls related configuration removed from config file
    await vpcConfig.editedConfigDependencyArray(differences, NACLS);

    // below functions check whether cidr related configuration removed from config file
    await vpcConfig.editedConfigDependency(differences, CIDR);

    // below functions check whether cidr2 related configuration removed from config file
    await vpcConfig.editedConfigDependency(differences, CIDR2);

    // below functions check whether tgw related configuration removed from config file
    await vpcConfig.deletedConfigDependency(differences, 'tgw-attach');
    await vpcConfig.editedConfigDependency(differences, TGW);

    // below functions check whether mad related configuration removed from config file
    await vpcConfig.deletedConfigDependency(differences, 'mad');

    // below functions check whether adc related configuration removed from config file
    await vpcConfig.deletedConfigDependency(differences, 'adc');
  };

  // const codecommit = new CodeCommit();
  try {
    // console.log('getting previous committed file from code commit');
    // const previousFile = await codecommit.getFile(repositoryName, filePath, previousCommitId);
    // const original = previousFile.fileContent.toString();

    // console.log('getting latest committed file from code commit');
    // const file = await codecommit.getFile(repositoryName, filePath, commitId);
    // console.log('reading latest committed file as string');
    // const modified = file.fileContent.toString();

    const previousFilePath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'test-compare-config',
      'config-previous.json',
    );
    const previousFileContent = fs.readFileSync(previousFilePath);
    // console.log('reading previous committed file as string');
    const previousContent = previousFileContent.toString();

    // console.log('converting previous committed file into AcceleratorConfig object');
    const previousConfig = AcceleratorConfig.fromString(previousContent);

    const localFilePath = path.join(__dirname, '..', '..', '..', '..', 'test-compare-config', 'config.json');
    const fileContent = fs.readFileSync(localFilePath);
    // console.log('reading latest committed file as string');
    const modifiedContent = fileContent.toString();
    // console.log('converting latest committed file into AcceleratorConfig object');
    const modifiedConfig = AcceleratorConfig.fromString(modifiedContent);

    // compare both the configurations
    const configChanges = compareConfiguration(previousConfig, modifiedConfig);
    console.log(configChanges);
    if (!configChanges) {
      console.log('no differences found');
      return AcceleratorConfig.fromString(modifiedContent);
    }

    // get all the accounts from previous commit
    const accountNames = previousConfig.getAccountConfigs().map(([_, accountConfig]) => accountConfig['account-name']);

    await validateConfig(accountNames, configChanges);

    return AcceleratorConfig.fromString(modifiedContent);
  } catch (e) {
    throw new Error(`Unable to load configuration file "${filePath}" in Repository ${repositoryName}\n${e.message}`);
  }
}

// compareAcceleratorConfig({
//   repositoryName: 'PBMMAccel-Config-Repo',
//   filePath: 'config.json',
//   commitId: '6707bae30a71f82f987b9680ed662681bc5ccbdb',
//   previousCommitId: '28fc52cfdc37e426e96d4ae95f2b00444d2f1fca',
// });
