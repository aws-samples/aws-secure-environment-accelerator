import { DynamoDB } from 'aws-sdk';

interface ItemInput {
  TableName: string;
  Key: { [key: string]: { S: string } };
}

export const getItemInput = (tableName: string, itemId: string): ItemInput => {
  return {
    TableName: tableName,
    Key: { id: { S: itemId } },
  };
};

export const getUpdateItemInput = (
  tableName: string,
  itemId: string,
  attributeValue: string,
): DynamoDB.UpdateItemInput => {
  return {
    TableName: tableName,
    Key: {
      id: { S: itemId },
    },
    ExpressionAttributeNames: {
      '#a': 'value',
    },
    UpdateExpression: 'set #a = :a',
    ExpressionAttributeValues: {
      ':a': { S: attributeValue },
    },
  };
};

interface Attribute {
  key: string;
  value: string | boolean;
  name: string;
  type: 'S' | 'N' | 'BOOL' | 'B';
}

/**
 *
 * @param attributes : Attribute[]
 * key: needs to be unique
 *
 * returns updateExpression required for DynamoDB.updateItem
 */
export const getUpdateValueInput = (attributes: Attribute[]) => {
  if (attributes.length === 0) {
    return;
  }
  const expAttributeNames: DynamoDB.ExpressionAttributeNameMap = {};
  const expAttributeValues: DynamoDB.ExpressionAttributeValueMap = {};
  let updateExpression: string = 'set ';
  for (const att of attributes) {
    if (!att.value) {
      continue;
    }
    const attributeValue: DynamoDB.AttributeValue = {};
    expAttributeNames[`#${att.key}`] = att.name;
    if (att.type === 'BOOL') {
      attributeValue.BOOL = att.value as boolean;
    } else {
      attributeValue[att.type] = att.value as string;
    }
    expAttributeValues[`:${att.key}`] = attributeValue;
    updateExpression += `#${att.key} = :${att.key},`;
  }
  // Remove "," if exists as last character
  updateExpression = updateExpression.endsWith(',') ? updateExpression.slice(0, -1) : updateExpression;

  return {
    ExpressionAttributeNames: expAttributeNames,
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expAttributeValues,
  };
};
