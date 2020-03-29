import { ChildProcess, spawn, SpawnOptions } from 'child_process';

export async function run(command: string, args: string[], options?: Partial<SpawnOptions>): Promise<void> {
  const childProcess = spawn(command, args, {
    stdio: [process.stdin, process.stdout, process.stderr],
    ...options,
  });
  return onExit(childProcess);
}

function onExit(childProcess: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    childProcess.once('exit', (code: number, signal: string) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`Exit with error code: ${code}`));
      }
    });
    childProcess.once('error', (err: Error) => {
      reject(err);
    });
  });
}
