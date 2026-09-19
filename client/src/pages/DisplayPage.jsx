import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket, emitAsync } from '../lib/socket.js';
import Board from '../components/Board.jsx';
import Scoreboard from '../components/Scoreboard.jsx';

function CategoryIntro({ categories, onDone }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (index >= categories.length - 1) {
        onDone();
      } else {
        setIndex((i) => i + 1);
      }
    }, 1100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div className="category-intro">
      <div key={index} className="category-intro-name">
        {categories[index]?.name}
      </div>
    </div>
  );
}

export default function DisplayPage() {
  const { code } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [introPlaying, setIntroPlaying] = useState(false);
  const prevRevealedRef = useRef(null);

  useEffect(() => {
    function onState(s) {
      setState(s);
    }
    socket.on('state:public', onState);
    emitAsync('display:joinRoom', { code }).catch((err) => setError(err.message));
    return () => socket.off('state:public', onState);
  }, [code]);

  useEffect(() => {
    if (!state) return;
    if (prevRevealedRef.current === false && state.boardRevealed === true) {
      setIntroPlaying(true);
    }
    prevRevealedRef.current = state.boardRevealed ?? null;
  }, [state]);

  if (error) {
    return (
      <div className="page center-page">
        <div className="error-banner">{error}</div>
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

  return (
    <div className="page">
      <Scoreboard players={state.players} buzz={state.buzz} />

      {state.phase === 'lobby' && (
        <div className="page center-page phase-fade-in">
          <div className="title">Room {state.code}</div>
          <p className="subtitle">Waiting for the host to start the game...</p>
        </div>
      )}

      {state.phase === 'board' && (
        <div className="board-container phase-fade-in">
          {state.round === 2 && <div className="round-banner">Round 2 — Double Jeopardy</div>}
          <Board key={state.round} board={state.board} boardRevealed={state.boardRevealed} />
        </div>
      )}

      {introPlaying && (
        <CategoryIntro categories={state.board.categories} onDone={() => setIntroPlaying(false)} />
      )}

      {state.phase === 'revealing_dd' && (
        <div className="page center-page phase-fade-in">
          <div className="daily-double-banner">Daily Double!</div>
          {state.dailyDoubleReveal?.playerName && (
            <p className="subtitle">{state.dailyDoubleReveal.playerName} is wagering...</p>
          )}
        </div>
      )}

      {(state.phase === 'clue' || state.phase === 'dd_clue') && (
        <div className="clue-overlay phase-fade-in">
          {state.phase === 'dd_clue' && <div className="daily-double-banner">Daily Double</div>}
          <div className="clue-value-tag">${state.currentClue?.value}</div>
          <div className="clue-text">{state.currentClue?.clue}</div>
          {state.phase === 'dd_clue' && state.dailyDoubleActive && (
            <p className="subtitle">
              {state.dailyDoubleActive.playerName} wagered ${state.dailyDoubleActive.wager}
            </p>
          )}
          {state.phase === 'clue' && state.buzz.open && <p className="subtitle">Buzzers are open!</p>}
          {state.phase === 'clue' && state.buzz.lockedPlayerId && (
            <p className="subtitle">
              🔔 {state.players.find((p) => p.id === state.buzz.lockedPlayerId)?.name}
            </p>
          )}
        </div>
      )}

      {(state.phase === 'final_wager' || state.phase === 'final_clue' || state.phase === 'final_reveal') && (
        <div className="page center-page phase-fade-in">
          <div className="title">Final Jeopardy</div>
          <p className="subtitle">{state.final?.category}</p>
          {state.final?.clue && <div className="clue-text">{state.final.clue}</div>}
          {state.phase === 'final_wager' && <p className="subtitle">Players are wagering...</p>}
          {state.phase === 'final_clue' && <p className="subtitle">Players are answering...</p>}
          {state.phase === 'final_reveal' &&
            state.final.reveals.map((r) => (
              <div
                key={r.playerId}
                className={`final-reveal-card${r.correct === true ? ' correct' : r.correct === false ? ' incorrect' : ''}`}
              >
                <h3>{r.name}</h3>
                <p>Wager: ${r.wager}</p>
                <p>Answer: {r.answer}</p>
                <p>{r.correct === true ? '✅ Correct' : r.correct === false ? '❌ Incorrect' : ''}</p>
              </div>
            ))}
        </div>
      )}

      {state.phase === 'game_over' && (
        <div className="page center-page phase-fade-in">
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
