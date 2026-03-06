import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../../public/public/op1.js');
const dest = join(__dirname, '../public/op1.js');

mkdirSync(join(__dirname, '../public'), { recursive: true });

try {
  copyFileSync(src, dest);
  console.log('✓ Copied op1.js to public/');
} catch (e) {
  console.warn('⚠ Could not copy op1.js:', e.message);
}
