import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket, emitAsync } from '../lib/socket.js';
import Board from '../components/Board.jsx';
import Scoreboard from '../components/Scoreboard.jsx';

export default function PlayPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState(code || '');
  const [nameInput, setNameInput] = useState('');
  const [joined, setJoined] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [wagerInput, setWagerInput] = useState(0);
  const [wagerSubmitted, setWagerSubmitted] = useState(false);
  const [answerInput, setAnswerInput] = useState('');
  const [answerSubmitted, setAnswerSubmitted] = useState(false);

  useEffect(() => {
    document.title = 'Player';
  }, []);

  useEffect(() => {
    function onState(s) {
      setState((prev) => {
        if (!prev || prev.phase !== s.phase) {
          setWagerSubmitted(false);
          setAnswerSubmitted(false);
        }
        return s;
      });
    }
    function onError({ error }) {
      setError(error);
      setTimeout(() => setError(''), 4000);
    }
    socket.on('state:public', onState);
    socket.on('action:error', onError);
    return () => {
      socket.off('state:public', onState);
      socket.off('action:error', onError);
    };
  }, []);

  async function join(e) {
    e?.preventDefault();
    const roomCode = codeInput.trim().toUpperCase();
    if (!roomCode || !nameInput.trim()) return;
    const storageKey = `jeopardy_playerId_${roomCode}`;
    const existingId = localStorage.getItem(storageKey);
    try {
      const res = await emitAsync('player:join', { code: roomCode, name: nameInput.trim(), playerId: existingId });
      localStorage.setItem(storageKey, res.playerId);
      setPlayerId(res.playerId);
      setJoined(true);
      if (!code) navigate(`/play/${roomCode}`);
    } catch (err) {
      setError(err.message);
    }
  }

  // auto-join if we already have a stored name/playerId for this room code
  useEffect(() => {
    if (!code || joined) return;
    const storageKey = `jeopardy_playerId_${code}`;
    const storedName = localStorage.getItem(`jeopardy_name_${code}`);
    const storedId = localStorage.getItem(storageKey);
    if (storedId && storedName) {
      setNameInput(storedName);
      emitAsync('player:join', { code, name: storedName, playerId: storedId })
        .then((res) => {
          localStorage.setItem(storageKey, res.playerId);
          setPlayerId(res.playerId);
          setJoined(true);
        })
        .catch(() => {
          /* fall through to manual join form */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (joined && code) localStorage.setItem(`jeopardy_name_${code}`, nameInput.trim());
  }, [joined, code, nameInput]);

  function act(event, payload) {
    emitAsync(event, payload).catch((err) => setError(err.message));
  }

  if (!joined) {
    return (
      <div className="page center-page">
        <div className="title">Join Game</div>
        <form className="card" onSubmit={join}>
          {!code && (
            <>
              <label>Room Code</label>
              <input
                style={{ width: '100%', marginTop: '0.4rem', marginBottom: '0.75rem', textTransform: 'uppercase' }}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                maxLength={4}
                placeholder="ABCD"
              />
            </>
          )}
          <label>Your Name</label>
          <input
            style={{ width: '100%', marginTop: '0.4rem', marginBottom: '0.75rem' }}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Enter your name"
          />
          {error && <div className="error-banner">{error}</div>}
          <button style={{ width: '100%' }} type="submit">
            Join
          </button>
        </form>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page center-page">
        <div className="title">Connecting...</div>
      </div>
    );
  }

  const isLockedOut = state.buzz?.lockedOutIds?.includes(playerId);
  const canBuzz = state.phase === 'clue' && state.buzz.open && !state.buzz.lockedPlayerId && !isLockedOut;
  const me = state.players.find((p) => p.id === playerId);

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      <Scoreboard players={state.players} buzz={state.buzz} youId={playerId} />

      {state.phase === 'lobby' && <p className="subtitle center-page">Waiting for the host to start the game...</p>}

      {state.phase === 'board' && (
        <div className="board-container">
          {state.round === 2 && <div className="round-banner">Round 2 — Double Jeopardy</div>}
          <Board
            key={state.round}
            board={state.board}
            boardRevealed={state.boardRevealed}
            valuesRevealed={state.boardRevealed || state.categoryIntroStep !== null}
          />
          <p className="subtitle" style={{ textAlign: 'center' }}>
            Watch the display — the host is picking the next clue.
          </p>
        </div>
      )}

      {state.phase === 'revealing_dd' && (
        <div className="page center-page">
          <div className="daily-double-banner">Daily Double!</div>
        </div>
      )}

      {(state.phase === 'clue' || state.phase === 'dd_clue') && (
        <div className="page center-page" style={{ flex: 1 }}>
          {state.phase === 'dd_clue' ? (
            <p className="subtitle">Daily Double in progress...</p>
          ) : (
            <button className="buzzer-button" disabled={!canBuzz} onClick={() => act('player:buzz')}>
              {isLockedOut ? 'Locked Out' : state.buzz.lockedPlayerId ? 'Locked' : state.buzz.open ? 'BUZZ' : 'Wait...'}
            </button>
          )}
        </div>
      )}

      {state.phase === 'final_wager' && (
        <div className="page center-page">
          <div className="title">Final Jeopardy</div>
          <p className="subtitle">Category: {state.final?.category}</p>
          {wagerSubmitted ? (
            <p>Wager submitted! Waiting for other players...</p>
          ) : (
            <div className="card">
              <label>Your wager (max ${Math.max(me?.score || 0, 0)})</label>
              <input
                type="number"
                min="0"
                max={Math.max(me?.score || 0, 0)}
                value={wagerInput}
                onChange={(e) => setWagerInput(e.target.value)}
                style={{ width: '100%', marginTop: '0.4rem', marginBottom: '0.75rem' }}
              />
              <button
                style={{ width: '100%' }}
                onClick={() => {
                  act('player:submitFinalWager', { wager: wagerInput });
                  setWagerSubmitted(true);
                }}
              >
                Submit Wager
              </button>
            </div>
          )}
        </div>
      )}

      {state.phase === 'final_clue' && (
        <div className="page center-page">
          <div className="title">Final Jeopardy</div>
          <div className="clue-text">{state.final?.clue}</div>
          {answerSubmitted ? (
            <p>Answer submitted! Waiting for other players...</p>
          ) : (
            <div className="card">
              <textarea
                style={{ width: '100%', marginBottom: '0.75rem' }}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                placeholder="What is...?"
              />
              <button
                style={{ width: '100%' }}
                onClick={() => {
                  act('player:submitFinalAnswer', { answer: answerInput });
                  setAnswerSubmitted(true);
                }}
              >
                Submit Answer
              </button>
            </div>
          )}
        </div>
      )}

      {(state.phase === 'final_reveal' || state.phase === 'game_over') && (
        <div className="page center-page">
          <div className="title">{state.phase === 'game_over' ? 'Final Standings' : 'Revealing Answers...'}</div>
          {state.phase === 'game_over' &&
            [...state.players]
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
