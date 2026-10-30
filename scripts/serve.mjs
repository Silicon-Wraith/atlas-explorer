import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createStaticHandler } from './static-handler.mjs';
const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const portIndex = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portIndex >= 0 ? process.argv[portIndex + 1] : 5173));
const server = createServer(createStaticHandler({ root }));
server.on('error', error => {
  console.error(`Could not start ATLAS: ${error.code}. Check that port ${port} is available and local sockets are allowed.`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`ATLAS is ready at http://localhost:${port}`));
