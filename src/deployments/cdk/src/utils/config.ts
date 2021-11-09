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

import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import * as fs from 'fs';
import * as path from 'path';
import { loadAcceleratorConfig as load } from '@aws-accelerator/common-config/src/load';

export async function loadAcceleratorConfig(): Promise<AcceleratorConfig> {
  if (process.env.CONFIG_MODE === 'development') {
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot find local config.json at "${configPath}"`);
    }
    const contents = fs.readFileSync(configPath);
    return AcceleratorConfig.fromBuffer(contents);
  }

  const configFilePath = process.env.CONFIG_FILE_PATH!;
  const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
  const configCommitId = process.env.CONFIG_COMMIT_ID!;
  if (!configFilePath || !configRepositoryName || !configCommitId) {
    throw new Error(
      `The environment variables "CONFIG_FILE_PATH" and "CONFIG_REPOSITORY_NAME" and "CONFIG_COMMIT_ID" need to be set`,
    );
  }
  // Retrieve Configuration from Code Commit with specific commitId
  return load({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
}
