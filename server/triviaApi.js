// Builds boards from the Open Trivia DB (opentdb.com) — a large bank of
// general trivia. OTDB questions are phrased as questions rather than
// Jeopardy-style statements, so we best-effort convert them: "Who/Which/What
// <noun> <verb phrase>?" swaps its lead-in word for "This"/"This person" and
// drops the question mark, since that word order is identical either way
// ("Which composer wrote X?" -> "This composer wrote X."). Phrasings that
// don't fit that shape (e.g. "Where.../When...") are left as the original
// question — still playable, just not full Jeopardy style.
//
// OTDB enforces one request every ~5 seconds per IP, so category fetches run
// sequentially with a spacing delay rather than in parallel.
import { sanitizeText, formatAnswer } from './clueFormat.js';

const OTDB_BASE = 'https://opentdb.com';
const REQUEST_SPACING_MS = 5200;
const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 };

const ROUND1_VALUES = [200, 400, 600, 800, 1000];
const ROUND2_VALUES = [400, 800, 1200, 1600, 2000];

const LEAD_IN_SWAPS = [
  [/^Who\b/i, 'This person'],
  [/^Which of the following\b/i, 'This'],
  [/^Which\b/i, 'This'],
  [/^What\b/i, 'This'],
];

function decode(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(arr, n) {
  const pool = [...arr];
  const picked = [];
  while (picked.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trivia API request failed (${res.status})`);
  return res.json();
}

export async function fetchTriviaCategories() {
  const data = await fetchJson(`${OTDB_BASE}/api_category.php`);
  return data.trivia_categories || [];
}

async function fetchCategoryQuestions(categoryId, amount) {
  const url = `${OTDB_BASE}/api.php?amount=${amount}&category=${categoryId}&type=multiple&encode=url3986`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await fetchJson(url);
    if (data.response_code === 5) {
      // Rate limited — back off and retry.
      await sleep(REQUEST_SPACING_MS);
      continue;
    }
    if (data.response_code !== 0 || !data.results?.length) return [];
    return data.results;
  }
  return [];
}

function toClueStatement(rawQuestion) {
  const question = sanitizeText(decode(rawQuestion));
  for (const [pattern, replacement] of LEAD_IN_SWAPS) {
    if (pattern.test(question)) {
      return question.replace(pattern, replacement).replace(/\?\s*$/, '.');
    }
  }
  return question;
}

function buildClues(questions, values) {
  const sorted = [...questions].sort(
    (a, b) => (DIFFICULTY_RANK[a.difficulty] ?? 1) - (DIFFICULTY_RANK[b.difficulty] ?? 1)
  );
  const count = Math.min(sorted.length, values.length);
  const clues = sorted.slice(0, count).map((q, i) => ({
    value: values[i],
    clue: toClueStatement(q.question),
    answer: formatAnswer(decode(q.correct_answer)),
    dailyDouble: false,
  }));
  if (clues.length > 1) {
    const eligible = clues.filter((c) => c.value > clues[0].value);
    const target = eligible[Math.floor(Math.random() * eligible.length)];
    target.dailyDouble = true;
  }
  return clues;
}

// Generates a full board (title, categories, optional round2, finalJeopardy)
// pulled from random Open Trivia DB categories. Returns whatever it managed
// to fetch — categories that come back empty are simply skipped.
export async function generateRandomBoard({ numCategories = 5, includeRound2 = false } = {}) {
  const count = Math.max(2, Math.min(Number(numCategories) || 5, 10));
  const allCategories = await fetchTriviaCategories();
  if (!allCategories.length) throw new Error('Trivia API returned no categories');

  const slotsNeeded = count * (includeRound2 ? 2 : 1) + 1; // +1 spare for Final Jeopardy
  const chosen = pickRandom(allCategories, Math.min(slotsNeeded, allCategories.length));

  const round1 = [];
  const round2 = [];
  let final = null;
  let isFirstRequest = true;

  for (const cat of chosen) {
    const needRound1 = round1.length < count;
    const needRound2 = includeRound2 && !needRound1 && round2.length < count;
    const needFinal = !needRound1 && !needRound2 && !final;
    if (!needRound1 && !needRound2 && !needFinal) break;

    if (!isFirstRequest) await sleep(REQUEST_SPACING_MS);
    isFirstRequest = false;

    const amount = needFinal ? 1 : 5;
    const questions = await fetchCategoryQuestions(cat.id, amount);
    if (!questions.length) continue;

    if (needRound1) {
      const clues = buildClues(questions, ROUND1_VALUES);
      if (clues.length >= 3) round1.push({ name: cat.name, clues });
    } else if (needRound2) {
      const clues = buildClues(questions, ROUND2_VALUES);
      if (clues.length >= 3) round2.push({ name: cat.name, clues });
    } else if (needFinal) {
      final = {
        category: cat.name,
        clue: toClueStatement(questions[0].question),
        answer: formatAnswer(decode(questions[0].correct_answer)),
      };
    }
  }

  if (round1.length === 0) throw new Error('Could not fetch enough trivia categories — try again');

  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    title: `Taylor's Prep — ${dateLabel}`,
    categories: round1,
    round2: includeRound2 && round2.length ? { categories: round2 } : null,
    finalJeopardy: final || { category: '', clue: '', answer: '' },
  };
}
