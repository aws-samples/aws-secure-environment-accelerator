export interface StackOutput {
  accountKey: string;
  outputKey?: string;
  outputValue?: string;
  outputDescription?: string;
  outputExportName?: string;
}

export interface FindStackOutputFilter {
  accountKey?: string;
  outputKey?: string;
}

export interface FindStackJsonOutputFilter extends FindStackOutputFilter {
  outputType?: string;
}

export class StackOutputs extends Array<StackOutput> {
  constructor(outputs: StackOutput[]) {
    super();
    // See https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, StackOutputs.prototype);
    // Add all accounts to this class
    this.push(...outputs);
  }

  findStackOutputs(filter: FindStackOutputFilter): StackOutput[] {
    return this.filter(output => {
      if (filter.accountKey && output.accountKey !== filter.accountKey) {
        return false;
      }
      if (filter.outputKey && output.outputKey !== filter.outputKey) {
        return false;
      }
      return true;
    });
  }

  // tslint:disable-next-line: no-any
  findStackJsonOutputs(filter: FindStackJsonOutputFilter): any[] {
    return this.findStackJsonOutputs(filter)
      .map(output => {
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
}

/**
 * @deprecated
 */
export function getStackOutput(outputs: StackOutput[], accountKey: string, outputKey: string): string {
  const output = outputs.find(o => o.outputKey === outputKey && o.accountKey === accountKey);
  if (!output) {
    throw new Error(`Cannot find output with key "${outputKey}" in account with key "${accountKey}"`);
  }
  return output.outputValue!;
}

export interface StackJsonOutputFilter {
  accountKey?: string;
  outputType?: string;
}

/**
 * @deprecated
 */
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
