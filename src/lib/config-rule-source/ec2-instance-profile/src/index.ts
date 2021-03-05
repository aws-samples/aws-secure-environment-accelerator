import { ConfigService } from '@aws-accelerator/common/src/aws/configservice';

const config = new ConfigService();

const APPLICABLE_RESOURCES = ['AWS::EC2::Instance'];

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
  configuration: any;
}

type ComplianceType = 'NOT_APPLICABLE' | 'NON_COMPLIANT' | 'COMPLIANT';

interface Evaluation {
  complianceType: ComplianceType;
  annotation: string;
}

export const handler = async (event: ConfigRuleEvent) => {
  console.log(`Checking EC2 Instance Iam Profile attachment...`);
  console.log(JSON.stringify(event, null, 2));

  const ruleParameters = JSON.parse(event.ruleParameters || '{}');
  const invokingEvent = JSON.parse(event.invokingEvent);
  const configurationItem: ConfigurationItem = invokingEvent.configurationItem;

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
  });
};

async function evaluateCompliance(props: { configurationItem: ConfigurationItem }): Promise<Evaluation> {
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
