export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export const json = body => ({ method: 'POST', body: JSON.stringify(body) });
