export default function Scoreboard({ players, buzz, youId }) {
  return (
    <div className="scoreboard">
      {players.map((p) => {
        const isBuzzed = buzz?.lockedPlayerId === p.id;
        const isLockedOut = buzz?.lockedOutIds?.includes(p.id);
        const classes = [
          'score-pill',
          p.score > 0 ? 'positive' : p.score < 0 ? 'negative' : '',
          isBuzzed ? 'buzzed' : '',
          isLockedOut ? 'locked-out' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={p.id} className={classes}>
            <div className="name">
              {p.name}
              {p.id === youId ? ' (you)' : ''}
              {!p.connected ? ' ⚠️' : ''}
            </div>
            <div className="score">${p.score}</div>
          </div>
        );
      })}
    </div>
  );
}
