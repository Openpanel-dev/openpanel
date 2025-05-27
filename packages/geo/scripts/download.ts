import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import * as tar from 'tar';
import type { Parser } from 'tar';

const db = 'GeoLite2-City';

const download = async (url: string): Promise<Parser> => {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      const gunzip = zlib.createGunzip();
      const parser = tar.t();

      res.pipe(gunzip).pipe(parser as any);
      resolve(parser);
    });
  });
};

async function main(): Promise<void> {
  let url = `https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/${db}.tar.gz`;

  if (process.env.MAXMIND_LICENSE_KEY) {
    url = [
      'https://download.maxmind.com/app/geoip_download',
      `?edition_id=${db}&license_key=${process.env.MAXMIND_LICENSE_KEY}&suffix=tar.gz`,
    ].join('');
  }

  const dest = path.resolve(__dirname, '../');

  if (!fs.existsSync(dest)) {
    console.log('Geo database not found');
    process.exit(1);
  }

  try {
    const res = await download(url);

    await new Promise<void>((resolve, reject) => {
      res.on('entry', (entry) => {
        if (entry.path.endsWith('.mmdb')) {
          const filename = path.join(dest, path.basename(entry.path));
          entry.pipe(fs.createWriteStream(filename));

          console.log('Saved geo database:', filename);
        }
      });

      res.on('error', (e) => {
        reject(e);
      });

      res.on('finish', () => {
        resolve();
      });
    });
  } catch (error) {
    console.error('Error downloading geo database:', error);
    process.exit(1);
  }
}

main();
