import * as t from 'io-ts';
import { createCfnStructuredOutput } from '../../../common/structured-output';
import { LogDestinationOutput } from '@aws-accelerator/common-outputs/src/log-destination';

export const CfnLogDestinationOutput = createCfnStructuredOutput(LogDestinationOutput);
