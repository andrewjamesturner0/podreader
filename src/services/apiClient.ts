export function getApiHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

export async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.reload();
    throw new Error('Session expired');
  }
  if (res.status === 429) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}
