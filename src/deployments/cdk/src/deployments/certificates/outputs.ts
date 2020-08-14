export function createCertificateSecretName(certificateName: string): string {
  return `accelerator/certificates/${certificateName}`;
}
