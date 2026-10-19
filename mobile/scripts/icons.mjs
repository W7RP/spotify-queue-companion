import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The master is the approved mascot artwork. All exports are reproducible from it.
const artwork = await readFile(new URL('../public/queue-companion-artwork.png', import.meta.url));
const output = name => fileURLToPath(new URL('../public/' + name, import.meta.url));
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png'], [64, 'favicon.png']]) {
  await sharp(artwork).resize(size, size, { fit: 'contain', background: '#222222' }).flatten({ background: '#222222' }).png().toFile(output(name));
}
// A separate export keeps the complete character inside Android's circular safe area.
await sharp(artwork).resize(384, 384, { fit: 'contain', background: '#222222' }).extend({ top: 64, bottom: 64, left: 64, right: 64, background: '#222222' }).flatten({ background: '#222222' }).png().toFile(output('icon-maskable-512.png'));
const favicon = await readFile(output('favicon.png'));
await writeFile(output('favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${favicon.toString('base64')}"/></svg>\n`);
// One PNG-compressed 64px ICO image, also serving browsers that request /favicon.ico.
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 64; ico[7] = 64; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(favicon.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(output('favicon.ico'), Buffer.concat([ico, favicon]));
