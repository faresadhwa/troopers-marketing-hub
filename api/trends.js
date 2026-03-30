module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const topics = [];
  const errors = [];

  // Browser-like headers — required to avoid 403/blocking
  const browserUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Fetch with timeout to avoid Vercel 10s function limit
  async function fetchTimeout(url, opts = {}, ms = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      return r;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ── Google Trends RSS (SG + MY) ─────────────────────────────────────────────
  for (const geo of ['SG', 'MY']) {
    try {
      const r = await fetchTimeout(
        `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`,
        { headers: { 'User-Agent': browserUA, 'Accept': 'application/xml,text/xml,*/*' } }
      );
      if (!r.ok) {
        errors.push(`Google Trends ${geo}: HTTP ${r.status}`);
        continue;
      }
      const xml = await r.text();
      if (!xml.includes('<item>')) {
        errors.push(`Google Trends ${geo}: no items in response (may be a consent/error page)`);
        continue;
      }
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items) {
        const m = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        if (m && m[1].trim()) topics.push(m[1].trim());
      }
    } catch (err) {
      errors.push(`Google Trends ${geo}: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    }
  }

  // ── Reddit public JSON API ───────────────────────────────────────────────────
  // Try 'hot' first (always has posts), fall back to 'top?t=week'
  for (const sub of ['singapore', 'malaysia', 'careerguidance']) {
    let got = false;
    for (const url of [
      `https://www.reddit.com/r/${sub}/hot.json?limit=5`,
      `https://www.reddit.com/r/${sub}/top.json?limit=5&t=week`
    ]) {
      if (got) break;
      try {
        const r = await fetchTimeout(url, {
          headers: {
            'User-Agent': browserUA,
            'Accept': 'application/json'
          }
        });
        if (!r.ok) {
          errors.push(`Reddit r/${sub}: HTTP ${r.status}`);
          continue;
        }
        const json = await r.json();
        const posts = json?.data?.children || [];
        if (posts.length > 0) {
          for (const post of posts) {
            if (post?.data?.title) topics.push(post.data.title);
          }
          got = true;
        }
      } catch (err) {
        errors.push(`Reddit r/${sub}: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
      }
    }
  }

  const unique = [...new Set(topics)].filter(t => t && t.length > 3);

  return res.status(200).json({
    topics: unique,
    count: unique.length,
    errors: errors.length > 0 ? errors : undefined
  });
};
