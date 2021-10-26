import { createCfnStructuredOutput } from '../../common/structured-output';
import { AcmOutput } from '@aws-accelerator/common-outputs/src/certificates';

export function createCertificateSecretName(certificateName: string): string {
  return `accelerator/certificates/${certificateName}`;
}

export const CfnAcmOutput = createCfnStructuredOutput(AcmOutput);
