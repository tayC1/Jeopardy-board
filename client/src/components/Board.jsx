import { useEffect, useMemo, useState } from 'react';

function shuffledDelays(count, stepMs) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const delays = new Array(count);
  order.forEach((tileIndex, rank) => {
    delays[tileIndex] = rank * stepMs;
  });
  return delays;
}

export default function Board({ board, onSelectClue, boardRevealed = true }) {
  const [valuesRevealed, setValuesRevealed] = useState(() => boardRevealed);

  useEffect(() => {
    if (boardRevealed) {
      setValuesRevealed(true);
      return;
    }
    const timer = setTimeout(() => setValuesRevealed(true), 500);
    return () => clearTimeout(timer);
    // Intentionally mount-only: the values reveal is a one-time intro beat that
    // shouldn't restart just because boardRevealed flips later in this round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numCategories = board.categories.length;
  const numRows = board.categories[0]?.clues.length || 0;
  const cellCount = numCategories * numRows;

  const valueDelays = useMemo(() => shuffledDelays(cellCount, 35), [cellCount]);
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
        />
      ))}
    </div>
  );
}

function FragmentRow({ board, clueIndex, numCategories, onSelectClue, boardRevealed, valuesRevealed, valueDelays }) {
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
            {valuesRevealed && !clue.answered && (
              <span className="value-flip" style={{ animationDelay: `${valueDelays[tileIndex]}ms` }}>
                ${clue.value}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
