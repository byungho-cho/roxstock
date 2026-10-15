const fs = require('node:fs');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

async function main() {
  const [archive, passwordFile, output] = process.argv.slice(2);
  if (!archive || !passwordFile || !output) throw Error('Usage: node decrypt-backup.cjs ARCHIVE PASSWORD_FILE OUTPUT.sql.gz');
  if (fs.existsSync(output) || fs.existsSync(output + '.partial')) throw Error('Output already exists');
  const size = fs.statSync(archive).size;
  if (size < 52) throw Error('Invalid archive');
  const fd = fs.openSync(archive, 'r');
  const header = Buffer.alloc(36), tag = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, 36, 0);
    fs.readSync(fd, tag, 0, 16, size - 16);
  } finally { fs.closeSync(fd); }
  if (header.subarray(0, 8).toString() !== 'ROXDB003') throw Error('Invalid archive header');
  const password = fs.readFileSync(passwordFile, 'utf8').trim();
  const key = crypto.scryptSync(password, header.subarray(8, 24), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(24, 36));
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(archive, { start: 36, end: size - 17 }), decipher,
      fs.createWriteStream(output + '.partial', { flags: 'wx', mode: 0o600 }));
    fs.renameSync(output + '.partial', output);
  } catch (error) {
    fs.rmSync(output + '.partial', { force: true });
    throw error;
  }
  console.log('Authenticated decryption completed. Keep the output outside Git.');
}
main().catch(() => { console.error('Decryption failed: check arguments, password and archive integrity.'); process.exitCode = 1; });
