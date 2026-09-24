import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

import boardsRouter from './routes/boards.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { preloadJeopardyDataset } from './jeopardyDataset.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/boards', boardsRouter);

if (isProd) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: isProd ? undefined : { origin: '*' },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Jeopardy server listening on http://localhost:${PORT}`);
});

preloadJeopardyDataset().catch((err) => {
  console.error('Jeopardy clue dataset preload failed (will retry on next request):', err.message);
});
