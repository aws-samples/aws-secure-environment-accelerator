export type S3WriteConfig = {
  bucket: string;
  baseDirectory?: string;
};

export type CodeCommitWriteConfig = {
  repository: string;
  branch: string;
  baseDirectory?: string;
};

export type LocalWriteConfig = { baseDirectory?: string };

export type WriteToSourcesConfig = {
  localOnly?: boolean;
  codeCommitConfig?: CodeCommitWriteConfig;
  s3Config?: S3WriteConfig;
  localConfig: LocalWriteConfig;
  region: string;
};

export type WriteToS3Config = {
  fileContent: string | Uint8Array;
  filePath?: string;
  fileName: string;
  bucket: string;
};

export type WriteToCodeCommit = {
  fileContent: string | Uint8Array;
  filePath?: string;
  fileName: string;
  repository: string;
  branch: string;
};

export type WriteToDisk = {
  fileContent: string | Uint8Array;
  filePath?: string;
  fileName: string;
};

export type PutFiles = {
  fileContent: string | Uint8Array;
  filePath?: string;
  fileName: string;
};
