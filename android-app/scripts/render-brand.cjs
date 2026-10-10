// Deterministic raster exports from the shared web/vector icon.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname, '../..');
const svg = fs.readFileSync(path.join(root, 'frontend/public/brand/roxstock-icon.svg'));
(async () => {
  for (const size of [16, 32, 48, 192, 512]) {
    await sharp(svg).resize(size, size).png().toFile(path.join(root, `frontend/public/brand/favicon-${size}.png`));
  }
  await sharp(svg).resize(180,180).png().toFile(path.join(root, 'frontend/public/brand/apple-touch-icon.png'));
  for (const [density, size] of Object.entries({mdpi:48, hdpi:72, xhdpi:96, xxhdpi:144, xxxhdpi:192})) {
    const dir = path.join(root, `android-app/app/src/main/res/mipmap-${density}`);
    fs.mkdirSync(dir, {recursive:true});
    await sharp(svg).resize(size,size).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(Buffer.from(svg.toString().replace('rx="88"','rx="256"'))).resize(size,size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  }
})();
