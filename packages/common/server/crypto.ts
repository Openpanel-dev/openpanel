import {
  createHash as cryptoCreateHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

export function generateSalt() {
  return randomBytes(16).toString('hex');
}

/**
 * Has a password or a secret with a password hashing algorithm (scrypt)
 * @param {string} password
 * @returns {string} The salt+hash
 */
export async function hashPassword(
  password: string,
  keyLength = 32,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // generate random 16 bytes long salt - recommended by NodeJS Docs
    const salt = generateSalt();
    scrypt(password, salt, keyLength, (err, derivedKey) => {
      if (err) reject(err);
      // derivedKey is of type Buffer
      resolve(`${salt}.${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Compare a plain text password with a salt+hash password
 * @param {string} password The plain text password
 * @param {string} hash The hash+salt to check against
 * @returns {boolean}
 */
export async function verifyPassword(
  password: string,
  hash: string,
  keyLength = 32,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hashKey] = hash.split('.');
    // we need to pass buffer values to timingSafeEqual
    const hashKeyBuff = Buffer.from(hashKey!, 'hex');
    scrypt(password, salt!, keyLength, (err, derivedKey) => {
      if (err) {
        reject(err);
      }
      // compare the new supplied password with the hashed password using timeSafeEqual
      resolve(
        timingSafeEqual(
          new Uint8Array(hashKeyBuff),
          new Uint8Array(derivedKey),
        ),
      );
    });
  });
}

export function createHash(data: string, len: number) {
  return cryptoCreateHash('shake256', { outputLength: len })
    .update(data)
    .digest('hex');
}
