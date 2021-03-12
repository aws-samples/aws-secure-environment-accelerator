const AWS = require('aws-sdk');
AWS.config.logger = console;

const config = new AWS.ConfigService();

const APPLICABLE_RESOURCES = ['AWS::IAM::Role'];

exports.handler = async function (event, context) {
  console.log(`Custom Rule for checking Polocies attached to IAM role used under Instance Profile...`);
  console.log(JSON.stringify(event, null, 2));

  const invokingEvent = JSON.parse(event.invokingEvent);
  const invocationType = invokingEvent.messageType;
  const ruleParams = JSON.parse(event.ruleParameters || '{}');
  if (!ruleParams.AWSManagedPolicies && !ruleParams.CustomerManagedPolicies) {
    throw new Error('Either "AWSManagedPolicies" or "CustomerManagedPolicies" are required')
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
  }

  if (configurationItem.configuration && !configurationItem.configuration.instanceProfileList) {
    return {
      complianceType: 'NOT_APPLICABLE',
      annotation: 'The IAM Role is not under any Instance Profile',
    };
  } else if (configurationItem.configuration && configurationItem.configuration.instanceProfileList.length === 0) {
    return {
      complianceType: 'NOT_APPLICABLE',
      annotation: 'The IAM Role is not under any Instance Profile',
    };
  } else if (configurationItem.configuration) {
    const existingPolicyNames = configurationItem.configuration.attachedManagedPolicies.map(p => p.policyName);
    const existingPolicyArns = configurationItem.configuration.attachedManagedPolicies.map(p => p.policyArn);
    const requiredAwsPolicies = ruleParams.AWSManagedPolicies.split(',');
    for (const requiredPolicy of requiredAwsPolicies) {
      if (!requiredPolicy) {
        continue;
      }
      if (!existingPolicyNames.includes(requiredPolicy.trim())) {
        return {
          complianceType: 'NON_COMPLIANT',
          annotation: 'The IAM Role is not having required polocies attached ' + requiredPolicy,
        };
      }
    }
    const requiredCustomerPolicies = ruleParams.CustomerManagedPolicies.split(',');
    for (const requiredPolicy of requiredCustomerPolicies) {
      if (!requiredPolicy) {
        continue;
      }
      if (!existingPolicyArns.includes(requiredPolicy.trim())) {
        return {
          complianceType: 'NON_COMPLIANT',
          annotation: 'The IAM Role is not having required polocies attached ' + requiredPolicy,
        };
      }
    }
    return {
      complianceType: 'COMPLIANT',
      annotation: 'The resource is compliant',
    };
  } else {
    // TODO retrive from api call
  }

  return {
    complianceType: 'NON_COMPLIANT',
    annotation: 'The resource logging destination is incorrect',
  };
}