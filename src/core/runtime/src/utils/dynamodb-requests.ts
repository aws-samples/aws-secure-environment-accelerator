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
  value: string;
  name: string;
  type: "S"|"N"|"B" ;
}

/**
 * 
 * @param attributes : Attribute[]
 * key: needs to be unique
 * 
 * returns updateExpression required for DynamoDB.updateItem
 */
export const getUpdateValueInput = (
  attributes: Attribute[],
) => {
  if (attributes.length === 0) {
    return;
  }
  const expAttributeNames: DynamoDB.ExpressionAttributeNameMap = {};
  const expAttributeValues: DynamoDB.ExpressionAttributeValueMap = {};
  let updateExtression: string = 'set ';
  for (const att of attributes) {
    const attributeValue: DynamoDB.AttributeValue = {};
    expAttributeNames[`#${att.key}`] = att.name;
    attributeValue[att.type] = att.value;
    expAttributeValues[`:${att.key}`] = attributeValue;
    updateExtression += `#${att.key} = :${att.key},`;
  }
  // Remove "," if exisits in Last character
  updateExtression = updateExtression.endsWith(',')? updateExtression.slice(0, -1): updateExtression;

  return {
    ExpressionAttributeNames: expAttributeNames,
    UpdateExpression: updateExtression,
    ExpressionAttributeValues: expAttributeValues,
  };
};
