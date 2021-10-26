import { LandingZoneAccountType, BaseLineType } from '@aws-accelerator/common-config/src';

export interface LoadConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  organizationAdminRole: string;
  baseline?: BaseLineType;
  acceleratorVersion?: string;
  configRootFilePath?: string;
  storeAllOutputs?: boolean;
  phases?: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smInput?: any;
}

export interface LoadConfigurationOutput {
  organizationalUnits: ConfigurationOrganizationalUnit[];
  accounts: ConfigurationAccount[];
  regions: string[];
  warnings: string[];
  configCommitId: string;
  acceleratorVersion?: string;
}

export interface ConfigurationAccount {
  accountId?: string;
  accountKey: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  isMandatoryAccount: boolean;
  landingZoneAccountType?: LandingZoneAccountType;
  ouPath?: string;
}

export interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
  ouPath: string;
}
