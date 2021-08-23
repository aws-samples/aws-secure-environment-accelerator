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

import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { AcceleratorConfig } from '.';

/**
 * Retrieve the configuration from CodeCommit.
 */
export async function loadAcceleratorConfig(props: {
  repositoryName: string;
  filePath: string;
  commitId: string;
  defaultRegion?: string;
}): Promise<AcceleratorConfig> {
  const { repositoryName, filePath, commitId, defaultRegion } = props;
  const codecommit = new CodeCommit(undefined, defaultRegion);
  try {
    const file = await codecommit.getFile(repositoryName, filePath, commitId);
    const source = file.fileContent.toString();
    return AcceleratorConfig.fromString(source);
  } catch (e) {
    throw new Error(`Unable to load configuration file "${filePath}" in Repository ${repositoryName}\n${e.message}`);
  }
}
