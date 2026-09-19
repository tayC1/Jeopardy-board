import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: true,
});

export function emitAsync(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.ok === false) {
        reject(new Error(response.error || 'Action failed'));
      } else {
        resolve(response);
      }
    });
  });
}
