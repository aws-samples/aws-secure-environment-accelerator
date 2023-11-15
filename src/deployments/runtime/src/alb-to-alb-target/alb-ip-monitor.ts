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
import { any, DynamoDBDocument, PutCommandInput, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

import {
  DeregisterTargetsCommandInput,
  DeregisterTargetsCommandOutput,
  ElasticLoadBalancingV2,
  RegisterTargetsCommandInput,
  RegisterTargetsCommandOutput,
} from '@aws-sdk/client-elastic-load-balancing-v2';

const routeLookupTable = process.env.LOOKUP_TABLE ?? '';

const docClient = DynamoDBDocument.from(new DynamoDB());
const elbv2 = new ElasticLoadBalancingV2();

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
  const scanParmas: ScanCommandInput = {
    TableName: tableName,
  };
  const scanResults: Record<string, any>[] = [];
  let results;
  do {
    results = await docClient.scan(scanParmas);
    results.Items?.forEach(item => scanResults.push(item));
    scanParmas.ExclusiveStartKey = results.LastEvaluatedKey;
  } while (typeof results.LastEvaluatedKey != 'undefined');

  return scanResults as dnsForwardItem[];
};

const registerTargets = async (
  targetGroupArn: string,
  ips: string[],
  port: number,
): Promise<RegisterTargetsCommandOutput> => {
  const targets = ips.map(ip => {
    return {
      Id: ip,
      Port: port,
      AvailabilityZone: 'all',
    };
  });

  const registerTargetsParams: RegisterTargetsCommandInput = {
    TargetGroupArn: targetGroupArn,
    Targets: targets,
  };

  return elbv2.registerTargets(registerTargetsParams);
};

const deregisterTargets = async (targetGroupArn: string, ips: string[]): Promise<DeregisterTargetsCommandOutput> => {
  console.log(`Deregistering IP addresses ${JSON.stringify(ips)} from target group ${targetGroupArn}`);
  const targets = ips.map(ip => {
    return {
      Id: ip,
    };
  });

  const deregisterTargetsParams: DeregisterTargetsCommandInput = {
    TargetGroupArn: targetGroupArn,
    Targets: targets,
  };

  return elbv2.deregisterTargets(deregisterTargetsParams);
};

const dnslookup = async (host: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    dns.lookup(host, { all: true, family: 4 }, (err, addresses) => {
      if (err) {
        reject(err);
      } else {
        resolve(
          addresses
            .map(item => {
              return item.address;
            })
            .sort(),
        );
      }
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
  const putParams: PutCommandInput = {
    TableName: routeLookupTable,
    Item: record,
  };
  return docClient.put(putParams);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (_event: any, _context: any) => {
  const targetGroupRecords = (await scanTable(routeLookupTable)) ?? [];

  for (const targetGroupRecord of targetGroupRecords) {
    try {
      // Get Hostname Lookup
      targetGroupRecord.dnsLookupIps = [];
      try {
        targetGroupRecord.dnsLookupIps = await dnslookup(targetGroupRecord.targetAlbDnsName);
      } catch (err) {
        console.log(err);
      }
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
