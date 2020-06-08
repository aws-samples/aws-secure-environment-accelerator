import * as t from 'io-ts';

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
