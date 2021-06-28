import * as AWS from 'aws-sdk';
import * as _ from 'lodash';

const elbv2 = new AWS.ELBv2();
const docClient = new AWS.DynamoDB.DocumentClient();
const ddbTable = process.env.LOOKUP_TABLE || '';

/* interface dnsForwardItem {
  id: string;
  vpcId: string;
  targetAlbDnsName: string;
  targetGroupDestinationPort: number;
  targetGroupProtocol: string;
  rule: {
    sourceListenerArn: string;
    condition: {
      paths: string[];
      hosts: string[];
      priority: number;
    };
  };
  metadata?: {
    targetGroupArn: string;
    ruleArn: string;
    targetGroupIpAddresses: string[];
  };
}
*/

const sleep = (ms: number) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

const createTargetGroup = async (name: string, port: number, vpcId: string, protocol: string) => {
  const targetGroupParams = {
    Name: name,
    Port: port,
    Protocol: protocol,
    VpcId: vpcId,
    TargetType: 'ip',
  };

  return elbv2.createTargetGroup(targetGroupParams).promise();
};

const createListenerRule = async (
  listenerArn: string,
  paths: string[],
  hosts: string[],
  targetGroupArn: string,
  priority: number,
) => {
  console.log('trying to create listener rule');
  console.log(hosts, paths, listenerArn, targetGroupArn, priority);
  const ruleParams: AWS.ELBv2.CreateRuleInput = {
    Actions: [
      {
        TargetGroupArn: targetGroupArn,
        Type: 'forward',
      },
    ],
    ListenerArn: listenerArn,
    Priority: priority,
    Conditions: [],
  };

  if (paths?.length > 0) {
    const pathConfig = {
      Field: 'path-pattern',
      Values: paths,
    };
    ruleParams.Conditions.push(pathConfig);
  }

  if (hosts.length > 0) {
    const hostConfig = {
      Field: 'host-header',
      Values: hosts,
    };
    ruleParams.Conditions.push(hostConfig);
  }

  return elbv2.createRule(ruleParams).promise();
};

const updateListenerRule = async (ruleArn: string, paths: string[], hosts: string[], targetGroupArn: string) => {
  const ruleParams: AWS.ELBv2.ModifyRuleInput = {
    Actions: [
      {
        TargetGroupArn: targetGroupArn,
        Type: 'forward',
      },
    ],
    RuleArn: ruleArn,
    Conditions: [],
  };

  if (paths?.length > 0) {
    const pathConfig = {
      Field: 'path-pattern',
      Values: paths,
    };
    ruleParams?.Conditions?.push(pathConfig);
  }

  if (hosts.length > 0) {
    const hostConfig = {
      Field: 'host-header',
      Values: hosts,
    };
    ruleParams?.Conditions?.push(hostConfig);
  }

  return elbv2.modifyRule(ruleParams).promise();
};

const deleteListenerRule = async (ruleArn: string) => {
  const ruleParams = {
    RuleArn: ruleArn,
  };

  return elbv2.deleteRule(ruleParams).promise();
};

const deleteTargetGroup = async (targetGroupArn: string) => {
  const targetGroupParams = {
    TargetGroupArn: targetGroupArn,
  };

  return elbv2.deleteTargetGroup(targetGroupParams).promise();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const putRecord = async (table: string, record: any) => {
  const putParams = {
    TableName: table,
    Item: record,
  };
  return docClient.put(putParams).promise();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const targetGroupChange = (oldRecord: any, newRecord: any) => {
  const oldTargetGroupAttributes = {
    vpcId: oldRecord.vpcId,
    destinationPort: oldRecord.targetGroupDestinationPort,
    protocol: oldRecord.targetGroupProtocol,
  };

  const newTargetGroupAttributes = {
    vpcId: newRecord.vpcId,
    destinationPort: newRecord.targetGroupDestinationPort,
    protocol: newRecord.targetGroupProtocol,
  };
  return !_.isEqual(oldTargetGroupAttributes, newTargetGroupAttributes);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listernerRulesChange = (oldRecord: any, newRecord: any) => {
  const oldListenerRules = {
    sourceListenerArn: oldRecord.rule.sourceListenerArn,
    priority: oldRecord.rule.condition.priority,
    paths: oldRecord.rule.condition.paths?.sort(),
    hosts: oldRecord.rule.condition.hosts?.sort(),
  };

  const newListenerRules = {
    sourceListenerArn: newRecord.rule.sourceListenerArn,
    priority: newRecord.rule.condition.priority,
    paths: newRecord.rule.condition.paths?.sort(),
    hosts: newRecord.rule.condition.hosts?.sort(),
  };

  return !_.isEqual(oldListenerRules, newListenerRules);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createRecordHandler = async (record: any) => {
  console.log('Record creation detected.');
  try {
    const targetGroup = await createTargetGroup(
      record.id,
      record.targetGroupDestinationPort,
      record.vpcId,
      record.targetGroupProtocol,
    );

    const targetGroupArn = targetGroup?.TargetGroups?.[0].TargetGroupArn ?? '';
    const rule = await createListenerRule(
      record.rule.sourceListenerArn,
      record.rule.condition.paths,
      record.rule.condition.hosts,
      targetGroupArn,
      record.rule.condition.priority,
    );
    const ruleArn = rule?.Rules?.[0].RuleArn ?? '';
    if (!targetGroupArn || !ruleArn) {
      throw new Error(
        `There was an error getting the target group arn or listener rule arn. \nTarget Group Arn: ${targetGroupArn}\nRule Arn: ${ruleArn}`,
      );
    }
    record.metadata = {
      targetGroupArn,
      ruleArn,
      targetGroupIpAddresses: [],
    };
    await putRecord(ddbTable, record);
    console.log('Added metadata to table');
    return record;
  } catch (err) {
    console.log('There was a problem creating resources for the following record', JSON.stringify(record, null, 4));
    throw err;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deleteRecordHandler = async (record: any) => {
  try {
    console.log(`Deleting listener rule and target group for  ${record.id}`);

    await deleteListenerRule(record.metadata.ruleArn);
    console.log('Deleted listener rule.');
    await deleteTargetGroup(record.metadata.targetGroupArn);
    console.log('Deleted target group');

    return;
  } catch (err) {
    console.log('There was a problem deleteing the record: ', JSON.stringify(record, null, 4));

    throw err;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateRecordHandler = async (newRecord: any, oldRecord: any) => {
  try {
    console.log(`The record with id ${newRecord.id} was updated. Performing comparison.`);
    const newRecordClone = _.cloneDeep(newRecord);
    const oldRecordClone = _.cloneDeep(oldRecord);
    delete newRecordClone.metadata;
    delete oldRecordClone.metadata;

    if (_.isEqual(newRecordClone, oldRecordClone)) {
      console.log(`Update Record hanlder found no changes made for record with Id ${newRecord.id}`);
      return;
    }
    if (listernerRulesChange(oldRecord, newRecord)) {
      console.log(`Detected a listener rule change. Modifying rule ${newRecord.metadata.ruleArn}`);

      await updateListenerRule(
        newRecord.metadata.ruleArn,
        newRecord.rule.condition.paths,
        newRecord.rule.condition.hosts,
        newRecord.metadata.targetGroupArn,
      );
    }

    if (targetGroupChange(oldRecord, newRecord)) {
      console.log(
        `Detected a target group change. deleting target group  ${newRecord.metadata.targetGroupArn} and creating a new target group`,
      );
      await deleteRecordHandler(newRecord);
      await sleep(10000);
      await createRecordHandler(newRecord);
    }
  } catch (err) {
    console.log('There was a problem updating a target group or listener rule for the records:');
    console.log('Old Record: ', JSON.stringify(oldRecord, null, 4));
    console.log('New Record: ', JSON.stringify(newRecord, null, 4));
    throw err;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any, _context: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records = event.Records.map((record: any) => {
    if (record.dynamodb.OldImage) {
      record.dynamodb.OldImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.OldImage);
    }
    if (record.dynamodb.NewImage) {
      record.dynamodb.NewImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);
    }
    return record;
  });
  console.log(JSON.stringify(records, null, 4));

  for (const record of records) {
    if (record.eventName === 'INSERT') {
      await createRecordHandler(record.dynamodb.NewImage);
    }
    if (record.eventName === 'MODIFY') {
      await updateRecordHandler(record.dynamodb.NewImage, record.dynamodb.OldImage);
    }

    if (record.eventName === 'REMOVE') {
      await deleteRecordHandler(record.dynamodb.OldImage);
    }
  }

  console.log(JSON.stringify(records, null, 4));
};
