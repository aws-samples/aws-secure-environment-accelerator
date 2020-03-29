export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export function packageManagerExecutor(packageManager: PackageManager): string {
  if (packageManager === 'npm') {
    return 'npx';
  } else if (packageManager == 'pnpm') {
    return 'pnpx';
  } else if (packageManager == 'yarn') {
    return 'ynpx';
  }
  throw new Error(`Unknown executor for package manager ${packageManager}`);
}
