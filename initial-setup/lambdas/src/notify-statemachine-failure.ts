import { SNS } from '@aws-pbmm/common-lambda/lib/aws/sns';
import { StepFunctions } from '@aws-pbmm/common-lambda/lib/aws/stepfunctions';

interface NotifyErrorInput {
  error: string;
  cause: string;
  notificationTopicArn: string;
  executionId: string;
  acceleratorVersion: string;
}

const sns = new SNS();
const sfn = new StepFunctions();

export const handler = async (input: NotifyErrorInput): Promise<string> => {
  console.log(`State Machine Execution Failed...`);
  console.log(JSON.stringify(input, null, 2));

  const { cause, executionId, notificationTopicArn, acceleratorVersion } = input;
  const errorCause = JSON.parse(cause);

  try {
    if (errorCause.Input) {
      console.log(`Trying to convert JSON Input string to JSON object`);
      errorCause.Input = JSON.parse(errorCause.Input);
    }
  } catch (error) {
    console.error(`Error while converting JSON string to JSON Object`);
    console.error(error.message);
  }

  // Retriving Failed State
  try {
    const failedState = await getFailedState(executionId);
    errorCause.FailedState = failedState!;
  } catch (error) {
    console.error(error);
  }

  // Adding Code Version to email JSON
  errorCause.acceleratorVersion = acceleratorVersion;

  console.log(`Publishing Error to SNS Topic`);
  console.log(JSON.stringify(errorCause, null, 2));
  await sns.publish({
    // TODO Use Pretty when we merge "6.10"
    Message: JSON.stringify(errorCause),
    TopicArn: notificationTopicArn,
    MessageStructure: 'email-json',
    Subject: `Accelerator State Machine Failure`,
  });
  return 'SUCCESS';
};

async function getFailedState(executionArn: string): Promise<string | undefined> {
  const recentEvents = await sfn.getExecutionHistory({
    executionArn,
    reverseOrder: true,
  });
  const abortEvent = recentEvents.find(e => e.type === 'TaskStateAborted');
  if (!abortEvent) {
    return;
  }
  const abortEventId = abortEvent.id;
  const checkEvents = recentEvents.filter(e => e.id < abortEventId);
  const previousStartState = checkEvents.find(e => e.type === 'TaskStateEntered');
  if (!previousStartState) {
    return;
  }
  return previousStartState.stateEnteredEventDetails?.name;
}
