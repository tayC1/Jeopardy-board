// Builds "Taylor's Prep" boards from real aired Jeopardy! clues, using the
// community-maintained dataset at https://github.com/jwolle1/jeopardy_clue_dataset
// (scraped from J! Archive). Clues are already in proper Jeopardy form there —
// the dataset's "answer" column is the statement read to contestants and its
// "question" column is the plain correct response, which we wrap into
// "What/Who is ...?" form for display.
//
// Per the dataset's README: this data belongs to Jeopardy Productions, Inc.
// and is not to be used to build a public-facing site/app/product. It's only
// ever downloaded to this server's local disk for private, personal use.
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { sanitizeText, formatAnswer } from './clueFormat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'jeopardy_clues.tsv');
const DATA_URL = 'https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/combined_season1-42.tsv';

let indexPromise = null;
let colMap = null;

async function ensureDatasetFile() {
  try {
    await fs.access(DATA_FILE);
    return;
  } catch {
    // Not downloaded yet.
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const res = await fetch(DATA_URL);
  if (!res.ok || !res.body) throw new Error(`Failed to download Jeopardy clue dataset (HTTP ${res.status})`);
  const tmpFile = `${DATA_FILE}.download`;
  await finished(Readable.fromWeb(res.body).pipe(createWriteStream(tmpFile)));
  await fs.rename(tmpFile, DATA_FILE);
}

// Rows for a single round+category+air_date are always contiguous in the
// source file, so the index only needs to remember each group's byte range
// (plus a clue count) rather than every clue's text. Holding the full parsed
// dataset in memory (~120k category groups' worth of clue/answer text) costs
// several hundred MB of resident heap indefinitely; this index costs a few
// MB, and the handful of groups picked per board are read back off disk on
// demand in readGroupClues().
async function buildIndex() {
  await ensureDatasetFile();
  const buf = await fs.readFile(DATA_FILE);

  const firstNewline = buf.indexOf(0x0a);
  const header = buf.toString('utf-8', 0, firstNewline).split('\t').map((h) => h.trim());
  colMap = Object.fromEntries(header.map((h, i) => [h, i]));

  const byRound = { 1: [], 2: [], 3: [] };
  const len = buf.length;
  let pos = firstNewline + 1;
  let current = null;

  while (pos < len) {
    let nl = buf.indexOf(0x0a, pos);
    if (nl === -1) nl = len;
    const lineStart = pos;
    const lineEnd = nl;
    pos = nl + 1;
    if (lineEnd === lineStart) {
      current = null;
      continue;
    }

    const line = buf.toString('utf-8', lineStart, lineEnd);
    const cells = line.split('\t');
    const round = Number(cells[colMap.round]);
    const category = (cells[colMap.category] || '').trim();
    const rawClue = (cells[colMap.answer] || '').trim();
    const rawResponse = (cells[colMap.question] || '').trim();
    const airDate = cells[colMap.air_date];
    if (!category || !rawClue || !rawResponse || !Number.isFinite(round)) {
      current = null;
      continue;
    }

    if (current && current.round === round && current.category === category && current.airDate === airDate) {
      current.byteEnd = lineEnd;
      current.clueCount += 1;
    } else {
      if (current && byRound[current.round]) byRound[current.round].push(current);
      current = { round, category, airDate, byteStart: lineStart, byteEnd: lineEnd, clueCount: 1 };
    }
  }
  if (current && byRound[current.round]) byRound[current.round].push(current);

  return byRound;
}

// Memoizes the in-flight promise (not just the resolved value) so a startup
// preload and a request that lands mid-download share one download+parse
// instead of racing to fetch the ~80MB dataset twice.
function loadIndex() {
  if (!indexPromise) {
    indexPromise = buildIndex().catch((err) => {
      indexPromise = null; // allow retry on the next call after a failure
      throw err;
    });
  }
  return indexPromise;
}

// Kicks off the dataset download/index build immediately at server boot
// instead of waiting for the first "Taylor's Prep" request. On hosts like
// Render, that first request would otherwise pay for an ~80MB download
// inline (the disk is empty on every fresh deploy/restart), which risks the
// platform's request timeout and returns a truncated response.
export function preloadJeopardyDataset() {
  return loadIndex();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Reads just the group's own byte range back off disk and parses its clues —
// the only per-clue text ever held in memory is for groups actually chosen
// for a board.
async function readGroupClues(group) {
  const length = group.byteEnd - group.byteStart;
  const buffer = Buffer.alloc(length);
  const handle = await fs.open(DATA_FILE, 'r');
  try {
    await handle.read(buffer, 0, length, group.byteStart);
  } finally {
    await handle.close();
  }

  return buffer
    .toString('utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const cells = line.split('\t');
      const clueValue = Number(cells[colMap.clue_value]);
      const dailyDoubleValue = Number(cells[colMap.daily_double_value]);
      return {
        value: Number.isFinite(clueValue) ? clueValue : 0,
        clue: sanitizeText((cells[colMap.answer] || '').trim()),
        answer: formatAnswer((cells[colMap.question] || '').trim()),
        dailyDouble: dailyDoubleValue > 0,
      };
    });
}

async function toCategory(group) {
  const clues = await readGroupClues(group);
  return {
    name: group.category,
    clues: clues.sort((a, b) => a.value - b.value).slice(0, 5),
  };
}

// Assembles a board (title, categories, optional round2, finalJeopardy) out of
// randomly chosen real Jeopardy! category sets — each pulled intact from a
// single aired game so the point spread and Daily Double placement match how
// it actually aired.
export async function generateRandomBoard({ numCategories = 5, includeRound2 = false } = {}) {
  const count = Math.max(2, Math.min(Number(numCategories) || 5, 10));
  const index = await loadIndex();
  const usedNames = new Set();

  function takeGroups(round, n) {
    const picked = [];
    for (const group of shuffle(index[round] || [])) {
      if (picked.length >= n) break;
      if (group.clueCount < 3 || usedNames.has(group.category)) continue;
      usedNames.add(group.category);
      picked.push(group);
    }
    return picked;
  }

  const round1Groups = takeGroups(1, count);
  if (round1Groups.length === 0) throw new Error('Could not build a board from the Jeopardy clue dataset');

  const round2Groups = includeRound2 ? takeGroups(2, count) : [];

  const finalCandidates = (index[3] || []).filter((g) => g.clueCount >= 1 && !usedNames.has(g.category));
  const finalGroup = finalCandidates.length ? finalCandidates[Math.floor(Math.random() * finalCandidates.length)] : null;

  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const [categories, round2Categories, finalClues] = await Promise.all([
    Promise.all(round1Groups.map(toCategory)),
    Promise.all(round2Groups.map(toCategory)),
    finalGroup ? readGroupClues(finalGroup) : null,
  ]);

  return {
    title: `Taylor's Prep — ${dateLabel}`,
    categories,
    round2: round2Categories.length ? { categories: round2Categories } : null,
    finalJeopardy: finalGroup
      ? { category: finalGroup.category, clue: finalClues[0].clue, answer: finalClues[0].answer }
      : { category: '', clue: '', answer: '' },
  };
}
