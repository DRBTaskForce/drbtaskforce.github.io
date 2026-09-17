// Collect a complete, deduplicated search before either job publishes data.
// Stop rather than publish partial rankings if the API fails or loops.
export async function fetchRecentPosts(searchParams, bearerToken) {
  const posts = new Map();
  const users = new Map();
  const cursors = new Set();
  const maxPages = 20; // At most 2,000 results per run; no automatic paid retries.
  let nextToken = null;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams(searchParams);
    if (nextToken) params.set('next_token', nextToken);
    const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`X API HTTP ${res.status}; saved data was not replaced.`);
    const data = await res.json();
    if (!data || typeof data !== 'object' || data.errors?.length ||
        (!Array.isArray(data.data) && !(data.data === undefined && data.meta?.result_count === 0))) {
      throw new Error('X returned an incomplete or malformed search response; saved data was not replaced.');
    }
    for (const post of data.data ?? []) {
      if (!post || typeof post.id !== 'string' || !post.id) {
        throw new Error('X returned a post without an ID; saved data was not replaced.');
      }
      if (typeof post.author_id !== 'string' || !post.author_id ||
          !post.public_metrics || typeof post.public_metrics !== 'object' || Array.isArray(post.public_metrics)) {
        throw new Error('X returned a post without author or metrics data; saved data was not replaced.');
      }
      // Repeated results must not add another contribution to attention totals.
      if (!posts.has(post.id)) posts.set(post.id, post);
    }
    for (const user of data.includes?.users ?? []) users.set(user.id, user);

    nextToken = data.meta?.next_token ?? null;
    if (!nextToken) {
      for (const post of posts.values()) {
        const author = users.get(post.author_id);
        if (!author || typeof author.username !== 'string' || !author.username.trim()) {
          throw new Error('X returned incomplete author details; saved data was not replaced.');
        }
      }
      return { data: [...posts.values()], includes: { users: [...users.values()] } };
    }
    if (typeof nextToken !== 'string' || cursors.has(nextToken)) {
      throw new Error('X repeated an invalid pagination cursor; saved data was not replaced.');
    }
    cursors.add(nextToken);
  }
  throw new Error(`X search exceeded ${maxPages} pages; saved data was not replaced. Review collection limits before retrying.`);
}
