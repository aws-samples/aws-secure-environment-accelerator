import { LandingZoneAccountType, BaseLineType } from '@aws-pbmm/common-lambda/lib/config';

export interface LoadConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  baseline?: BaseLineType;
}

export interface LoadConfigurationOutput {
  organizationalUnits: ConfigurationOrganizationalUnit[];
  accounts: ConfigurationAccount[];
  warnings: string[];
  configCommitId: string;
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
