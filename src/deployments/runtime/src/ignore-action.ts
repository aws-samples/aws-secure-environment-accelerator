// tslint:disable-next-line: no-any
export const handler = async (input: any): Promise<void> => {
  console.log('Ignoring Action input ....');
  console.log(JSON.stringify(input, null, 2));
};
