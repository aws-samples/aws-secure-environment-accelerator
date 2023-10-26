/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as glob from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import * as tempy from 'tempy';
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

export type PackageManager = 'pnpm';

export interface CdkDeployProjectProps {
  projectName: string;
  role: iam.Role;
  packageManager: PackageManager;
  projectRoot: string;
  commands: string[];
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  computeType?: any;
  timeout?: cdk.Duration;
  environment?: { [key: string]: string };
}

export class CdkDeployProjectBase extends Construct {
  readonly projectName: string;
  readonly projectTmpDir = tempy.directory();
  readonly environmentVariables: { [key: string]: codebuild.BuildEnvironmentVariable };

  constructor(scope: Construct, id: string, props: CdkDeployProjectProps) {
    super(scope, id);

    const { projectName, environment } = props;

    this.projectName = projectName;

    // Prepare environment variables in CodeBuild format
    this.environmentVariables = {};
    for (const [name, value] of Object.entries(environment || {})) {
      this.environmentVariables[name] = {
        type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        value,
      };
    }

    // Copy project files to a temporary directory
    const projectFiles = glob.sync('**/*', {
      cwd: props.projectRoot,
      nodir: true,
      ignore: ['**/cdk.out/**', '**/cdk.json', '**/node_modules/**', '**/.prettierrc'],
    });
    for (const projectFile of projectFiles) {
      const source = path.join(props.projectRoot, projectFile);
      const destination = path.join(this.projectTmpDir, projectFile);

      // Create the directory in the temp folder
      const destinationDir = path.dirname(destination);
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, {
          recursive: true,
        });
      }

      // And copy over the file
      fs.copyFileSync(source, destination);
    }
  }
}

export class CdkDeployProject extends CdkDeployProjectBase {
  public readonly resource: codebuild.PipelineProject;

  constructor(scope: Construct, id: string, props: CdkDeployProjectProps) {
    super(scope, id, props);

    const { role, projectName, commands, computeType, timeout } = props;

    // Upload the templates ZIP as an asset to S3
    const projectAsset = new s3assets.Asset(this, 'Asset', {
      path: this.projectTmpDir,
    });

    // Define a build specification to build the initial setup templates
    this.resource = new codebuild.Project(this, 'Resource', {
      projectName,
      role,
      timeout,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 18,
            },
            commands: installPackageManagerCommands(props.packageManager),
          },
          build: {
            commands: [...installDependenciesCommands(props.packageManager), ...commands],
          },
        },
      }),
      source: codebuild.Source.s3({
        bucket: projectAsset.bucket,
        path: projectAsset.s3ObjectKey,
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: computeType ?? codebuild.ComputeType.LARGE,
        environmentVariables: this.environmentVariables,
      },
    });
  }
}

/**
 * Represents a project that contains a the given project with its dependencies preinstalled. When running this
 * project, the dependencies will not have to be installed anymore.
 */
export class PrebuiltCdkDeployProject extends CdkDeployProjectBase {
  public readonly resource: codebuild.PipelineProject;

  constructor(scope: Construct, id: string, props: CdkDeployProjectProps) {
    super(scope, id, props);

    const { role, projectName, commands, computeType, timeout } = props;

    // Create docker-entrypoint.sh
    const entrypointFileName = 'docker-entrypoint.sh';
    fs.writeFileSync(path.join(this.projectTmpDir, entrypointFileName), commands.join('\n'));

    // Create Dockerfile
    const appDir = '/app';
    fs.writeFileSync(
      path.join(this.projectTmpDir, 'Dockerfile'),
      [
        'FROM public.ecr.aws/bitnami/node:18',
        // Install the package manager
        ...installPackageManagerCommands(props.packageManager).map(cmd => `RUN ${cmd}`),
        `WORKDIR ${appDir}`,
        // Copy over the project root to the /app directory
        `ADD . ${appDir}/`,
        // Install the dependencies
        ...installDependenciesCommands(props.packageManager).map(cmd => `RUN ${cmd}`),
      ].join('\n'),
    );

    const buildImage = codebuild.LinuxBuildImage.fromAsset(scope, 'SolutionImage', {
      directory: this.projectTmpDir,
    });

    // Define a build specification to build the initial setup templates
    this.resource = new codebuild.Project(this, 'Resource', {
      projectName,
      role,
      timeout,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [`cd ${appDir}`, `sh ${entrypointFileName}`],
          },
          post_build: {
            commands: [
              'buildComplete=`cat /tmp/buildStatus.txt`',
              'if [ $buildComplete = "complete" ]; then echo "Build Finished"; else echo "Build did not finish. please review logs for errors!" && exit 1; fi',
            ],
          },
        },
      }),
      environment: {
        buildImage,
        computeType: computeType ?? codebuild.ComputeType.MEDIUM,
        environmentVariables: this.environmentVariables,
      },
    });
  }
}

/**
 * Returns commands to install the package manager on the machine.
 */
function installPackageManagerCommands(packageManager: PackageManager) {
  if (packageManager === 'pnpm') {
    return ['npm install --global pnpm@8.9.0'];
  }
  throw new Error(`Unsupported package manager ${packageManager}`);
}

/**
 * Returns commands to install the project dependencies.
 */
function installDependenciesCommands(packageManager: PackageManager) {
  if (packageManager === 'pnpm') {
    return ['pnpm install --frozen-lockfile', 'pnpm recursive run build'];
  }
  throw new Error(`Unsupported package manager ${packageManager}`);
}
