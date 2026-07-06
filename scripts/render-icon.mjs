// Renders build/icon.svg → build/icon.png (512×512) using the app's own resvg
// renderer. electron-builder auto-detects build/icon.png and generates the
// Windows .ico from it. Run: node scripts/render-icon.mjs (or pnpm build:icon).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf-8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
writeFileSync(join(root, 'build', 'icon.png'), png);
console.log(`wrote build/icon.png (${png.length} bytes)`);
