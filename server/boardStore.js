import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARDS_DIR = path.join(__dirname, 'boards');

async function ensureDir() {
  await fs.mkdir(BOARDS_DIR, { recursive: true });
}

function safeId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Invalid board id');
  }
  return id;
}

export async function listBoards() {
  await ensureDir();
  const files = await fs.readdir(BOARDS_DIR);
  const boards = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const id = file.replace(/\.json$/, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    const raw = await fs.readFile(path.join(BOARDS_DIR, file), 'utf-8');
    const board = JSON.parse(raw);
    boards.push({ id, title: board.title || 'Untitled Board' });
  }
  return boards;
}

export async function getBoard(id) {
  await ensureDir();
  const raw = await fs.readFile(path.join(BOARDS_DIR, `${safeId(id)}.json`), 'utf-8');
  return JSON.parse(raw);
}

export async function saveBoard(id, board) {
  await ensureDir();
  const boardId = id ? safeId(id) : nanoid(10);
  await fs.writeFile(
    path.join(BOARDS_DIR, `${boardId}.json`),
    JSON.stringify(board, null, 2),
    'utf-8'
  );
  return boardId;
}

export async function deleteBoard(id) {
  await ensureDir();
  await fs.unlink(path.join(BOARDS_DIR, `${safeId(id)}.json`));
}
