export interface StackOutput {
  accountKey: string;
  outputKey?: string;
  outputValue?: string;
  outputDescription?: string;
  outputExportName?: string;
}

export function getStackOutput(outputs: StackOutput[], accountKey: string, outputKey: string): string | undefined {
  const output = outputs.find(o => o.outputKey === outputKey && o.accountKey === accountKey);
  if (!output) {
    console.warn(`Cannot find output with key "${outputKey}" in account with key "${accountKey}"`);
    return;
  }
  return output.outputValue!;
}

export interface StackJsonOutputFilter {
  accountKey?: string;
  outputType?: string;
}

// tslint:disable-next-line: no-any
export function getStackJsonOutput(outputs: StackOutput[], filter: StackJsonOutputFilter = {}): any[] {
  return outputs
    .map(output => {
      if (filter.accountKey && output.accountKey !== filter.accountKey) {
        return null;
      }
      try {
        if (output.outputValue && output.outputValue.startsWith('{')) {
          const json = JSON.parse(output.outputValue);
          const type = json.type;
          const value = json.value;
          if (!filter.outputType || filter.outputType === type) {
            return value;
          }
        }
      } catch {}
      return null;
    })
    .filter(jsonOutput => !!jsonOutput);
}
