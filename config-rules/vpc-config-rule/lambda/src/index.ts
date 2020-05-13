import * as AWS from 'aws-sdk';

const config = new AWS.ConfigService();
const ec2 = new AWS.EC2();

const APPLICABLE_RESOURCES = ['AWS::EC2::VPC'];

interface ConfigRuleEvent {
  resultToken: string;
  invokingEvent: string;
  /**
   * JSON string containing the InputParameters passed to the AWS Config Rule.
   */
  ruleParameters?: string;
}

interface ConfigurationItem {
  configurationItemStatus: string;
  configurationItemCaptureTime: Date;
  resourceType: string;
  resourceId: string;
}

type ComplianceType = 'NOT_APPLICABLE' | 'NON_COMPLIANT' | 'COMPLIANT';

interface Evaluation {
  complianceType: ComplianceType;
  annotation: string;
}

export const handler = async (event: ConfigRuleEvent) => {
  console.log(`Checking VPC compliance...`);
  console.log(JSON.stringify(event, null, 2));

  if (!event.ruleParameters) {
    throw new Error('The InputParameters should be set!');
  }

  const ruleParameters = JSON.parse(event.ruleParameters);
  if (!ruleParameters.expectedVpcFlowLogBucket) {
    throw new Error(`The 'expectedVpcFlowLogBucket' in InputParameters should be set!`);
  }

  const invokingEvent = JSON.parse(event.invokingEvent);
  const configurationItem: ConfigurationItem = invokingEvent.configurationItem;

  const evaluation = await evaluateCompliance({
    configurationItem,
    expectedVpcFlowLogBucket: ruleParameters.expectedVpcFlowLogBucket,
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

async function evaluateCompliance(props: {
  configurationItem: ConfigurationItem;
  expectedVpcFlowLogBucket: string;
}): Promise<Evaluation> {
  const { configurationItem, expectedVpcFlowLogBucket } = props;
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

  const describeFlowLogs = await ec2
    .describeFlowLogs({
      Filter: [
        {
          Name: 'resource-id',
          Values: [configurationItem.resourceId],
        },
      ],
    })
    .promise();

  const flowLogs = describeFlowLogs?.FlowLogs;
  if (!flowLogs || flowLogs.length === 0) {
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'The resource does not have a flow log destination',
    };
  }

  console.debug(`Response from describeFlowLogs`);
  console.debug(JSON.stringify(flowLogs, null, 2));

  for (const flowLog of flowLogs) {
    if (flowLog.LogDestination === props.expectedVpcFlowLogBucket) {
      return {
        complianceType: 'COMPLIANT',
        annotation: 'The resource is compliant',
      };
    }
  }

  return {
    complianceType: 'NON_COMPLIANT',
    annotation: 'The resource logging destination is incorrect',
  };
}
