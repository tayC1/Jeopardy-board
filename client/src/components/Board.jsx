import { useMemo } from 'react';
import { getSoundDurationMs } from '../lib/sounds.js';

// Must match .value-flip's animation-duration in index.css — the last tile's
// flip should land right as the board-fill sound finishes, not before or after.
const VALUE_FLIP_ANIM_MS = 450;

function shuffledDelays(count, totalMs, tileAnimMs) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const stepMs = count > 1 ? Math.max(0, totalMs - tileAnimMs) / (count - 1) : 0;
  const delays = new Array(count);
  order.forEach((tileIndex, rank) => {
    delays[tileIndex] = rank * stepMs;
  });
  return delays;
}

export default function Board({
  board,
  onSelectClue,
  boardRevealed = true,
  valuesRevealed = true,
  animateValues = true,
}) {
  const numCategories = board.categories.length;
  const numRows = board.categories[0]?.clues.length || 0;
  const cellCount = numCategories * numRows;

  const valueDelays = useMemo(
    () => shuffledDelays(cellCount, getSoundDurationMs('boardFill'), VALUE_FLIP_ANIM_MS),
    [cellCount]
  );
  const categoryDelays = useMemo(() => board.categories.map((_, i) => i * 70), [board.categories]);

  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: `repeat(${numCategories}, 1fr)`,
        gridTemplateRows: `auto repeat(${numRows}, 1fr)`,
      }}
    >
      {board.categories.map((cat, catIndex) => (
        <div className="category-header" key={cat.name}>
          {boardRevealed ? (
            <span className="reveal-tile" style={{ animationDelay: `${categoryDelays[catIndex]}ms` }}>
              {cat.name}
            </span>
          ) : (
            <img className="category-placeholder-logo" src="/favicon.svg" alt="" />
          )}
        </div>
      ))}
      {board.categories[0]?.clues.map((_, clueIndex) => (
        <FragmentRow
          key={clueIndex}
          board={board}
          clueIndex={clueIndex}
          numCategories={numCategories}
          onSelectClue={onSelectClue}
          boardRevealed={boardRevealed}
          valuesRevealed={valuesRevealed}
          valueDelays={valueDelays}
          animateValues={animateValues}
        />
      ))}
    </div>
  );
}

function FragmentRow({
  board,
  clueIndex,
  numCategories,
  onSelectClue,
  boardRevealed,
  valuesRevealed,
  valueDelays,
  animateValues,
}) {
  return (
    <>
      {board.categories.map((cat, catIndex) => {
        const clue = cat.clues[clueIndex];
        const tileIndex = clueIndex * numCategories + catIndex;
        const clickable = boardRevealed && !clue.answered;
        return (
          <div
            key={cat.name + clueIndex}
            className={`clue-cell${clue.answered ? ' answered' : ''}${clickable ? '' : ' not-clickable'}`}
            onClick={() => clickable && onSelectClue?.(catIndex, clueIndex)}
          >
            {valuesRevealed &&
              !clue.answered &&
              (animateValues ? (
                <span className="value-flip" style={{ animationDelay: `${valueDelays[tileIndex]}ms` }}>
                  ${clue.value}
                </span>
              ) : (
                <span>${clue.value}</span>
              ))}
          </div>
        );
      })}
    </>
  );
}
