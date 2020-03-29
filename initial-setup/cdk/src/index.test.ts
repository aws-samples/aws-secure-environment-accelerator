import * as tempy from 'tempy';
import { zipFiles } from '@aws-pbmm/common-lambda/lib/util/zip';
import { Archiver } from 'archiver';

(async () => {
  const solutionZipPath = tempy.file({
    extension: 'zip',
  });

  await zipFiles(solutionZipPath, (archive: Archiver) => {
    archive.glob('**/*', {
      cwd: '/data/amazon.com/projects/canada-pbmm-accelerator-repo/accelerator/solution',
      ignore: [
        '**/cdk.out/**',
        '**/node_modules/**',
        '**/pnpm-lock.yaml',
        '**/.prettierrc',
      ],
    });
  });
})();
