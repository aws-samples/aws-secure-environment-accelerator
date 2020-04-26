import * as fs from 'fs';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { PackageManager, packageManagerExecutor } from './package-manager';
import { run } from './process';
import { TempDirectoryCache } from './temp-directory-cache';

export declare namespace WebpackBuild {
  export interface Config {
    workingDir: string;
    webpackConfigFile?: string;
    webpackConfigPath?: string;
    packageManager?: PackageManager;
    outputPath?: string;
    mode?: 'production' | 'development';
  }
}

export class WebpackBuild {
  private static tempDirectoryCache = new TempDirectoryCache(path.join(__dirname, 'webpack-build-cache.json'));

  private readonly outputPath: string;
  private readonly codeByEntryMap: { [entryName: string]: lambda.Code } = {};

  constructor(outputPath: string) {
    this.outputPath = outputPath;
  }

  codeForEntry(entryName?: string): lambda.Code {
    const mapIndex = entryName || '__UNDEFINED__';
    if (this.codeByEntryMap[mapIndex]) {
      return this.codeByEntryMap[mapIndex];
    }
    let entryPath;
    if (entryName) {
      entryPath = path.join(this.outputPath, entryName);
    } else {
      entryPath = this.outputPath;
    }
    if (!fs.existsSync(entryPath)) {
      throw new Error(`The entry "${entryName}" does not exist`);
    }
    const code = lambda.Code.fromAsset(entryPath);
    this.codeByEntryMap[mapIndex] = code;
    return code;
  }

  static async build(config: WebpackBuild.Config): Promise<WebpackBuild> {
    const {
      packageManager = 'pnpm',
      workingDir,
      webpackConfigFile = 'webpack.config.js',
      webpackConfigPath = `${path.join(workingDir, webpackConfigFile)}`,
      outputPath = WebpackBuild.tempDirectoryCache.createTempDirectory(webpackConfigPath),
      mode = 'production',
    } = config;
    console.log(`Building Webpack code in "${workingDir}" to "${outputPath}"`);

    const executor = packageManagerExecutor(packageManager);
    await run(
      executor,
      [
        'webpack-cli',
        '--config',
        webpackConfigPath,
        '--mode',
        mode,
        '--output-library-target',
        'commonjs',
        '--output-path',
        outputPath,
      ],
      {
        cwd: workingDir,
      },
    );
    return new WebpackBuild(outputPath);
  }
}
