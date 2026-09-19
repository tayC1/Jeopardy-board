// Parses a simple RFC4180-style CSV (quoted fields, escaped "" quotes) into rows of strings.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Expects columns: category,value,clue,answer,dailyDouble
export function csvToBoard(text, title = 'Imported Board') {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV is empty');

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const required = ['category', 'value', 'clue', 'answer'];
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`CSV missing required column: ${col}`);
  }
  const idx = {
    category: header.indexOf('category'),
    value: header.indexOf('value'),
    clue: header.indexOf('clue'),
    answer: header.indexOf('answer'),
    dailyDouble: header.indexOf('dailydouble'),
  };

  const categoryMap = new Map();
  for (const cells of rows.slice(1)) {
    const name = (cells[idx.category] || '').trim();
    if (!name) continue;
    const value = Number(cells[idx.value]);
    const clue = (cells[idx.clue] || '').trim();
    const answer = (cells[idx.answer] || '').trim();
    const dailyDouble =
      idx.dailyDouble >= 0 &&
      ['true', 'yes', '1', 'y'].includes((cells[idx.dailyDouble] || '').trim().toLowerCase());

    if (!categoryMap.has(name)) categoryMap.set(name, []);
    categoryMap.get(name).push({
      value: Number.isFinite(value) ? value : 0,
      clue,
      answer,
      dailyDouble,
    });
  }

  const categories = Array.from(categoryMap.entries()).map(([name, clues]) => ({
    name,
    clues: clues.sort((a, b) => a.value - b.value),
  }));

  return {
    title,
    categories,
    finalJeopardy: { category: '', clue: '', answer: '' },
  };
}
