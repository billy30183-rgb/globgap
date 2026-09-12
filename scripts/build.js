import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = resolve('dist');
if (outputDir !== resolve(projectRoot, 'dist')) throw new Error('Run build from the GlobGap project root.');
// Only this project's generated dist directory is replaced.
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const config = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' };
const worker = await build({ ...config, entryPoints: ['src/worker.js'], write: false });
// Bundle the exact Worker source as data: restarting a cancelled Worker makes
// no resource request, even offline. No eval or Function constructor is used.
await build({ ...config, entryPoints: ['src/app.js'], outdir: 'dist', plugins: [{
  name: 'worker-source', setup(builder) {
    builder.onResolve({ filter: /^globgap:worker-source$/ }, () => ({ path: 'worker-source', namespace: 'globgap' }));
    builder.onLoad({ filter: /.*/, namespace: 'globgap' }, () => ({ contents: `export default ${JSON.stringify(worker.outputFiles[0].text)};`, loader: 'js' }));
  }
}] });
for (const name of ['index.html', 'style.css']) await copyFile('public/' + name, 'dist/' + name);
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.txt');
await copyFile('LICENSE', 'dist/LICENSE.txt');
console.log('Built static site in dist/.');
