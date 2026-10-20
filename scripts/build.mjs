// Build: ES module do widget, ES module do handler de servidor e declarações de tipo.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'dist/fox-report.mjs',
  external: ['html-to-image'],
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'warning',
  banner: { js: '/*! @foxtag/fox-report - MIT. Partes adaptadas do bugframe (MIT, vmatheus3). Ver THIRD_PARTY_NOTICES.md */' },
});

await build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'dist/server.mjs',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'warning',
  banner: { js: '/*! @foxtag/fox-report/server - MIT. Partes adaptadas do bugframe (MIT, vmatheus3). Ver THIRD_PARTY_NOTICES.md */' },
});

execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
