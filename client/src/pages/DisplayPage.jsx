import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket, emitAsync } from '../lib/socket.js';
import Board from '../components/Board.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import PlayQrCode from '../components/PlayQrCode.jsx';
import { useGameSounds, primeAudio } from '../lib/sounds.js';

export default function DisplayPage() {
  const { code } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    document.title = 'Display';
  }, []);

  useGameSounds(state);

  useEffect(() => {
    function onState(s) {
      setState(s);
    }
    function rejoin() {
      emitAsync('display:joinRoom', { code }).catch((err) => setError(err.message));
    }
    socket.on('state:public', onState);
    // Re-announce on every (re)connect, not just on mount — Socket.IO
    // auto-reconnects after a dropped connection, and the new connection
    // needs to be re-attached to this room or the display stops updating.
    socket.on('connect', rejoin);
    rejoin();
    return () => {
      socket.off('state:public', onState);
      socket.off('connect', rejoin);
    };
  }, [code]);

  if (error) {
    return (
      <div className="page center-page display-page">
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page center-page display-page">
        <div className="title">Connecting...</div>
      </div>
    );
  }

  return (
    <div className="page display-page">
      <Scoreboard players={state.players} buzz={state.buzz} />

      {state.phase === 'lobby' && (
        <div className="page center-page phase-fade-in">
          <div className="title">Room {state.code}</div>
          <p className="subtitle">Waiting for the host to start the game...</p>
          <PlayQrCode code={state.code} />
          {!soundEnabled && (
            <button
              className="secondary"
              style={{ marginTop: '1rem' }}
              onClick={() => {
                primeAudio();
                setSoundEnabled(true);
              }}
            >
              🔊 Enable Sound
            </button>
          )}
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
            animateValues={state.round === 1}
          />
        </div>
      )}

      {state.categoryIntroStep !== null && state.categoryIntroStep !== undefined && (
        <div className="category-intro">
          {state.categoryIntroStep % 2 === 0 ? (
            <img key={state.categoryIntroStep} className="category-intro-logo" src="/favicon.svg" alt="" />
          ) : (
            <div key={state.categoryIntroStep} className="category-intro-name">
              {state.board.categories[Math.floor(state.categoryIntroStep / 2)]?.name}
            </div>
          )}
        </div>
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

      {(state.phase === 'final_wager' || state.phase === 'final_clue') && (
        <div className="page center-page phase-fade-in">
          <div className="title">Final Jeopardy</div>
          <p className="subtitle">{state.final?.category}</p>
          {state.final?.clue && <div className="clue-text">{state.final.clue}</div>}
          {state.phase === 'final_wager' && <p className="subtitle">Players are wagering...</p>}
          {state.phase === 'final_clue' && <p className="subtitle">Players are answering...</p>}
        </div>
      )}

      {state.phase === 'final_reveal' && (() => {
        const current = state.final.reveals[state.final.reveals.length - 1];
        return (
          <div key={current?.playerId || 'waiting'} className="page center-page phase-fade-in">
            {current ? (
              <div
                className={`final-reveal-card final-reveal-fullscreen${current.correct === true ? ' correct' : current.correct === false ? ' incorrect' : ''}`}
              >
                <h3>{current.name}</h3>
                <p>Wager: ${current.wager}</p>
                <p>Answer: {current.answer}</p>
                <p>{current.correct === true ? '✅ Correct' : '❌ Incorrect'}</p>
              </div>
            ) : (
              <>
                <div className="title">Final Jeopardy</div>
                <p className="subtitle">{state.final?.category}</p>
              </>
            )}
          </div>
        );
      })()}

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
