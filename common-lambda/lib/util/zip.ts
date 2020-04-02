import * as fs from 'fs';
import archiver from 'archiver';

export function zipFiles(out: string, fn: (archive: archiver.Archiver) => void) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    fn(archive);

    archive.on('error', (err) => reject(err)).pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}
