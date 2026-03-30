module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const topics = [];
  const errors = [];

  const browserUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchTimeout(url, opts = {}, ms = 7000) {
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

  // ── Google Trends JSON API (replaces discontinued RSS feed) ─────────────────
  // Returns )]}'  prefix that must be stripped before JSON.parse
  for (const geo of ['SG', 'MY']) {
    try {
      const r = await fetchTimeout(
        `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-480&geo=${geo}&ns=15`,
        { headers: { 'User-Agent': browserUA, 'Accept': 'application/json, text/plain, */*' } }
      );
      if (!r.ok) {
        errors.push(`Google Trends ${geo}: HTTP ${r.status}`);
        continue;
      }
      const raw = await r.text();
      // Strip the ")]}'\n" security prefix Google adds
      const json = JSON.parse(raw.replace(/^\)\]\}',?\n?/, ''));
      const days = json?.default?.trendingSearchesDays || [];
      if (days.length === 0) {
        errors.push(`Google Trends ${geo}: no trending data returned`);
        continue;
      }
      const searches = days[0]?.trendingSearches || [];
      for (const trend of searches) {
        const title = trend?.title?.query;
        if (title) topics.push(title);
      }
    } catch (err) {
      errors.push(`Google Trends ${geo}: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
    }
  }

  // ── Reddit public JSON API ───────────────────────────────────────────────────
  for (const sub of ['singapore', 'malaysia', 'careerguidance']) {
    let got = false;
    // Try hot (always has posts), then top/week as fallback
    for (const path of [`hot.json?limit=5`, `top.json?limit=5&t=week`]) {
      if (got) break;
      try {
        const r = await fetchTimeout(
          `https://www.reddit.com/r/${sub}/${path}`,
          { headers: { 'User-Agent': browserUA, 'Accept': 'application/json' } }
        );
        if (!r.ok) {
          errors.push(`Reddit r/${sub}: HTTP ${r.status}`);
          continue;
        }
        const json = await r.json();
        const posts = json?.data?.children || [];
        for (const post of posts) {
          if (post?.data?.title) topics.push(post.data.title);
        }
        if (posts.length > 0) got = true;
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
