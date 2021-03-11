const AWS = require('aws-sdk');
AWS.config.logger = console;

const config = new AWS.ConfigService();

const APPLICABLE_RESOURCES = ['AWS::EC2::Instance'];

exports.handler = async function(event, context) {
  console.log(`Custom Rule for checking EC2 Instance Iam Profile attachment...`);
  console.log(JSON.stringify(event, null, 2));

  const invokingEvent = JSON.parse(event.invokingEvent);
  const invocationType = invokingEvent.messageType;
  if (invocationType === 'ScheduledNotification') {
    return;
  }
  const configurationItem = invokingEvent.configurationItem;

  const evaluation = await evaluateCompliance({
    configurationItem,
  });

  console.debug(`Evaluation`);
  console.debug(JSON.stringify(evaluation, null, 2));

  await config.putEvaluations({
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
  }).promise();
};

async function evaluateCompliance(props) {
  const { configurationItem } = props;
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

  if (configurationItem.configuration && configurationItem.configuration.iamInstanceProfile) {
    return {
      complianceType: 'COMPLIANT',
      annotation: 'The resource is compliant',
    };
  } else if (configurationItem.configuration && !configurationItem.configuration.iamInstanceProfile) {
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'The EC2 instance has no IAM profile attached',
    };
  } else {
    // TODO retrive from api call
  }

  return {
    complianceType: 'NON_COMPLIANT',
    annotation: 'The resource logging destination is incorrect',
  };
}
