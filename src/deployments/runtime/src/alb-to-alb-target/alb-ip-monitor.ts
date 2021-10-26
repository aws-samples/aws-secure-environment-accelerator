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

import * as dns from 'dns';
import * as AWS from 'aws-sdk';

const routeLookupTable = process.env.LOOKUP_TABLE ?? '';

const docClient = new AWS.DynamoDB.DocumentClient();
const elbv2 = new AWS.ELBv2();

export interface dnsForwardItem {
  id: string;
  ipAddList?: string[];
  ipRemoveList?: string[];
  dnsLookupIps?: string[];
  targetAlbDnsName: string;
  targetGroupDestinationPort: number;
  metadata: {
    targetGroupArn: string;
    targetGroupIpAddresses: string[];
  };
}

const scanTable = async (tableName: string): Promise<dnsForwardItem[]> => {
  console.log(`Scanning route lookup table ${routeLookupTable}`);
  const scanParmas: AWS.DynamoDB.DocumentClient.ScanInput = {
    TableName: tableName,
  };
  const scanResults: AWS.DynamoDB.DocumentClient.AttributeMap[] = [];
  let results;
  do {
    results = await docClient.scan(scanParmas).promise();
    results.Items?.forEach(item => scanResults.push(item));
    scanParmas.ExclusiveStartKey = results.LastEvaluatedKey;
  } while (typeof results.LastEvaluatedKey != 'undefined');

  return scanResults as dnsForwardItem[];
};

const registerTargets = async (
  targetGroupArn: string,
  ips: string[],
  port: number,
): Promise<AWS.ELBv2.RegisterTargetsOutput> => {
  const targets = ips.map(ip => {
    return {
      Id: ip,
      Port: port,
      AvailabilityZone: 'all',
    };
  });

  const registerTargetsParams: AWS.ELBv2.RegisterTargetsInput = {
    TargetGroupArn: targetGroupArn,
    Targets: targets,
  };

  return elbv2.registerTargets(registerTargetsParams).promise();
};

const deregisterTargets = async (targetGroupArn: string, ips: string[]): Promise<AWS.ELBv2.DeregisterTargetsOutput> => {
  console.log(`Deregistering IP addresses ${JSON.stringify(ips)} from target group ${targetGroupArn}`);
  const targets = ips.map(ip => {
    return {
      Id: ip,
    };
  });

  const deregisterTargetsParams: AWS.ELBv2.DeregisterTargetsInput = {
    TargetGroupArn: targetGroupArn,
    Targets: targets,
  };

  return elbv2.deregisterTargets(deregisterTargetsParams).promise();
};

const dnslookup = async (host: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    dns.lookup(host, { all: true, family: 4 }, (err, addresses) => {
      if (err) {
        reject(err);
      }
      resolve(
        addresses
          .map(item => {
            return item.address;
          })
          .sort(),
      );
    });
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const removeItem = (arr: any[], item: any) => {
  const index = arr.indexOf(item);
  if (index > -1) {
    arr.splice(index, 1);
  }
  return arr;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const putRecord = async (record: any) => {
  const putParams: AWS.DynamoDB.DocumentClient.PutItemInput = {
    TableName: routeLookupTable,
    Item: record,
  };
  return docClient.put(putParams).promise();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (_event: any, _context: any) => {
  const targetGroupRecords = (await scanTable(routeLookupTable)) ?? [];

  for (const targetGroupRecord of targetGroupRecords) {
    try {
      // Get Hostname Lookup
      targetGroupRecord.dnsLookupIps = (await dnslookup(targetGroupRecord.targetAlbDnsName)) ?? [];
      // Get Ip Addresses to add to current IP List
      targetGroupRecord.ipAddList =
        targetGroupRecord.dnsLookupIps?.filter(ip => {
          return !targetGroupRecord.metadata?.targetGroupIpAddresses?.includes(ip);
        }) ?? [];
      // Get Ip addresses to remove from current list
      targetGroupRecord.ipRemoveList =
        targetGroupRecord.metadata?.targetGroupIpAddresses?.filter(ip => {
          return !targetGroupRecord.dnsLookupIps?.includes(ip);
        }) ?? [];

      if (targetGroupRecord.ipAddList?.length > 0) {
        // Register new ips
        console.log(
          `Registering new ips ${JSON.stringify(targetGroupRecord.ipAddList)} to target ${
            targetGroupRecord.metadata.targetGroupArn
          } with port ${targetGroupRecord.targetGroupDestinationPort}`,
        );
        await registerTargets(
          targetGroupRecord.metadata.targetGroupArn,
          targetGroupRecord.ipAddList,
          targetGroupRecord.targetGroupDestinationPort,
        );
        // Add new ips to record
        targetGroupRecord.metadata.targetGroupIpAddresses.push(...targetGroupRecord.ipAddList);
      } else {
        console.log('No new Ip addresses to register');
      }
      if (targetGroupRecord.ipRemoveList?.length > 0) {
        // Deregister old ips
        console.log(
          `Deregistering old ip addresses ${JSON.stringify(
            targetGroupRecord.ipRemoveList,
          )} from target group targetGroupRecord.metadata.targetGroupArn`,
        );
        await deregisterTargets(targetGroupRecord.metadata.targetGroupArn, targetGroupRecord.ipRemoveList);
        // Remove old ips from record
        targetGroupRecord.ipRemoveList?.forEach(ip => {
          console.log(targetGroupRecord.metadata.targetGroupIpAddresses, ip);
          targetGroupRecord.metadata.targetGroupIpAddresses = removeItem(
            targetGroupRecord.metadata.targetGroupIpAddresses,
            ip,
          );
        });
      } else {
        console.log('No old ip addresses to deregister');
      }

      // Delete add, remove, and dnslookup list before writing to table
      delete targetGroupRecord.ipAddList;
      delete targetGroupRecord.ipRemoveList;
      delete targetGroupRecord.dnsLookupIps;
      console.log('Writing record to DDB table ', JSON.stringify(targetGroupRecord, null, 4));
      await putRecord(targetGroupRecord);
    } catch (err) {
      console.log('There was a problem updating the record ', JSON.stringify(targetGroupRecord, null, 4));

      console.log(err);
    }
  }
  return 'Done';
};
