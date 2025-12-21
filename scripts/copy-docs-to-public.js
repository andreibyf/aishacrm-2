// Copies PDF documentation from ./docs to ./public/guides so the frontend can serve them
// Works for both dev (vite serves public/) and production builds (dist includes public/)
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const srcDir = path.resolve(cwd, 'docs');
const destDir = path.resolve(cwd, 'public', 'guides');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.promises.copyFile(src, dest);
}

async function run() {
  try {
    const exists = fs.existsSync(srcDir);
    if (!exists) {
      console.log(`[copy-docs-to-public] Skipping: source dir not found: ${srcDir}`);
      return;
    }
    const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
    const pdfs = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
      .map((e) => e.name);

    if (pdfs.length === 0) {
      console.log('[copy-docs-to-public] No PDF files found in ./docs');
      return;
    }

    await ensureDir(destDir);
    for (const name of pdfs) {
      const src = path.join(srcDir, name);
      const dest = path.join(destDir, name);
      await copyFile(src, dest);
      console.log(`[copy-docs-to-public] Copied: ${src} -> ${dest}`);
    }

    console.log(`[copy-docs-to-public] Done. ${pdfs.length} file(s) available under /guides/*`);
  } catch (err) {
    console.error('[copy-docs-to-public] Error:', err?.message || err);
    process.exitCode = 1;
  }
}

run();
