import fs from 'node:fs';
import https from 'node:https';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import zlib from 'node:zlib';
import * as tar from 'tar';

// GeoLite2-City → geo lookups; GeoLite2-ASN → datacenter/hosting detection.
const dbs = ['GeoLite2-City', 'GeoLite2-ASN'];

const editionUrl = (db: string): string => {
  if (process.env.MAXMIND_LICENSE_KEY) {
    return [
      'https://download.maxmind.com/app/geoip_download',
      `?edition_id=${db}&license_key=${process.env.MAXMIND_LICENSE_KEY}&suffix=tar.gz`,
    ].join('');
  }
  return `https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/${db}.tar.gz`;
};

async function downloadDb(db: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = https.get(editionUrl(db), (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed for ${db}: HTTP ${res.statusCode}`));
        return;
      }

      const gunzip = zlib.createGunzip();
      const parser = tar.t();
      // Each extracted .mmdb write must flush before we report success, or an
      // early exit can leave a truncated database on disk.
      const writes: Promise<void>[] = [];

      parser.on('entry', (entry) => {
        if (entry.path.endsWith('.mmdb')) {
          const filename = path.join(dest, path.basename(entry.path));
          const file = fs.createWriteStream(filename);
          writes.push(
            new Promise<void>((writeDone, writeFailed) => {
              file.on('finish', writeDone);
              file.on('error', writeFailed);
            })
          );
          entry.pipe(file);

          console.log('Saved geo database:', filename);
        } else {
          entry.resume();
        }
      });

      // pipe() does not forward errors, so each stage needs its own handler.
      gunzip.on('error', reject);
      parser.on('error', reject);
      parser.on('finish', () => {
        Promise.all(writes).then(() => resolve(), reject);
      });

      res.pipe(gunzip).pipe(parser as any);
    });

    request.on('error', reject);
  });
}

async function main(): Promise<void> {
  const dest = path.resolve(__dirname, '../');

  if (!fs.existsSync(dest)) {
    console.log('Geo database not found');
    process.exit(1);
  }

  try {
    // The two databases are independent; download them in parallel.
    await Promise.all(dbs.map((db) => downloadDb(db, dest)));
  } catch (error) {
    console.error('Error downloading geo database:', error);
    process.exit(1);
  }
}

main();
