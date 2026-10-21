// Bundle do widget para a página de demonstração offline (examples/demo): IIFE com html-to-image embutido.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'FoxReportSDK',
  target: 'es2020',
  outfile: 'examples/demo/fox-report.demo.js',
  logLevel: 'warning',
});
