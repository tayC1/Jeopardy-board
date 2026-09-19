import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="page center-page">
      <div className="title">Jeopardy Board</div>
      <div className="subtitle">Host a game, project the board, and buzz in from your phone.</div>
      <div className="row" style={{ marginTop: '1rem' }}>
        <Link to="/host">
          <button>Host a Game</button>
        </Link>
        <Link to="/play">
          <button className="secondary">Join as Player</button>
        </Link>
        <Link to="/editor">
          <button className="secondary">Board Editor</button>
        </Link>
      </div>
    </div>
  );
}
