export async function boundedFetch(url, init = {}, timeout = 15_000) {
  // workerd supports manual/follow only. Reject redirects explicitly so tokens,
  // API keys and POST bodies can never be forwarded to a redirected endpoint.
  const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error('Provider redirect rejected.');
  }
  return response;
}

export async function spotifyResponse(response, method = 'GET') {
  // Player writes have no useful response body, including empty 200/202 replies.
  // Parsing those as JSON loses the accepted write and stops the next song.
  if (method !== 'GET' || response.status === 204) {
    await response.body?.cancel();
    return null;
  }
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : null;
}
