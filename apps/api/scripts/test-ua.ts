//@ts-nocheck

async function main() {
  const crypto = require('crypto');

  function createHash(data, len) {
    return crypto
      .createHash('shake256', { outputLength: len })
      .update(data)
      .digest('hex');
  }

  console.log(createHash('foo', 2));
  // 1af9
  console.log(createHash('foo', 32));
  // 1af97f7818a28edf}
}
main();
