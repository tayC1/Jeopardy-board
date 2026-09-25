export default function NotTodayOverlay({ onDismiss }) {
  return (
    <div className="not-today-overlay" onClick={onDismiss}>
      <div className="not-today-text">Not Today</div>
      <div className="not-today-hint">(tap to continue)</div>
    </div>
  );
}
