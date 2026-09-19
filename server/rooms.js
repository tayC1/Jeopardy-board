import { customAlphabet } from 'nanoid';
import { Room } from './gameState.js';

const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4);

const rooms = new Map();

export function createRoom(board) {
  let code;
  do {
    code = genCode();
  } while (rooms.has(code));
  const room = new Room(code, board);
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

export function deleteRoom(code) {
  rooms.delete(code);
}
