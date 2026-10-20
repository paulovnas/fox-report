// API local do exemplo: recebe o relato do widget e encaminha ao Monday.
// O token fica só aqui, nunca no bundle do navegador.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createFoxReportHandler } from '@foxtag/fox-report/server';

for (const file of ['.env.local', '../../.env.local']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const at = line.indexOf('=');
      if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at)] ??= line.slice(at + 1);
    }
  } catch { /* arquivo opcional */ }
}

if (!process.env.MONDAY_API_TOKEN) {
  console.error('Defina MONDAY_API_TOKEN em .env.local antes de iniciar a API.');
  process.exit(1);
}

const handler = createFoxReportHandler({
  token: process.env.MONDAY_API_TOKEN,
  project: process.env.MONDAY_PROJECT ?? 'Portal eNe',
  workspaceId: process.env.MONDAY_WORKSPACE_ID ?? '18101704',
});

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith('/api/fox-report')) {
    res.writeHead(404).end('not found');
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(url, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(8787, () => console.log('API de exemplo em http://localhost:8787/api/fox-report'));
