export async function getPlayBaseOrigin() {
  const { hostname, protocol, port } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return window.location.origin;
  }
  try {
    const res = await fetch('/api/lan-ip');
    const data = await res.json();
    if (data.ip) {
      return `${protocol}//${data.ip}${port ? `:${port}` : ''}`;
    }
  } catch {
    // fall through to origin below
  }
  return window.location.origin;
}
