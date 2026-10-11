import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Build once; serving a first visit must not add compression work to the small server.
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (/\.(js|css|svg|html|json)$/.test(entry.name)) {
      const source = await readFile(path);
      if (source.length < 1024) continue;
      const compressed = gzipSync(source, { level: 9 });
      if (compressed.length < source.length) await writeFile(`${path}.gz`, compressed);
    }
  }
}
await compress(fileURLToPath(new URL('../dist/', import.meta.url)));
