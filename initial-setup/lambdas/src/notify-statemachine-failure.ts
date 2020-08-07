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
  console.log('State Machine Execution Failed...');
  console.log(JSON.stringify(input, null, 2));

  const { cause, executionId, notificationTopicArn, acceleratorVersion } = input;
  const errorCause = JSON.parse(cause);

  // Retriving Failed State
  let failedState: string | undefined;
  try {
    failedState = await getFailedState(executionId);
  } catch (error) {
    console.error(error);
  }

  const errorCauseReturn = {
    // Adding Code Version to email JSON
    acceleratorVersion,
    // Adding Failed State
    FailedState: failedState!,
    // Rest of the error
    ...errorCause,
  }

  try {
    if (errorCauseReturn.Input) {
      console.log('Trying to convert JSON Input string to JSON object');
      errorCauseReturn.Input = JSON.parse(errorCauseReturn.Input);
    }
  } catch (error) {
    console.error('Error while converting JSON string to JSON Object');
    console.error(error.message);
  }

  console.log('Publishing Error to SNS Topic');
  console.log(JSON.stringify(errorCauseReturn, null, 2));
  await sns.publish({
    Message: JSON.stringify(errorCauseReturn),
    TopicArn: notificationTopicArn,
    Subject: 'Accelerator State Machine Failure',
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
handler({
  "notificationTopicArn": "arn:aws:sns:ca-central-1:538235518685:PBMMAccel--MainStateMachine-Status_topic",
  "acceleratorVersion": "1.1.4",
  "executionId": "arn:aws:states:ca-central-1:538235518685:execution:PBMMAccel-MainStateMachine_sm:234d8a6a-c91b-4b78-aa9e-8a4a72346efb",
  "cause": "{\"errorType\":\"FileDoesNotExistException\",\"errorMessage\":\"Could not find path raw/config.json\",\"trace\":[\"FileDoesNotExistException: Could not find path raw/config.json\",\"    at constructor.extractError (/var/task/index.js:125:6861)\",\"    at constructor.callListeners (/var/task/index.js:261:31814)\",\"    at constructor.emit (/var/task/index.js:261:31524)\",\"    at constructor.emitEvent (/var/task/index.js:314:556302)\",\"    at constructor.e (/var/task/index.js:314:551841)\",\"    at r.runTo (/var/task/index.js:314:558144)\",\"    at /var/task/index.js:314:558350\",\"    at constructor.<anonymous> (/var/task/index.js:314:552111)\",\"    at constructor.<anonymous> (/var/task/index.js:314:556358)\",\"    at constructor.callListeners (/var/task/index.js:261:31920)\"]}",
  "error": "FileDoesNotExistException"
})