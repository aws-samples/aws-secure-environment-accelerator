// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: any): Promise<void> => {
  console.log('Ignoring Action input ....');
  console.log(JSON.stringify(input, null, 2));
};
