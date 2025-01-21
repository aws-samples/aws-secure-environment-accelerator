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

import * as fs from 'fs';
import { AcceleratorConfig } from '.';
import { CodeCommit } from '../common/aws/codecommit';

/**
 * Retrieve the configuration from CodeCommit.
 */
export async function loadAseaConfig(props: {
  repositoryName: string;
  filePath: string;
  defaultRegion?: string;
  localFilePath?: string;
}): Promise<AcceleratorConfig> {
  const { repositoryName, filePath, defaultRegion, localFilePath } = props;
  if (localFilePath) {
    const fileContent = fs.readFileSync(localFilePath, 'utf8');
    return AcceleratorConfig.fromString(fileContent);
  }
  const codecommit = new CodeCommit(undefined, defaultRegion);
  try {
    const file = await codecommit.getFile({ repositoryName, filePath });
    const source = file.fileContent!.toString();
    return AcceleratorConfig.fromString(source);
  } catch (e: any) {
    throw new Error(
      `Unable to load configuration file "${filePath}" in Repository ${repositoryName}\n${e.message} code:${e.code}`,
    );
  }
}
