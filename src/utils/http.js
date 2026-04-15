const fs = require('fs/promises');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function sendFile(res, filePath, contentType) {
  const contents = await fs.readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(contents);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

module.exports = {
  sendFile,
  sendJson,
  sendText,
};
