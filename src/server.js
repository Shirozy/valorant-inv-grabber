const http = require('http');
const path = require('path');

const { PORT, PUBLIC_DIR } = require('./config/constants');
const { buildSkinWorkbook } = require('./services/exportService');
const { buildSkinResponse } = require('./services/skinService');
const { sendFile, sendJson, sendText } = require('./utils/http');

const STATIC_FILES = new Map([
  [
    '/',
    {
      contentType: 'text/html; charset=utf-8',
      filePath: path.join(PUBLIC_DIR, 'index.html'),
    },
  ],
  [
    '/app.js',
    {
      contentType: 'application/javascript; charset=utf-8',
      filePath: path.join(PUBLIC_DIR, 'app.js'),
    },
  ],
  [
    '/styles.css',
    {
      contentType: 'text/css; charset=utf-8',
      filePath: path.join(PUBLIC_DIR, 'styles.css'),
    },
  ],
]);

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/skins') {
    const payload = await buildSkinResponse();
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === '/api/skins/export.xlsx') {
    const payload = await buildSkinResponse();
    const { buffer, contentDisposition } = buildSkinWorkbook(payload);

    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
    return;
  }

  const staticFile = STATIC_FILES.get(pathname);
  if (staticFile) {
    await sendFile(res, staticFile.filePath, staticFile.contentType);
    return;
  }

  sendText(res, 404, 'Not found');
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  });
}

function startServer(port = PORT) {
  const server = createServer();

  server.listen(port, () => {
    console.log(`VALORANT skin site running at http://localhost:${port}`);
  });

  return server;
}

module.exports = {
  createServer,
  startServer,
};
