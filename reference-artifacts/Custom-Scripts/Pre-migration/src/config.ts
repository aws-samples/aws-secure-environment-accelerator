export interface Config {
  repositoryName: string;
  parametersTableName: string;
  homeRegion: string;
  assumeRoleName?: string;
  aseaPrefix?: string;
  acceleratorName?: string;
  mappingBucketName?: string;
  centralBucket?: string;
  configOutputFolder?: string;
  operationsAccountId?: string;
  installerStackName?: string;
}
