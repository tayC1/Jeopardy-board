import { nanoid } from 'nanoid';

function emptyBuzz() {
  return { open: false, lockedPlayerId: null, lockedOutIds: [], openedAt: null, lockedAt: null };
}

function buildRoundBoard(rawBoard, round) {
  const categories = round === 2 ? rawBoard.round2.categories : rawBoard.categories;
  return {
    title: rawBoard.title,
    categories: categories.map((cat) => ({
      name: cat.name,
      clues: cat.clues.map((clue) => ({ ...clue, answered: false })),
    })),
  };
}

export class Room {
  constructor(code, board) {
    this.code = code;
    this.rawBoard = board;
    this.round = 1;
    this.board = buildRoundBoard(board, 1);
    this.hasRound2 = !!(board.round2 && board.round2.categories && board.round2.categories.length);
    this.phase = 'lobby'; // lobby | board | revealing_dd | clue | dd_clue | final_wager | final_clue | final_reveal | game_over
    this.players = new Map(); // id -> { id, name, score, connected }
    this.currentClue = null; // { catIndex, clueIndex, value, dailyDouble }
    this.buzz = emptyBuzz();
    this.dailyDouble = null; // { playerId, wager }
    this.final = null; // { category, clue, answer, wagers: {}, answers: {}, order: [], revealIndex: -1, results: {} }
    this.hostSocketId = null;
    this.testPlayerId = null;
    this.boardRevealed = false;
    this.valuesRevealed = false;
    this.categoryIntroStep = null; // alternates logo(even)/category(odd): 0=logo, 1=cat0, 2=logo, 3=cat1, ...
    this.buzzTimeoutHandle = null;
    this.lastCorrectPlayerId = null;
  }

  addTestPlayer() {
    if (this.testPlayerId && this.players.has(this.testPlayerId)) {
      return { ok: false, error: 'Test player already added' };
    }
    this.testPlayerId = this.addPlayer('Test Player');
    return { ok: true, playerId: this.testPlayerId };
  }

  removeTestPlayer() {
    if (!this.testPlayerId) return { ok: false, error: 'No test player to remove' };
    this.players.delete(this.testPlayerId);
    this.testPlayerId = null;
    return { ok: true };
  }

  testPlayerBuzz() {
    if (!this.testPlayerId) return { ok: false, error: 'No test player' };
    return this.buzz_(this.testPlayerId);
  }

  addPlayer(name) {
    const id = nanoid(8);
    this.players.set(id, { id, name: name.slice(0, 30) || 'Player', score: 0, connected: true });
    return id;
  }

  reconnectPlayer(id) {
    const player = this.players.get(id);
    if (player) player.connected = true;
    return !!player;
  }

  disconnectPlayer(id) {
    const player = this.players.get(id);
    if (player) player.connected = false;
  }

  allCluesAnswered() {
    return this.board.categories.every((cat) => cat.clues.every((c) => c.answered));
  }

  revealValues() {
    if (this.phase !== 'board') return { ok: false, error: 'Not on the board right now' };
    if (this.valuesRevealed) return { ok: false, error: 'Values already revealed' };
    this.valuesRevealed = true;
    return { ok: true };
  }

  startCategoryIntro() {
    if (this.phase !== 'board') return { ok: false, error: 'Not on the board right now' };
    if (this.boardRevealed) return { ok: false, error: 'Categories already revealed' };
    if (!this.valuesRevealed) return { ok: false, error: 'Reveal the values first' };
    if (this.categoryIntroStep !== null) return { ok: false, error: 'Category intro already in progress' };
    this.categoryIntroStep = 0; // step 0 = logo, before category 0
    return { ok: true };
  }

  advanceCategoryIntro() {
    if (this.categoryIntroStep === null) return { ok: false, error: 'Category intro not started' };
    const totalSteps = this.board.categories.length * 2; // logo+category per category
    if (this.categoryIntroStep < totalSteps - 1) {
      this.categoryIntroStep += 1;
    } else {
      this.categoryIntroStep = null;
      this.boardRevealed = true;
    }
    return { ok: true };
  }

  _clearBuzzTimer() {
    clearTimeout(this.buzzTimeoutHandle);
    this.buzzTimeoutHandle = null;
  }

  selectClue(catIndex, clueIndex) {
    if (this.phase !== 'board') return { ok: false, error: 'Not accepting clue selection right now' };
    if (!this.boardRevealed) return { ok: false, error: 'Reveal the categories first' };
    const cat = this.board.categories[catIndex];
    const clue = cat && cat.clues[clueIndex];
    if (!clue || clue.answered) return { ok: false, error: 'Invalid clue' };

    this.currentClue = { catIndex, clueIndex, value: clue.value, dailyDouble: clue.dailyDouble };
    this._clearBuzzTimer();
    this.buzz = emptyBuzz();

    if (clue.dailyDouble) {
      this.phase = 'revealing_dd';
      this.dailyDouble = { playerId: null, wager: null };
    } else {
      this.phase = 'clue';
    }
    return { ok: true };
  }

  setDailyDoubleWager(playerId, wager) {
    if (this.phase !== 'revealing_dd') return { ok: false, error: 'Not in daily double reveal' };
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Unknown player' };
    const max = Math.max(player.score, 1000);
    const amount = Math.max(0, Math.min(Number(wager) || 0, max));
    this.dailyDouble = { playerId, wager: amount };
    this.phase = 'dd_clue';
    return { ok: true };
  }

  openBuzzers() {
    if (this.phase !== 'clue') return { ok: false, error: 'Buzzers only open during a regular clue' };
    this.buzz.open = true;
    this.buzz.lockedPlayerId = null;
    this.buzz.openedAt = Date.now();
    this.buzz.lockedAt = null;
    return { ok: true };
  }

  buzz_(playerId) {
    if (this.phase !== 'clue' || !this.buzz.open) return { ok: false, error: 'Buzzer is not open' };
    if (this.buzz.lockedOutIds.includes(playerId)) return { ok: false, error: 'You are locked out for this clue' };
    if (this.buzz.lockedPlayerId) return { ok: false, error: 'Someone already buzzed in' };
    this._clearBuzzTimer();
    this.buzz.lockedPlayerId = playerId;
    this.buzz.open = false;
    this.buzz.lockedAt = Date.now();
    return { ok: true };
  }

  judge(correct) {
    if (this.phase === 'dd_clue') {
      const { playerId, wager } = this.dailyDouble;
      const player = this.players.get(playerId);
      if (player) player.score += correct ? wager : -wager;
      if (correct) this.lastCorrectPlayerId = playerId;
      this._markCurrentClueAnswered();
      this.dailyDouble = null;
      this.currentClue = null;
      this.phase = 'board';
      return { ok: true };
    }

    if (this.phase === 'clue') {
      const playerId = this.buzz.lockedPlayerId;
      if (!playerId) return { ok: false, error: 'No one has buzzed in' };
      const player = this.players.get(playerId);
      const value = this.currentClue.value;
      if (player) player.score += correct ? value : -value;

      if (correct) {
        this.lastCorrectPlayerId = playerId;
        this._markCurrentClueAnswered();
        this.currentClue = null;
        this._clearBuzzTimer();
        this.buzz = emptyBuzz();
        this.phase = 'board';
      } else {
        this.buzz.lockedOutIds.push(playerId);
        this.buzz.lockedPlayerId = null;
        this.buzz.lockedAt = null;
        const remaining = [...this.players.values()].filter(
          (p) => p.connected && !this.buzz.lockedOutIds.includes(p.id)
        );
        if (remaining.length === 0) {
          // no one left to answer; host must reveal and move on
          this.buzz.open = false;
        }
      }
      return { ok: true };
    }

    return { ok: false, error: 'Not in a judgeable phase' };
  }

  revealAndSkip() {
    if (this.phase !== 'clue' && this.phase !== 'dd_clue') {
      return { ok: false, error: 'No active clue to skip' };
    }
    this._markCurrentClueAnswered();
    this.currentClue = null;
    this.dailyDouble = null;
    this._clearBuzzTimer();
    this.buzz = emptyBuzz();
    this.phase = 'board';
    return { ok: true };
  }

  _markCurrentClueAnswered() {
    if (!this.currentClue) return;
    const { catIndex, clueIndex } = this.currentClue;
    this.board.categories[catIndex].clues[clueIndex].answered = true;
  }

  startBoardRound() {
    if (this.phase !== 'lobby') return { ok: false, error: 'Game already started' };
    this.phase = 'board';
    this.boardRevealed = false;
    this.valuesRevealed = false;
    this.categoryIntroStep = null;
    return { ok: true };
  }

  startRound2() {
    if (this.phase !== 'board') return { ok: false, error: 'Finish the current round first' };
    if (!this.allCluesAnswered()) return { ok: false, error: 'Finish the board first' };
    if (this.round !== 1) return { ok: false, error: 'Already past Round 1' };
    if (!this.hasRound2) return { ok: false, error: 'This board has no Round 2' };
    this.round = 2;
    this.board = buildRoundBoard(this.rawBoard, 2);
    this.boardRevealed = false;
    this.valuesRevealed = false;
    this.categoryIntroStep = null;
    this.currentClue = null;
    this._clearBuzzTimer();
    this.buzz = emptyBuzz();
    this.dailyDouble = null;
    return { ok: true };
  }

  startFinal() {
    if (this.phase !== 'board') return { ok: false, error: 'Finish the board first' };
    if (!this.allCluesAnswered()) return { ok: false, error: 'Finish the board first' };
    if (this.hasRound2 && this.round === 1) return { ok: false, error: 'Play Round 2 first' };
    const fj = this.rawBoard.finalJeopardy;
    this.final = {
      category: fj.category,
      clue: fj.clue,
      answer: fj.answer,
      wagers: {},
      answers: {},
      order: [],
      revealIndex: -1,
      results: {},
    };
    this.phase = 'final_wager';
    return { ok: true };
  }

  submitFinalWager(playerId, wager) {
    if (this.phase !== 'final_wager') return { ok: false, error: 'Not accepting wagers right now' };
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Unknown player' };
    const max = Math.max(player.score, 0);
    const amount = Math.max(0, Math.min(Number(wager) || 0, max));
    this.final.wagers[playerId] = amount;
    return { ok: true };
  }

  closeFinalWagers() {
    if (this.phase !== 'final_wager') return { ok: false, error: 'Not in wager phase' };
    for (const player of this.players.values()) {
      if (!(player.id in this.final.wagers)) {
        this.final.wagers[player.id] = 0;
      }
    }
    this.phase = 'final_clue';
    return { ok: true };
  }

  submitFinalAnswer(playerId, answer) {
    if (this.phase !== 'final_clue') return { ok: false, error: 'Not accepting answers right now' };
    if (!this.players.has(playerId)) return { ok: false, error: 'Unknown player' };
    this.final.answers[playerId] = String(answer || '').slice(0, 500);
    return { ok: true };
  }

  closeFinalAnswers() {
    if (this.phase !== 'final_clue') return { ok: false, error: 'Not in answer phase' };
    this.final.order = [...this.players.keys()].sort(
      (a, b) => (this.final.wagers[a] || 0) - (this.final.wagers[b] || 0)
    );
    this.final.revealIndex = -1;
    this.phase = 'final_reveal';
    return { ok: true };
  }

  advanceFinalReveal() {
    if (this.phase !== 'final_reveal') return { ok: false, error: 'Not in reveal phase' };
    if (this.final.revealIndex >= 0) {
      const prevId = this.final.order[this.final.revealIndex];
      if (this.final.results[prevId] === undefined) {
        return { ok: false, error: 'Judge the current player first' };
      }
    }
    const nextIndex = this.final.revealIndex + 1;
    if (nextIndex >= this.final.order.length) return { ok: false, error: 'No more players to reveal' };
    this.final.revealIndex = nextIndex;
    return { ok: true };
  }

  judgeFinal(correct) {
    if (this.phase !== 'final_reveal') return { ok: false, error: 'Not in reveal phase' };
    const playerId = this.final.order[this.final.revealIndex];
    if (!playerId) return { ok: false, error: 'No player to judge' };
    if (this.final.results[playerId] !== undefined) return { ok: false, error: 'Already judged' };
    const player = this.players.get(playerId);
    const wager = this.final.wagers[playerId] || 0;
    if (player) player.score += correct ? wager : -wager;
    if (correct) this.lastCorrectPlayerId = playerId;
    this.final.results[playerId] = correct;

    if (this.final.revealIndex === this.final.order.length - 1) {
      this.phase = 'game_over';
    }
    return { ok: true };
  }

  // ---- state views ----

  toHostState() {
    return {
      code: this.code,
      phase: this.phase,
      board: this.board,
      players: [...this.players.values()],
      currentClue: this._hostCurrentClue(),
      buzz: this.buzz,
      dailyDouble: this.dailyDouble,
      final: this.final,
      lastCorrectPlayerId: this.lastCorrectPlayerId,
      testPlayerId: this.testPlayerId,
      boardRevealed: this.boardRevealed,
      valuesRevealed: this.valuesRevealed,
      categoryIntroStep: this.categoryIntroStep,
      round: this.round,
      hasRound2: this.hasRound2,
    };
  }

  _hostCurrentClue() {
    if (!this.currentClue) return null;
    const { catIndex, clueIndex } = this.currentClue;
    const clueData = this.board.categories[catIndex].clues[clueIndex];
    return { ...this.currentClue, catIndex, clueIndex, clue: clueData.clue, answer: clueData.answer };
  }

  toPublicState() {
    const publicBoard = {
      title: this.board.title,
      categories: this.board.categories.map((cat) => ({
        name: cat.name,
        clues: cat.clues.map((c) => ({ value: c.value, answered: c.answered })),
      })),
    };

    let currentClue = null;
    if (this.currentClue && (this.phase === 'clue' || this.phase === 'dd_clue')) {
      const { catIndex, clueIndex } = this.currentClue;
      const clueData = this.board.categories[catIndex].clues[clueIndex];
      currentClue = {
        catIndex,
        clueIndex,
        value: this.currentClue.value,
        dailyDouble: this.currentClue.dailyDouble,
        clue: clueData.clue,
      };
    }

    let dailyDoubleReveal = null;
    if (this.phase === 'revealing_dd') {
      const player = this.dailyDouble?.playerId ? this.players.get(this.dailyDouble.playerId) : null;
      dailyDoubleReveal = {
        catIndex: this.currentClue.catIndex,
        clueIndex: this.currentClue.clueIndex,
        value: this.currentClue.value,
        playerName: player ? player.name : null,
        wager: this.dailyDouble?.wager ?? null,
      };
    }

    let dailyDoubleActive = null;
    if (this.phase === 'dd_clue') {
      const player = this.players.get(this.dailyDouble.playerId);
      dailyDoubleActive = { playerName: player ? player.name : null, wager: this.dailyDouble.wager };
    }

    let final = null;
    if (this.final) {
      final = {
        category: this.final.category,
        clue:
          this.phase === 'final_clue' || this.phase === 'final_reveal' || this.phase === 'game_over'
            ? this.final.clue
            : null,
        revealIndex: this.final.revealIndex,
        order: this.final.order,
        reveals: this.final.order
          .map((id, idx) => (idx <= this.final.revealIndex ? this._finalRevealEntry(id) : null))
          .filter(Boolean),
      };
    }

    return {
      code: this.code,
      phase: this.phase,
      board: publicBoard,
      players: [...this.players.values()],
      currentClue,
      dailyDoubleReveal,
      dailyDoubleActive,
      buzz: this.buzz,
      final,
      boardRevealed: this.boardRevealed,
      valuesRevealed: this.valuesRevealed,
      categoryIntroStep: this.categoryIntroStep,
      round: this.round,
    };
  }

  _finalRevealEntry(playerId) {
    const player = this.players.get(playerId);
    return {
      playerId,
      name: player ? player.name : 'Unknown',
      wager: this.final.wagers[playerId] || 0,
      answer: this.final.answers[playerId] || '',
      correct: this.final.results[playerId],
    };
  }
}
