/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { CodeCommit } from '../aws/codecommit';

export async function loadAseaConfig(repositoryName: string, region: string): Promise<string> {
  const codecommit = new CodeCommit(undefined, region);
  const configFileRepositoryParams = {
    repositoryName: repositoryName,
    // Reading Accelerator full configuration
    filePath: 'raw/config.json',
  };
  const configFileResponse = await codecommit.getFile(configFileRepositoryParams);

  const configFileContents = JSON.parse(configFileResponse.fileContent!.toString());

  return configFileContents;
}
