import { useEffect, useRef } from 'react';

const SOUND_FILES = {
  thisIsJeopardy: '/sounds/this-is-jeopardy.mp3',
  boardFill: '/sounds/board-fill.mp3',
  dailyDouble: '/sounds/daily-double.mp3',
  finalJeopardyReveal: '/sounds/final-jeopardy-reveal.mp3',
  finalJeopardyThink: '/sounds/final-jeopardy-think.mp3',
};

const audioCache = {};

function getAudio(key) {
  if (!audioCache[key]) {
    audioCache[key] = new Audio(SOUND_FILES[key]);
  }
  return audioCache[key];
}

function play(key, { loop = false } = {}) {
  const audio = getAudio(key);
  audio.loop = loop;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function stop(key) {
  const audio = audioCache[key];
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

export function primeAudio() {
  Object.keys(SOUND_FILES).forEach((key) => {
    const audio = getAudio(key);
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {});
  });
}

export function useGameSounds(state) {
  const prev = useRef({ phase: null, round: null, valuesRevealed: false });

  useEffect(() => {
    if (!state) return;
    const p = prev.current;

    if (state.phase === 'board' && !state.valuesRevealed && (p.phase !== 'board' || p.round !== state.round)) {
      play('thisIsJeopardy');
    }

    if (state.valuesRevealed && !p.valuesRevealed) {
      play('boardFill');
    }

    if (state.phase === 'revealing_dd' && p.phase !== 'revealing_dd') {
      play('dailyDouble');
    }

    if (state.phase === 'final_wager' && p.phase !== 'final_wager') {
      play('finalJeopardyReveal');
    }

    if (state.phase === 'final_clue' && p.phase !== 'final_clue') {
      play('finalJeopardyThink', { loop: true });
    }
    if (p.phase === 'final_clue' && state.phase !== 'final_clue') {
      stop('finalJeopardyThink');
    }

    prev.current = { phase: state.phase, round: state.round, valuesRevealed: state.valuesRevealed };
  }, [state]);
}
