import * as fs from 'fs';
import * as path from 'path';
import * as tempy from 'tempy';
import * as cdk from '@aws-cdk/core';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import { PackageManager, packageManagerExecutor } from './package-manager';
import { run } from './process';

export declare namespace CdkTemplateBuild {
  export interface Config {
    workingDir: string;
    packageManager?: PackageManager;
    outputPath?: string;
    context?: { [key: string]: string };
  }
}

export class CdkTemplateBuild {
  private readonly outputPath: string;

  constructor(outputPath: string) {
    this.outputPath = outputPath;
  }

  templateByName(scope: cdk.Construct, stackName: string): s3assets.Asset {
    const stackTemplateFile = `${stackName}.template.json`;
    const stackTemplatePath = path.join(this.outputPath, stackTemplateFile);
    if (!fs.existsSync(stackTemplatePath)) {
      throw new Error(`The stack "${stackName}" does not exist`);
    }
    return new s3assets.Asset(scope, `${stackName}-template`, {
      path: stackTemplatePath,
    });
  }

  static async build(config: CdkTemplateBuild.Config): Promise<CdkTemplateBuild> {
    const {
      packageManager = 'pnpm',
      workingDir,
      context = {},
      outputPath = tempy.directory(),
    } = config;
    console.log(`Building CDK S3 asset in "${workingDir}" to "${outputPath}"`);

    const parameters = [
      'cdk',
      'synth',
      '--output', outputPath,
    ];
    for (const key of Object.getOwnPropertyNames(context)) {
      const value = context[key];
      parameters.push('-c', `${key}=${value}`);
    }

    const executor = packageManagerExecutor(packageManager);
    await run(executor, parameters, {
      cwd: workingDir,
    });
    return new CdkTemplateBuild(outputPath);
  }
}
