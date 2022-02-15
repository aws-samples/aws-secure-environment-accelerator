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

import * as c from '@aws-accelerator/config';

const zlib = require('zlib');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any, _context: any) => {
  console.log(`Processing firehose records...`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firehoseRecordsOutput: any = {};
  // Create result object.
  firehoseRecordsOutput.records = [];

  const tmpMapping = process.env.DYNAMIC_S3_LOG_PARTITIONING_MAPPING;
  let mappings: c.S3LogPartition[] | undefined;
  if (tmpMapping && tmpMapping.length > 0) {
    mappings = JSON.parse(tmpMapping);
  }

  for (const firehoseRecordInput of event.records) {
    try {
      const payload = Buffer.from(firehoseRecordInput.data, 'base64');
      const tmp = zlib.gunzipSync(payload).toString('utf-8');
      const jsonVal = JSON.parse(tmp);

      if ('logGroup' in jsonVal) {
        console.log(`Record LogGroup: ${jsonVal.logGroup}`);

        let serviceName = null;

        if (mappings) {
          for (const mapping of mappings) {
            if (jsonVal.logGroup.indexOf(mapping.logGroupPattern) >= 0) {
              serviceName = mapping.s3Prefix;
              break; // Take the first match
            }
          }
        }

        const approxArrivalTimestamp = new Date(firehoseRecordInput.approximateArrivalTimestamp);

        let rootPrefix = process.env.LOG_PREFIX || 'CloudWatchLogs';
        if (rootPrefix[rootPrefix.length - 1] === '/') {
          rootPrefix = rootPrefix.substring(0, rootPrefix.length - 1);
        }

        let calculatedPrefix = rootPrefix;
        if (serviceName) {
          calculatedPrefix += `/${serviceName}`;
        }

        calculatedPrefix += `/${approxArrivalTimestamp.getFullYear()}`;
        calculatedPrefix += `/${(approxArrivalTimestamp.getMonth() + 1).toLocaleString('en-US', {
          minimumIntegerDigits: 2,
        })}`;
        calculatedPrefix += `/${approxArrivalTimestamp.getDate().toLocaleString('en-US', { minimumIntegerDigits: 2 })}`;
        calculatedPrefix += `/${approxArrivalTimestamp
          .getHours()
          .toLocaleString('en-US', { minimumIntegerDigits: 2 })}`;
        calculatedPrefix += `/`;

        const partitionKeys = {
          dynamicPrefix: calculatedPrefix,
        };

        firehoseRecordInput.result = 'Ok';
        firehoseRecordInput.metadata = {
          partitionKeys,
        };
        // Add the record to the list of output records.
        firehoseRecordsOutput.records.push(firehoseRecordInput);

        console.log(partitionKeys);
      } else {
        firehoseRecordsOutput.records.push(firehoseRecordInput);
      }
    } catch (err) {
      console.warn(err);
      firehoseRecordsOutput.records.push(firehoseRecordInput);
    }
  }

  return firehoseRecordsOutput;
};
