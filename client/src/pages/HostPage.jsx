import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket, emitAsync } from '../lib/socket.js';
import Board from '../components/Board.jsx';
import Scoreboard from '../components/Scoreboard.jsx';

function CountdownTimer({ startedAt, durationSec, label }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  if (!startedAt) return null;
  const remaining = Math.max(0, Math.ceil(durationSec - (now - startedAt) / 1000));

  return (
    <div className="countdown-timer">
      {label}: {remaining}s
    </div>
  );
}

export default function HostPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [ddPlayerId, setDdPlayerId] = useState('');
  const [ddWager, setDdWager] = useState(0);

  useEffect(() => {
    if (code) return;
    fetch('/api/boards')
      .then((r) => r.json())
      .then((list) => {
        setBoards(list);
        if (list.length > 0) setSelectedBoardId(list[0].id);
      });
  }, [code]);

  useEffect(() => {
    function onState(s) {
      setState(s);
    }
    function onError({ error }) {
      setError(error);
      setTimeout(() => setError(''), 4000);
    }
    socket.on('state:host', onState);
    socket.on('action:error', onError);

    if (code) {
      emitAsync('host:rejoinRoom', { code }).catch((err) => setError(err.message));
    }

    return () => {
      socket.off('state:host', onState);
      socket.off('action:error', onError);
    };
  }, [code]);

  async function createRoom() {
    try {
      const res = await emitAsync('host:createRoom', { boardId: selectedBoardId });
      navigate(`/host/${res.code}`);
    } catch (err) {
      setError(err.message);
    }
  }

  function act(event, payload) {
    emitAsync(event, payload).catch((err) => setError(err.message));
  }

  if (!code) {
    return (
      <div className="page center-page">
        <div className="title">Host a Game</div>
        {boards.length === 0 ? (
          <div className="card">
            <p>No boards found yet. Create one in the Board Editor first.</p>
            <button onClick={() => navigate('/editor')}>Go to Editor</button>
          </div>
        ) : (
          <div className="card">
            <label>Choose a board</label>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <select value={selectedBoardId} onChange={(e) => setSelectedBoardId(e.target.value)}>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
              <button onClick={createRoom}>Create Room</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page center-page">
        <div className="title">Connecting...</div>
        {error && <div className="error-banner">{error}</div>}
      </div>
    );
  }

  const allAnswered = state.board.categories.every((cat) => cat.clues.every((c) => c.answered));
  const hasTestPlayer = !!state.testPlayerId;
  const lastCorrectPlayer = state.players.find((p) => p.id === state.lastCorrectPlayerId);

  return (
    <div className="page">
      <div className="top-bar">
        <div>
          <div className="subtitle">Room Code</div>
          <div className="room-code">{state.code}</div>
        </div>
        <button
          className="secondary"
          onClick={() => window.open(`${location.origin}/display/${state.code}`, '_blank')}
        >
          Display
        </button>
        <button
          className="secondary"
          onClick={() => act(hasTestPlayer ? 'host:removeTestPlayer' : 'host:addTestPlayer')}
        >
          {hasTestPlayer ? 'Remove Test Player' : 'Add Test Player'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {lastCorrectPlayer && (
        <div className="subtitle last-correct-indicator">
          Last correct answer: <strong>{lastCorrectPlayer.name}</strong>
        </div>
      )}

      <Scoreboard players={state.players} buzz={state.buzz} />

      {state.phase === 'lobby' && (
        <div className="page center-page phase-fade-in">
          <p>Waiting for players to join...</p>
          <button disabled={state.players.length === 0} onClick={() => act('host:startBoardRound')}>
            Start Game ({state.players.length} joined)
          </button>
        </div>
      )}

      {state.phase === 'board' && (
        <div className="board-container phase-fade-in">
          {state.round === 2 && <div className="round-banner">Round 2 — Double Jeopardy</div>}
          <Board
            key={state.round}
            board={state.board}
            boardRevealed={state.boardRevealed}
            valuesRevealed={state.valuesRevealed}
            onSelectClue={(catIndex, clueIndex) => act('host:selectClue', { catIndex, clueIndex })}
          />
          <div className="host-controls">
            {!state.boardRevealed && !state.valuesRevealed && (
              <button onClick={() => act('host:revealValues')}>Reveal Values</button>
            )}

            {!state.boardRevealed &&
              state.valuesRevealed &&
              (state.categoryIntroStep === null || state.categoryIntroStep === undefined) && (
                <button onClick={() => act('host:startCategoryIntro')}>Show Logo</button>
              )}

            {!state.boardRevealed && state.categoryIntroStep !== null && state.categoryIntroStep !== undefined && (
              <>
                <div className="subtitle">
                  {state.categoryIntroStep % 2 === 0
                    ? 'Showing the intro logo...'
                    : `Now announcing: ${state.board.categories[Math.floor(state.categoryIntroStep / 2)]?.name}`}
                </div>
                <button onClick={() => act('host:advanceCategoryIntro')}>
                  {state.categoryIntroStep >= state.board.categories.length * 2 - 1
                    ? 'Show Board'
                    : state.categoryIntroStep % 2 === 0
                      ? 'Show Category'
                      : `Next Category (${Math.floor(state.categoryIntroStep / 2) + 2}/${state.board.categories.length})`}
                </button>
              </>
            )}

            {state.boardRevealed &&
              (state.hasRound2 && state.round === 1 ? (
                <button disabled={!allAnswered} onClick={() => act('host:startRound2')}>
                  Start Round 2
                </button>
              ) : (
                <button disabled={!allAnswered} onClick={() => act('host:startFinal')}>
                  Start Final Jeopardy
                </button>
              ))}
          </div>
        </div>
      )}

      {state.phase === 'revealing_dd' && (
        <div className="page center-page">
          <div className="daily-double-banner">Daily Double!</div>
          <p>Value on board: ${state.currentClue.value}</p>
          <div className="card">
            <label>Who is answering?</label>
            <select value={ddPlayerId} onChange={(e) => setDdPlayerId(e.target.value)} style={{ width: '100%', marginTop: '0.4rem' }}>
              <option value="">Select a player</option>
              {state.players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.score})
                </option>
              ))}
            </select>
            <label style={{ marginTop: '0.75rem', display: 'block' }}>Wager</label>
            <input
              type="number"
              min="0"
              value={ddWager}
              onChange={(e) => setDdWager(e.target.value)}
              style={{ width: '100%', marginTop: '0.4rem' }}
            />
            <button
              style={{ marginTop: '0.75rem', width: '100%' }}
              disabled={!ddPlayerId}
              onClick={() => act('host:dailyDoubleWager', { playerId: ddPlayerId, wager: ddWager })}
            >
              Confirm Wager
            </button>
          </div>
        </div>
      )}

      {(state.phase === 'clue' || state.phase === 'dd_clue') && (
        <div className="clue-overlay">
          {state.phase === 'dd_clue' && <div className="daily-double-banner">Daily Double</div>}
          <div className="clue-value-tag">${state.currentClue.value}</div>
          <div className="clue-text">{state.currentClue.clue}</div>
          <div className="clue-text" style={{ color: '#ffcc00', fontSize: '1.5rem' }}>
            Answer: {state.currentClue.answer}
          </div>

          {state.phase === 'clue' && !state.buzz.lockedPlayerId && (
            <div className="host-controls">
              {!state.buzz.open && <button onClick={() => act('host:openBuzzers')}>Open Buzzers</button>}
              {state.buzz.open && <div className="subtitle">Buzzers open — waiting for a buzz-in...</div>}
              {state.buzz.open && (
                <CountdownTimer startedAt={state.buzz.openedAt} durationSec={20} label="Auto-skip in" />
              )}
              {state.buzz.open && hasTestPlayer && (
                <button className="secondary" onClick={() => act('host:testPlayerBuzz')}>
                  Buzz (Test Player)
                </button>
              )}
              <button className="secondary" onClick={() => act('host:revealAndSkip')}>
                Reveal &amp; Skip
              </button>
            </div>
          )}

          {state.phase === 'clue' && state.buzz.lockedPlayerId && (
            <div className="host-controls">
              <div className="subtitle">
                {state.players.find((p) => p.id === state.buzz.lockedPlayerId)?.name} buzzed in!
              </div>
              <CountdownTimer startedAt={state.buzz.lockedAt} durationSec={7} label="Answer time" />
              <button className="correct" onClick={() => act('host:judge', { correct: true })}>
                Correct
              </button>
              <button className="danger" onClick={() => act('host:judge', { correct: false })}>
                Incorrect
              </button>
            </div>
          )}

          {state.phase === 'dd_clue' && (
            <div className="host-controls">
              <div className="subtitle">
                {state.players.find((p) => p.id === state.dailyDouble.playerId)?.name} wagered ${state.dailyDouble.wager}
              </div>
              <button className="correct" onClick={() => act('host:judge', { correct: true })}>
                Correct
              </button>
              <button className="danger" onClick={() => act('host:judge', { correct: false })}>
                Incorrect
              </button>
            </div>
          )}
        </div>
      )}

      {state.phase === 'final_wager' && (
        <div className="page center-page">
          <div className="title">Final Jeopardy</div>
          <p>Category: {state.final.category}</p>
          <p>
            Wagers submitted: {Object.keys(state.final.wagers).length} / {state.players.length}
          </p>
          <button onClick={() => act('host:closeFinalWagers')}>Close Wagers &amp; Reveal Clue</button>
        </div>
      )}

      {state.phase === 'final_clue' && (
        <div className="clue-overlay">
          <div className="clue-text">{state.final.clue}</div>
          <div className="subtitle">
            Answers submitted: {Object.keys(state.final.answers).length} / {state.players.length}
          </div>
          <button onClick={() => act('host:closeFinalAnswers')}>Close Answers &amp; Reveal Results</button>
        </div>
      )}

      {state.phase === 'final_reveal' && (
        <FinalReveal state={state} act={act} />
      )}

      {state.phase === 'game_over' && (
        <div className="page center-page">
          <div className="title">Final Standings</div>
          {[...state.players]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <div key={p.id} className="subtitle">
                {i + 1}. {p.name} — ${p.score}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function FinalReveal({ state, act }) {
  const { final } = state;
  const currentId = final.order[final.revealIndex];
  const current = currentId
    ? {
        player: state.players.find((p) => p.id === currentId),
        wager: final.wagers[currentId] || 0,
        answer: final.answers[currentId] || '(no answer)',
        result: final.results[currentId],
      }
    : null;

  return (
    <div className="page center-page">
      <div className="title">Final Jeopardy Reveal</div>
      {final.revealIndex === -1 && <button onClick={() => act('host:advanceFinalReveal')}>Reveal First Player</button>}

      {current && (
        <div
          className={`final-reveal-card${current.result === true ? ' correct' : current.result === false ? ' incorrect' : ''}`}
        >
          <h3>{current.player?.name}</h3>
          <p>Wager: ${current.wager}</p>
          <p>Answer: {current.answer}</p>
          {current.result === undefined ? (
            <div className="row">
              <button className="correct" onClick={() => act('host:judgeFinal', { correct: true })}>
                Correct
              </button>
              <button className="danger" onClick={() => act('host:judgeFinal', { correct: false })}>
                Incorrect
              </button>
            </div>
          ) : (
            <p>{current.result ? '✅ Correct' : '❌ Incorrect'}</p>
          )}
        </div>
      )}

      {current && current.result !== undefined && final.revealIndex < final.order.length - 1 && (
        <button onClick={() => act('host:advanceFinalReveal')}>Reveal Next Player</button>
      )}
    </div>
  );
}
