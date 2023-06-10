const AWS = require('aws-sdk');
AWS.config.logger = console;

const config = new AWS.ConfigService();

const APPLICABLE_RESOURCES = ['AWS::IAM::Role'];

exports.handler = async function (event, context) {
    console.log(`Custom Rule for checking Tags on IAM Roles to support SSM Quick Setup Patching...`);
    console.log(JSON.stringify(event, null, 2));

    const invokingEvent = JSON.parse(event.invokingEvent);
    const invocationType = invokingEvent.messageType;
    const ruleParams = JSON.parse(event.ruleParameters || '{}');
    if (!ruleParams.RoleNames || !ruleParams.QSConfigID) {
        throw new Error('Either "RoleNames" or "QSConfigID" are required')
    }
    if (invocationType === 'ScheduledNotification') {
        return;
    }

    const configurationItem = invokingEvent.configurationItem;

    const evaluation = await evaluateCompliance({
        configurationItem,
        ruleParams,
    });

    console.debug(`Evaluation`);
    console.debug(JSON.stringify(evaluation, null, 2));

    await config
        .putEvaluations({
            ResultToken: event.resultToken,
            Evaluations: [
                {
                    ComplianceResourceId: configurationItem.resourceId,
                    ComplianceResourceType: configurationItem.resourceType,
                    ComplianceType: evaluation.complianceType,
                    OrderingTimestamp: configurationItem.configurationItemCaptureTime,
                    Annotation: evaluation.annotation,
                },
            ],
        })
        .promise();
};

async function evaluateCompliance(props) {
    const { configurationItem, ruleParams } = props;
    if (!APPLICABLE_RESOURCES.includes(configurationItem.resourceType)) {
        return {
            complianceType: 'NOT_APPLICABLE',
            annotation: `The rule doesn't apply to resources of type ${configurationItem.resourceType}`,
        };
    } else if (configurationItem.configurationItemStatus === 'ResourceDeleted') {
        return {
            complianceType: 'NOT_APPLICABLE',
            annotation: 'The configuration item was deleted and could not be validated',
        };
    } else if (configurationItem.configurationItemStatus === 'ResourceNotRecorded' || configurationItem.configurationItemStatus === 'ResourceDeletedNotRecorded') {
        return {
            complianceType: 'NOT_APPLICABLE',
            annotation: 'The configuration item is not recorded in this region and need not be validated',
        };
    }
    
    if (configurationItem.configuration) {
        const existingTags = configurationItem.configuration.tags;
        const requiredQAConfigID = ruleParams.QSConfigID;
        const targetRoleNames = ruleParams.RoleNames.split(',').map(item => item.trim());

        const tagKey = `QSConfigId-${requiredQAConfigID}`;

        if (!targetRoleNames.includes(configurationItem.configuration.roleName)) {
            return {
                complianceType: 'NOT_APPLICABLE',
                annotation: 'The configuration item is not recorded in this region and need not be validated',
            };
        }

        for (const existingTag of existingTags) {
            if (!existingTag) {
                continue;
            }
            if (existingTag.key == tagKey && existingTag.value == requiredQAConfigID) {
                return {
                    complianceType: 'COMPLIANT',
                    annotation: 'The IAM Role is complaint and has the expected tag ' + tagKey,
                };
            }
        }
    } else {
        return {
            complianceType: 'NOT_APPLICABLE',
            annotation: 'The configuration item is not recorded in this region and need not be validated',
        };
    }

    return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'The IAM Role does not have the required tag',
    };
}