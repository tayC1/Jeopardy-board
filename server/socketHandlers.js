import { createRoom, getRoom } from './rooms.js';
import { getBoard } from './boardStore.js';

const BUZZ_AUTO_SKIP_MS = 20000;
// How long we wait after the first buzz-in before locking in a winner, so
// buzzes from higher-latency players have a chance to arrive and be compared
// on estimated press time rather than raw arrival order.
const BUZZ_COLLECT_WINDOW_MS = 200;

function broadcast(io, room) {
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit('state:host', room.toHostState());
  }
  io.to(room.code).emit('state:public', room.toPublicState());
}

function fail(socket, error) {
  socket.emit('action:error', { error });
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.data.role = null;
    socket.data.roomCode = null;
    socket.data.playerId = null;

    // Lets clients estimate their clock offset from the server so buzz-in
    // timestamps can be compared fairly regardless of each player's latency.
    socket.on('clock:sync', (_payload, cb) => cb?.(Date.now()));

    socket.on('host:createRoom', async ({ boardId }, cb) => {
      try {
        const board = await getBoard(boardId);
        const room = createRoom(board);
        room.hostSocketId = socket.id;
        socket.data.role = 'host';
        socket.data.roomCode = room.code;
        socket.join(room.code);
        cb?.({ ok: true, code: room.code });
        broadcast(io, room);
      } catch (err) {
        cb?.({ ok: false, error: 'Could not create room: ' + err.message });
      }
    });

    socket.on('host:rejoinRoom', ({ code }, cb) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: 'Room not found' });
      room.hostSocketId = socket.id;
      socket.data.role = 'host';
      socket.data.roomCode = room.code;
      socket.join(room.code);
      cb?.({ ok: true, code: room.code });
      broadcast(io, room);
    });

    socket.on('display:joinRoom', ({ code }, cb) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: 'Room not found' });
      socket.data.role = 'display';
      socket.data.roomCode = room.code;
      socket.join(room.code);
      cb?.({ ok: true });
      socket.emit('state:public', room.toPublicState());
    });

    socket.on('player:join', ({ code, name, playerId }, cb) => {
      const room = getRoom(code);
      if (!room) return cb?.({ ok: false, error: 'Room not found' });

      let id = playerId;
      if (!id || !room.players.has(id)) {
        id = room.addPlayer(name || 'Player');
      } else {
        room.reconnectPlayer(id);
      }

      socket.data.role = 'player';
      socket.data.roomCode = room.code;
      socket.data.playerId = id;
      socket.join(room.code);
      cb?.({ ok: true, playerId: id, code: room.code });
      broadcast(io, room);
    });

    socket.on('host:adjustScore', ({ playerId, delta }, cb) =>
      withRoom(socket, cb, (room) => room.adjustScore(playerId, delta))
    );

    socket.on('host:addTestPlayer', (_payload, cb) => withRoom(socket, cb, (room) => room.addTestPlayer()));
    socket.on('host:removeTestPlayer', (_payload, cb) => withRoom(socket, cb, (room) => room.removeTestPlayer()));
    socket.on('host:testPlayerBuzz', (_payload, cb) =>
      withRoom(socket, cb, (room) => startBuzzCollectWindow(room, room.testPlayerBuzz()))
    );

    socket.on('host:startBoardRound', (_payload, cb) => withRoom(socket, cb, (room) => room.startBoardRound()));
    socket.on('host:revealValues', (_payload, cb) => withRoom(socket, cb, (room) => room.revealValues()));
    socket.on('host:startCategoryIntro', (_payload, cb) => withRoom(socket, cb, (room) => room.startCategoryIntro()));
    socket.on('host:advanceCategoryIntro', (_payload, cb) => withRoom(socket, cb, (room) => room.advanceCategoryIntro()));
    socket.on('host:selectClue', ({ catIndex, clueIndex }, cb) =>
      withRoom(socket, cb, (room) => room.selectClue(catIndex, clueIndex))
    );
    socket.on('host:dailyDoubleWager', ({ playerId, wager }, cb) =>
      withRoom(socket, cb, (room) => room.setDailyDoubleWager(playerId, wager))
    );
    socket.on('host:openBuzzers', (_payload, cb) =>
      withRoom(socket, cb, (room) => {
        const result = room.openBuzzers();
        if (result.ok) {
          room._clearBuzzTimer();
          room.buzzTimeoutHandle = setTimeout(() => {
            room.buzzTimeoutHandle = null;
            const skipResult = room.revealAndSkip();
            if (skipResult.ok) broadcast(io, room);
          }, BUZZ_AUTO_SKIP_MS);
        }
        return result;
      })
    );
    socket.on('host:judge', ({ correct }, cb) => withRoom(socket, cb, (room) => room.judge(correct)));
    socket.on('host:revealAndSkip', (_payload, cb) => withRoom(socket, cb, (room) => room.revealAndSkip()));
    socket.on('host:startRound2', (_payload, cb) => withRoom(socket, cb, (room) => room.startRound2()));
    socket.on('host:startFinal', (_payload, cb) => withRoom(socket, cb, (room) => room.startFinal()));
    socket.on('host:closeFinalWagers', (_payload, cb) =>
      withRoom(socket, cb, (room) => room.closeFinalWagers())
    );
    socket.on('host:closeFinalAnswers', (_payload, cb) =>
      withRoom(socket, cb, (room) => room.closeFinalAnswers())
    );
    socket.on('host:advanceFinalReveal', (_payload, cb) =>
      withRoom(socket, cb, (room) => room.advanceFinalReveal())
    );
    socket.on('host:judgeFinal', ({ correct }, cb) =>
      withRoom(socket, cb, (room) => room.judgeFinal(correct))
    );

    function startBuzzCollectWindow(room, result) {
      if (result.ok && result.startCollectWindow) {
        room.buzzCollectHandle = setTimeout(() => {
          room.buzzCollectHandle = null;
          const resolved = room.resolveBuzz();
          if (resolved.ok) broadcast(io, room);
        }, BUZZ_COLLECT_WINDOW_MS);
      }
      return result;
    }

    socket.on('player:buzz', ({ clientTime } = {}, cb) =>
      withRoom(socket, cb, (room) => startBuzzCollectWindow(room, room.buzz_(socket.data.playerId, clientTime)))
    );
    socket.on('player:submitFinalWager', ({ wager }, cb) =>
      withRoom(socket, cb, (room) => room.submitFinalWager(socket.data.playerId, wager))
    );
    socket.on('player:submitFinalAnswer', ({ answer }, cb) =>
      withRoom(socket, cb, (room) => room.submitFinalAnswer(socket.data.playerId, answer))
    );

    socket.on('disconnect', () => {
      const room = getRoom(socket.data.roomCode);
      if (!room) return;
      if (socket.data.role === 'player' && socket.data.playerId) {
        room.disconnectPlayer(socket.data.playerId);
        broadcast(io, room);
      }
      if (socket.data.role === 'host' && room.hostSocketId === socket.id) {
        room.hostSocketId = null;
      }
    });

    function withRoom(socket, cb, fn) {
      const room = getRoom(socket.data.roomCode);
      if (!room) return cb?.({ ok: false, error: 'Room not found' });
      const result = fn(room);
      if (!result.ok) {
        cb?.(result);
        fail(socket, result.error);
        return;
      }
      cb?.(result);
      broadcast(io, room);
    }
  });
}
