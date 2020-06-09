import * as t from 'io-ts';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { StructuredOutput } from '../../common/structured-output';

export const InstanceTimeOutputType = t.interface(
  {
    instanceId: t.string,
    time: t.string,
  },
  'InstanceTime',
);

export type InstanceStatusOutput = t.TypeOf<typeof InstanceTimeOutputType>;

export function getTimeDiffInMinutes(instanceLaunchTime: string): number {
  // converting instance launch time into milliseconds
  const instanceLaunchTimeInMill = Date.parse(instanceLaunchTime);

  // getting the UTC date from current time
  const utcDateInString = new Date().toISOString();

  // converting current UTC date into milliseconds
  const utcCurrentTimeInMill = Date.parse(utcDateInString);

  // calculating the time in minutes
  const minutes = Math.floor((utcCurrentTimeInMill - instanceLaunchTimeInMill) / (1000 * 60));
  return minutes;
}

export function checkAccountWarming(accountKey: string, outputs: StackOutput[]): boolean {
  const instanceTimeOutputs = StructuredOutput.fromOutputs(outputs, {
    type: InstanceTimeOutputType,
    accountKey,
  });
  if (!instanceTimeOutputs || instanceTimeOutputs.length === 0) {
    console.warn(`Cannot find InstanceOutput for account ${accountKey}`);
    return false;
  } else {
    if (getTimeDiffInMinutes(instanceTimeOutputs[0].time) < 15) {
      console.warn(`Minimum 15 minutes of account warming required for account ${accountKey}`);
      return false;
    }
  }
  return true;
}
