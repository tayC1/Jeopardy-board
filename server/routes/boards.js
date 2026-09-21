import { Router } from 'express';
import { listBoards, getBoard, saveBoard, deleteBoard } from '../boardStore.js';
import { csvToBoard } from '../csvImport.js';
import { generateRandomBoard } from '../triviaApi.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    res.json(await listBoards());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    res.json(await getBoard(req.params.id));
  } catch (err) {
    res.status(404).json({ error: 'Board not found' });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await saveBoard(req.body.id, req.body.board);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = await saveBoard(req.params.id, req.body.board);
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteBoard(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/import-csv', async (req, res) => {
  try {
    const { csv, title } = req.body;
    if (!csv) throw new Error('Missing csv field');
    const board = csvToBoard(csv, title);
    res.json({ board });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/generate-random', async (req, res) => {
  try {
    const { numCategories, includeRound2 } = req.body || {};
    const board = await generateRandomBoard({
      numCategories,
      includeRound2: !!includeRound2,
    });
    res.json({ board });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
