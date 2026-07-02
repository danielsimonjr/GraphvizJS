import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Build the renderer (dist/) and Electron entry points (dist-electron/) before
 * the e2e suite runs, so Playwright launches the real, current app. Set
 * GVJS_E2E_SKIP_BUILD=1 to reuse an existing build during local iteration.
 */
export default function globalSetup(): void {
  if (process.env.GVJS_E2E_SKIP_BUILD === '1') {
    const built = existsSync(path.join(projectRoot, 'dist-electron', 'main.js'));
    if (built) return;
  }
  execSync('pnpm build', { cwd: projectRoot, stdio: 'inherit' });
}
