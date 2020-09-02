import { DynamoDB } from 'aws-sdk';

interface ItemInput {
    TableName: string;
    Key: { [key: string]: { S: string } };
}

export const getItemInput = (
    tableName: string,
    itemId: string,
): ItemInput => {
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
            "#a": "value",
        },
        UpdateExpression: 'set #a = :a',
        ExpressionAttributeValues: {
            ":a": { S: attributeValue },
        }
    };
};

