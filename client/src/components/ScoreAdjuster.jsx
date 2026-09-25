import { useState } from 'react';

function ScoreAdjusterRow({ player, onAdjust }) {
  const [amount, setAmount] = useState(100);

  function apply(sign) {
    const value = Math.abs(Number(amount)) || 0;
    if (value === 0) return;
    onAdjust(player.id, sign * value);
  }

  return (
    <div className="score-adjuster-row">
      <span className="score-adjuster-name">{player.name}</span>
      <span className="score-adjuster-score">${player.score}</span>
      <button className="secondary" onClick={() => apply(-1)}>
        −
      </button>
      <input
        type="number"
        min="0"
        value={amount}
        onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
      />
      <button className="secondary" onClick={() => apply(1)}>
        +
      </button>
    </div>
  );
}

export default function ScoreAdjuster({ players, onAdjust }) {
  if (players.length === 0) return null;

  return (
    <div className="score-adjuster">
      <div className="subtitle">Adjust Scores</div>
      {players.map((p) => (
        <ScoreAdjusterRow key={p.id} player={p} onAdjust={onAdjust} />
      ))}
    </div>
  );
}
