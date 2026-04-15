const { app, BrowserWindow, dialog, shell } = require('electron');

const { startServer } = require('../src/server');

let mainWindow = null;
let server = null;

function waitForListening(httpServer) {
  return new Promise((resolve, reject) => {
    if (httpServer.listening) {
      resolve(httpServer.address());
      return;
    }

    const handleListening = () => {
      httpServer.off('error', handleError);
      resolve(httpServer.address());
    };

    const handleError = (error) => {
      httpServer.off('listening', handleListening);
      reject(error);
    };

    httpServer.once('listening', handleListening);
    httpServer.once('error', handleError);
  });
}

function closeServer() {
  if (!server) {
    return;
  }

  server.close();
  server = null;
}

async function createMainWindow() {
  server = startServer(0);
  const address = await waitForListening(server);
  const port = typeof address === 'object' && address ? address.port : 3010;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    title: 'VALORANT Inventory Grabber',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(async () => {
  try {
    app.setAppUserModelId('com.codex.valorantinvgrabber');
    await createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow().catch((error) => {
          dialog.showErrorBox(
            'Unable to start VALORANT Inventory Grabber',
            error instanceof Error ? error.message : String(error)
          );
        });
      }
    });
  } catch (error) {
    dialog.showErrorBox(
      'Unable to start VALORANT Inventory Grabber',
      error instanceof Error ? error.message : String(error)
    );
    closeServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  closeServer();
});

app.on('window-all-closed', () => {
  closeServer();
  app.quit();
});
