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

import * as AWS from 'aws-sdk';
import { ScheduledEvent } from 'aws-lambda';

import { S3 } from 'siem-common';
import https from 'https';
import querystring from 'querystring';
import fs from 'fs';
import zlib from 'zlib';

const tar = require('tar-stream');

const url: string = 'https://download.maxmind.com/app/geoip_download?';
const downloadFiles: string[] = ['GeoLite2-City', 'GeoLite2-ASN', 'GeoLite2-Country'];

const s3 = new S3();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (input: ScheduledEvent) => {
  console.log(`GeoIpDownloader begin`);
  console.log(JSON.stringify(input, null, 2));

  const configBucket: string = process.env.CONFIG_BUCKET || '';
  const licenseFile: string = process.env.LICENSE || 'siem/license.txt';
  const uploadBucket: string = process.env.UPLOAD_BUCKET || '';
  const s3Prefix: string = process.env.S3KEY_PREFIX || 'GeoLite2/';

  const licenseKey = (
    await s3.getObjectBodyAsString({
      Bucket: configBucket,
      Key: licenseFile,
    })
  ).trim();

  for (const file of downloadFiles) {
    await download(file, licenseKey, uploadBucket, s3Prefix);
  }
};

const download = async (fileName: string, licenseKey: string, uploadBucket: string, s3Prefix: string) => {
  console.log(`Downloading file ${fileName}...`);

  for (const suffix of ['tar.gz', 'tar.gz.sha256']) {
    const values = {
      edition_id: fileName,
      license_key: licenseKey,
      suffix,
    };
    const data = querystring.encode(values);
    console.log(data);
    try {
      console.log(url + data);

      const downloadData = async (dest: string) => {
        const file = fs.createWriteStream(dest);
        return new Promise<void>((resolve, reject) => {
          https
            .get(url + data, resp => {
              resp.pipe(file);
              file.on('finish', function () {
                file.close();
                resolve();
              });
            })
            .on('error', err => {
              fs.unlink(dest, fsErr => {
                if (fsErr) {
                  console.log(fsErr);
                } else {
                  console.log('Deleted Symbolic Link: symlinkToFile');
                }
              });
              reject(err);
            });
        });
      };

      const uploadToS3 = async (src: string, bucket: string, key: string) => {
        return new Promise<AWS.S3.PutObjectOutput>((resolve, reject) => {
          fs.readFile(src, (err: any, data: any) => {
            if (err) {
              console.log(err);
              reject(err);
            }
            const buffer = Buffer.from(data);
            console.log(`Uploading ${src} to S3...`);
            s3.putObject({
              Bucket: bucket,
              Key: key,
              Body: buffer,
            })
              .then((s3Resp: any) => {
                console.log('upload done');
                resolve(s3Resp);
              })
              .catch((s3Err: any) => {
                console.log('error');
                reject(s3Err);
              });
          });
        });
      };

      const tmpFile: string = `/tmp/${fileName}.${suffix}`;
      await downloadData(tmpFile);

      if (suffix === 'tar.gz') {
        console.log(`Extracting tar file '${tmpFile}''...`);

        const extractedFileName = `/tmp/${fileName}.mmdb`;

        const extractFile = async (src: string) => {
          return new Promise((resolve, reject) => {
            const extract = tar.extract();

            const chunks: any = [];

            extract.on('entry', (header: any, stream: fs.ReadStream, next: any) => {
              console.log(header.name);
              if (/.mmdb$/.test(header.name)) {
                stream.on('data', chunk => {
                  chunks.push(chunk);
                });
              }

              stream.on('end', () => {
                next();
              });

              stream.resume();
            });

            extract.on('finish', () => {
              if (chunks.length) {
                const data = Buffer.concat(chunks);
                fs.writeFileSync(extractedFileName, data);
              }

              resolve(chunks.length);
            });

            extract.on('error', (err: any) => {
              reject(err);
            });

            fs.createReadStream(src).pipe(zlib.createGunzip()).pipe(extract);
          });
        };

        await extractFile(tmpFile);

        if (fs.existsSync(extractedFileName)) {
          await uploadToS3(extractedFileName, uploadBucket, `${s3Prefix}${fileName}.mmdb`);
        } else {
          console.log(`${extractedFileName} does not exist.`);
        }
      }
      console.log(`Downloaded file to ${tmpFile}`);
    } catch (err) {
      console.error(err);
    }
  }

  console.log(`Data ${fileName} downloaded`);
};
