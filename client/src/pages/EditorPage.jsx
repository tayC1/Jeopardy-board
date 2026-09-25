import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function emptyCategory(index, startValue = 200) {
  return { name: `CATEGORY ${index}`, clues: [{ value: startValue, clue: '', answer: '', dailyDouble: false }] };
}

const emptyBoard = () => ({
  title: 'New Board',
  categories: [emptyCategory(1)],
  round2: null,
  finalJeopardy: { category: '', clue: '', answer: '' },
});

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [boardId, setBoardId] = useState(id || '');
  const [board, setBoard] = useState(emptyBoard());
  const [boards, setBoards] = useState([]);
  const [status, setStatus] = useState('');
  const [prepSource, setPrepSource] = useState('jeopardy-archive');
  const [prepNumCategories, setPrepNumCategories] = useState(5);
  const [prepIncludeRound2, setPrepIncludeRound2] = useState(false);
  const [prepLoading, setPrepLoading] = useState(false);

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then(setBoards);
  }, [status]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/boards/${id}`)
      .then((r) => r.json())
      .then((data) => setBoard({ round2: null, ...data }));
  }, [id]);

  function updateTitle(title) {
    setBoard((b) => ({ ...b, title }));
  }

  function categoriesFor(b, round) {
    return round === 2 ? b.round2?.categories || [] : b.categories;
  }

  function withCategories(round, updater) {
    setBoard((b) => {
      const cats = updater(categoriesFor(b, round));
      if (round === 2) return { ...b, round2: { ...(b.round2 || {}), categories: cats } };
      return { ...b, categories: cats };
    });
  }

  function addCategory(round) {
    withCategories(round, (cats) => [...cats, emptyCategory(cats.length + 1, round === 2 ? 400 : 200)]);
  }

  function removeCategory(round, catIdx) {
    withCategories(round, (cats) => cats.filter((_, i) => i !== catIdx));
  }

  function renameCategory(round, catIdx, name) {
    withCategories(round, (cats) => cats.map((c, i) => (i === catIdx ? { ...c, name } : c)));
  }

  function addClue(round, catIdx) {
    withCategories(round, (cats) =>
      cats.map((c, i) => {
        if (i !== catIdx) return c;
        const lastValue = c.clues.at(-1)?.value || 0;
        const step = round === 2 ? 400 : 200;
        return { ...c, clues: [...c.clues, { value: lastValue + step, clue: '', answer: '', dailyDouble: false }] };
      })
    );
  }

  function removeClue(round, catIdx, clueIdx) {
    withCategories(round, (cats) =>
      cats.map((c, i) => (i === catIdx ? { ...c, clues: c.clues.filter((_, j) => j !== clueIdx) } : c))
    );
  }

  function updateClue(round, catIdx, clueIdx, field, value) {
    withCategories(round, (cats) =>
      cats.map((c, i) => {
        if (i !== catIdx) return c;
        return { ...c, clues: c.clues.map((clue, j) => (j === clueIdx ? { ...clue, [field]: value } : clue)) };
      })
    );
  }

  function toggleRound2(enabled) {
    setBoard((b) => ({
      ...b,
      round2: enabled ? { categories: b.round2?.categories?.length ? b.round2.categories : [emptyCategory(1, 400)] } : null,
    }));
  }

  function updateFinal(field, value) {
    setBoard((b) => ({ ...b, finalJeopardy: { ...b.finalJeopardy, [field]: value } }));
  }

  async function save() {
    setStatus('Saving...');
    const method = boardId ? 'PUT' : 'POST';
    const url = boardId ? `/api/boards/${boardId}` : '/api/boards';
    const payload = { ...board, round2: board.round2?.categories?.length ? board.round2 : null };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: boardId || undefined, board: payload }),
    });
    const data = await res.json();
    if (data.id) {
      setBoardId(data.id);
      navigate(`/editor/${data.id}`, { replace: true });
      setStatus('Saved!');
    } else {
      setStatus('Error: ' + (data.error || 'unknown'));
    }
  }

  async function loadBoard(newId) {
    if (!newId) {
      setBoardId('');
      setBoard(emptyBoard());
      navigate('/editor', { replace: true });
      return;
    }
    const res = await fetch(`/api/boards/${newId}`);
    const data = await res.json();
    setBoardId(newId);
    setBoard({ round2: null, ...data });
    navigate(`/editor/${newId}`, { replace: true });
  }

  async function importCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = await fetch('/api/boards/import-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: text, title: file.name.replace(/\.csv$/i, '') }),
    });
    const data = await res.json();
    if (data.board) {
      setBoard({ round2: null, ...data.board });
      setBoardId('');
      setStatus('CSV imported — review and save.');
    } else {
      setStatus('Error: ' + data.error);
    }
    e.target.value = '';
  }

  async function generateTaylorsPrep() {
    setPrepLoading(true);
    setStatus(
      prepSource === 'open-trivia-db'
        ? 'Fetching trivia from Open Trivia DB... this can take a minute (API rate limits).'
        : 'Pulling real Jeopardy! clues... the first run downloads the clue archive, so it may take a bit longer.'
    );
    try {
      const res = await fetch('/api/boards/generate-random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numCategories: prepNumCategories,
          includeRound2: prepIncludeRound2,
          source: prepSource,
        }),
      });
      const data = await res.json();
      if (data.board) {
        setBoard({ round2: null, ...data.board });
        setBoardId('');
        setStatus("Taylor's Prep board generated — review and save.");
      } else {
        setStatus('Error: ' + data.error);
      }
    } catch (err) {
      setStatus('Error: ' + err.message);
    } finally {
      setPrepLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="top-bar">
        <div className="title" style={{ fontSize: '1.8rem' }}>
          Board Editor
        </div>
        <div className="row">
          <select value={boardId} onChange={(e) => loadBoard(e.target.value)}>
            <option value="">-- New Board --</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <label className="secondary" style={{ padding: '0.6rem 1.2rem', borderRadius: 6, border: '2px solid white', display: 'inline-block' }}>
            Import CSV
            <input type="file" accept=".csv" onChange={importCsv} style={{ display: 'none' }} />
          </label>
          <button onClick={save}>Save Board</button>
        </div>
      </div>

      {status && <div className="subtitle">{status}</div>}

      <div className="card" style={{ maxWidth: 'none', marginBottom: '1rem' }}>
        <div className="title" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          Taylor's Prep
        </div>
        <div className="subtitle" style={{ marginBottom: '0.75rem' }}>
          {prepSource === 'open-trivia-db'
            ? 'Auto-generate a board from random Open Trivia DB categories, converted to Jeopardy-style clue/answer-as-a-question form where possible. Loads into the editor below for review before saving.'
            : 'Auto-generate a board from real, previously-aired Jeopardy! categories — already in proper clue/answer-as-a-question form. Loads into the editor below for review before saving.'}
        </div>
        <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            Source
            <select value={prepSource} onChange={(e) => setPrepSource(e.target.value)} style={{ marginLeft: '0.5rem' }}>
              <option value="jeopardy-archive">Real Jeopardy Archive</option>
              <option value="open-trivia-db">Open Trivia DB</option>
            </select>
          </label>
          <label>
            Categories
            <input
              type="number"
              min="2"
              max="10"
              value={prepNumCategories}
              onChange={(e) => setPrepNumCategories(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: '70px', marginLeft: '0.5rem' }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={prepIncludeRound2}
              onChange={(e) => setPrepIncludeRound2(e.target.checked)}
            />{' '}
            Include Round 2
          </label>
          <button onClick={generateTaylorsPrep} disabled={prepLoading}>
            {prepLoading ? 'Generating...' : "Generate Taylor's Prep Board"}
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 'none', marginBottom: '1rem' }}>
        <label>Board Title</label>
        <input style={{ width: '100%', marginTop: '0.4rem' }} value={board.title} onChange={(e) => updateTitle(e.target.value)} />
      </div>

      <div className="title" style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>
        Round 1
      </div>
      <CategoryGrid
        categories={board.categories}
        onAddCategory={() => addCategory(1)}
        onRemoveCategory={(catIdx) => removeCategory(1, catIdx)}
        onRenameCategory={(catIdx, name) => renameCategory(1, catIdx, name)}
        onAddClue={(catIdx) => addClue(1, catIdx)}
        onRemoveClue={(catIdx, clueIdx) => removeClue(1, catIdx, clueIdx)}
        onUpdateClue={(catIdx, clueIdx, field, value) => updateClue(1, catIdx, clueIdx, field, value)}
      />

      <div className="card" style={{ maxWidth: 'none', margin: '1.5rem 0' }}>
        <label>
          <input type="checkbox" checked={!!board.round2} onChange={(e) => toggleRound2(e.target.checked)} /> This board has a Round
          2 (Double Jeopardy)
        </label>
      </div>

      {board.round2 && (
        <>
          <div className="title" style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>
            Round 2 — Double Jeopardy
          </div>
          <CategoryGrid
            categories={board.round2.categories}
            onAddCategory={() => addCategory(2)}
            onRemoveCategory={(catIdx) => removeCategory(2, catIdx)}
            onRenameCategory={(catIdx, name) => renameCategory(2, catIdx, name)}
            onAddClue={(catIdx) => addClue(2, catIdx)}
            onRemoveClue={(catIdx, clueIdx) => removeClue(2, catIdx, clueIdx)}
            onUpdateClue={(catIdx, clueIdx, field, value) => updateClue(2, catIdx, clueIdx, field, value)}
          />
        </>
      )}

      <div className="card" style={{ maxWidth: 'none', marginTop: '1.5rem' }}>
        <div className="title" style={{ fontSize: '1.3rem' }}>
          Final Jeopardy
        </div>
        <label>Category</label>
        <input
          style={{ width: '100%', margin: '0.4rem 0 0.75rem' }}
          value={board.finalJeopardy.category}
          onChange={(e) => updateFinal('category', e.target.value)}
        />
        <label>Clue</label>
        <textarea
          style={{ width: '100%', margin: '0.4rem 0 0.75rem' }}
          value={board.finalJeopardy.clue}
          onChange={(e) => updateFinal('clue', e.target.value)}
        />
        <label>Answer</label>
        <textarea
          style={{ width: '100%', margin: '0.4rem 0' }}
          value={board.finalJeopardy.answer}
          onChange={(e) => updateFinal('answer', e.target.value)}
        />
      </div>
    </div>
  );
}

function CategoryGrid({ categories, onAddCategory, onRemoveCategory, onRenameCategory, onAddClue, onRemoveClue, onUpdateClue }) {
  return (
    <>
      <div className="editor-grid" style={{ gridTemplateColumns: `repeat(${categories.length}, 1fr)` }}>
        {categories.map((cat, catIdx) => (
          <div className="category-col" key={catIdx}>
            <input className="category-name" value={cat.name} onChange={(e) => onRenameCategory(catIdx, e.target.value)} />
            {cat.clues.map((clue, clueIdx) => (
              <div className="clue-edit-row" key={clueIdx}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <input
                    type="number"
                    min="0"
                    style={{ width: '90px' }}
                    value={clue.value}
                    onChange={(e) => onUpdateClue(catIdx, clueIdx, 'value', Math.max(0, Number(e.target.value) || 0))}
                  />
                  <label style={{ fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={clue.dailyDouble}
                      onChange={(e) => onUpdateClue(catIdx, clueIdx, 'dailyDouble', e.target.checked)}
                    />{' '}
                    Daily Double
                  </label>
                  <button className="danger" style={{ padding: '0.2rem 0.5rem' }} onClick={() => onRemoveClue(catIdx, clueIdx)}>
                    ✕
                  </button>
                </div>
                <textarea placeholder="Clue" value={clue.clue} onChange={(e) => onUpdateClue(catIdx, clueIdx, 'clue', e.target.value)} />
                <textarea
                  placeholder="Answer (e.g. What is...?)"
                  value={clue.answer}
                  onChange={(e) => onUpdateClue(catIdx, clueIdx, 'answer', e.target.value)}
                />
              </div>
            ))}
            <button className="secondary" style={{ width: '100%' }} onClick={() => onAddClue(catIdx)}>
              + Add Clue
            </button>
            <button className="danger" style={{ width: '100%', marginTop: '0.4rem' }} onClick={() => onRemoveCategory(catIdx)}>
              Remove Category
            </button>
          </div>
        ))}
      </div>
      <button className="secondary" style={{ marginTop: '1rem' }} onClick={onAddCategory}>
        + Add Category
      </button>
    </>
  );
}
