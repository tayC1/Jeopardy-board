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

let cachedIndex = null;

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

async function loadIndex() {
  if (cachedIndex) return cachedIndex;
  await ensureDatasetFile();
  const raw = await fs.readFile(DATA_FILE, 'utf-8');
  const lines = raw.split('\n');
  const header = lines[0].split('\t').map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));

  const groups = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split('\t');
    const round = Number(cells[col.round]);
    const clueValue = Number(cells[col.clue_value]);
    const dailyDoubleValue = Number(cells[col.daily_double_value]);
    const category = (cells[col.category] || '').trim();
    const rawClue = (cells[col.answer] || '').trim();
    const rawResponse = (cells[col.question] || '').trim();
    const airDate = cells[col.air_date];
    if (!category || !rawClue || !rawResponse || !Number.isFinite(round)) continue;

    const key = `${round}\u0000${category}\u0000${airDate}`;
    if (!groups.has(key)) groups.set(key, { round, category, clues: [] });
    groups.get(key).clues.push({
      value: Number.isFinite(clueValue) ? clueValue : 0,
      clue: sanitizeText(rawClue),
      answer: formatAnswer(rawResponse),
      dailyDouble: dailyDoubleValue > 0,
    });
  }

  const byRound = { 1: [], 2: [], 3: [] };
  for (const group of groups.values()) {
    if (byRound[group.round]) byRound[group.round].push(group);
  }
  cachedIndex = byRound;
  return cachedIndex;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toCategory(group) {
  return {
    name: group.category,
    clues: [...group.clues].sort((a, b) => a.value - b.value).slice(0, 5),
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
      if (group.clues.length < 3 || usedNames.has(group.category)) continue;
      usedNames.add(group.category);
      picked.push(group);
    }
    return picked;
  }

  const round1Groups = takeGroups(1, count);
  if (round1Groups.length === 0) throw new Error('Could not build a board from the Jeopardy clue dataset');

  const round2Groups = includeRound2 ? takeGroups(2, count) : [];

  const finalCandidates = (index[3] || []).filter((g) => g.clues.length >= 1 && !usedNames.has(g.category));
  const finalGroup = finalCandidates.length ? finalCandidates[Math.floor(Math.random() * finalCandidates.length)] : null;

  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    title: `Taylor's Prep — ${dateLabel}`,
    categories: round1Groups.map(toCategory),
    round2: round2Groups.length ? { categories: round2Groups.map(toCategory) } : null,
    finalJeopardy: finalGroup
      ? { category: finalGroup.category, clue: finalGroup.clues[0].clue, answer: finalGroup.clues[0].answer }
      : { category: '', clue: '', answer: '' },
  };
}
