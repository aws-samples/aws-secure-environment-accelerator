interface VerifyDeleteVPCInput {
  /**
   * Multi dimensional Array since we get one Array from each output
   */
  errors: string[][];
}

interface VerifyDeleteVPCOutput{
  status: string;
  /**
   * Single Dimensional Array constructed for readablity from Multi Dimensional
   */
  errors: string[];
}

export const handler = async (input: VerifyDeleteVPCInput): Promise<VerifyDeleteVPCOutput> => {
  console.log(`Verifying Delete VPC Output...`);
  console.log(JSON.stringify(input, null, 2));
  const { errors } = input;
  const finalErros: string[] = [];
  for (const accountErrors of errors) {
    finalErros.push(...accountErrors);
  }
  let status = 'SUCCESS';
  if (finalErros.length > 0) {
    status = 'FAILED';
  }
  console.log(status, finalErros);
  return {
    status,
    errors: finalErros,
  }
}