module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { market = 'SG', period = '30' } = req.query;

  const token = market === 'MY'
    ? process.env.META_PAGE_TOKEN_MY
    : process.env.META_PAGE_TOKEN_SG;

  const pageId = market === 'MY'
    ? process.env.META_PAGE_ID_MY
    : process.env.META_PAGE_ID_SG;

  if (!token || !pageId) {
    return res.status(400).json({ error: `No credentials configured for market: ${market}` });
  }

  const BASE = 'https://graph.facebook.com/v25.0';
  const days = parseInt(period) || 30;

  async function apiFetch(path) {
    const url = `${BASE}${path}`;
    const r = await fetch(url);
    const json = await r.json();
    if (json.error) throw new Error(json.error.message);
    return json;
  }

  try {
    // ── Facebook Page basics ──────────────────────────────────────────────────
    const pageData = await apiFetch(
      `/${pageId}?fields=id,name,fan_count,followers_count,website&access_token=${token}`
    );

    // ── Facebook Page Insights ────────────────────────────────────────────────
    let fbInsights = {};
    try {
      const metrics = [
        'page_impressions',
        'page_impressions_unique',
        'page_engaged_users',
        'page_post_engagements',
        'page_fans',
        'page_fan_adds',
        'page_fan_removes',
        'page_views_total',
        'page_actions_post_reactions_total'
      ].join(',');

      const insightsData = await apiFetch(
        `/${pageId}/insights?metric=${metrics}&period=day&since=${Math.floor(Date.now() / 1000) - days * 86400}&access_token=${token}`
      );

      // Sum up values for each metric
      if (insightsData.data) {
        for (const metric of insightsData.data) {
          const total = metric.values?.reduce((sum, v) => sum + (typeof v.value === 'number' ? v.value : 0), 0) || 0;
          fbInsights[metric.name] = total;
        }
      }
    } catch (_) {}

    // ── Recent Facebook Posts ─────────────────────────────────────────────────
    let recentPosts = [];
    try {
      const postsData = await apiFetch(
        `/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url&limit=10&access_token=${token}`
      );

      if (postsData.data) {
        for (const post of postsData.data.slice(0, 10)) {
          let postInsights = {};
          try {
            const pi = await apiFetch(
              `/${post.id}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_reactions_by_type_total&access_token=${token}`
            );
            if (pi.data) {
              for (const m of pi.data) {
                const val = m.values?.[0]?.value;
                postInsights[m.name] = typeof val === 'object'
                  ? Object.values(val).reduce((a, b) => a + b, 0)
                  : (val || 0);
              }
            }
          } catch (_) {}

          recentPosts.push({
            id: post.id,
            message: post.message || '(No caption)',
            created_time: post.created_time,
            url: post.permalink_url,
            impressions: postInsights['post_impressions'] || 0,
            reach: postInsights['post_impressions_unique'] || 0,
            engaged_users: postInsights['post_engaged_users'] || 0,
            reactions: postInsights['post_reactions_by_type_total'] || 0
          });
        }
      }
    } catch (_) {}

    // ── Instagram Business Account ────────────────────────────────────────────
    let igData = null;
    let igInsights = {};
    let igPosts = [];

    try {
      const igAccount = await apiFetch(
        `/${pageId}?fields=instagram_business_account&access_token=${token}`
      );
      const igId = igAccount?.instagram_business_account?.id;

      if (igId) {
        // IG profile basics
        igData = await apiFetch(
          `/${igId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url&access_token=${token}`
        );

        // IG account insights
        try {
          const igMetrics = 'impressions,reach,profile_views,follower_count,website_clicks';
          const igIns = await apiFetch(
            `/${igId}/insights?metric=${igMetrics}&period=day&since=${Math.floor(Date.now() / 1000) - days * 86400}&access_token=${token}`
          );
          if (igIns.data) {
            for (const m of igIns.data) {
              igInsights[m.name] = m.values?.reduce((sum, v) => sum + (v.value || 0), 0) || 0;
            }
          }
        } catch (_) {}

        // IG recent posts
        try {
          const igMedia = await apiFetch(
            `/${igId}/media?fields=id,caption,media_type,timestamp,permalink,like_count,comments_count&limit=10&access_token=${token}`
          );

          if (igMedia.data) {
            for (const post of igMedia.data.slice(0, 10)) {
              let postInsights = {};
              try {
                const pi = await apiFetch(
                  `/${post.id}/insights?metric=impressions,reach,engagement,saved&access_token=${token}`
                );
                if (pi.data) {
                  for (const m of pi.data) {
                    postInsights[m.name] = m.values?.[0]?.value || 0;
                  }
                }
              } catch (_) {}

              igPosts.push({
                id: post.id,
                caption: post.caption || '(No caption)',
                media_type: post.media_type,
                timestamp: post.timestamp,
                url: post.permalink,
                likes: post.like_count || 0,
                comments: post.comments_count || 0,
                impressions: postInsights['impressions'] || 0,
                reach: postInsights['reach'] || 0,
                engagement: postInsights['engagement'] || 0,
                saved: postInsights['saved'] || 0
              });
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Sort posts by engagement
    recentPosts.sort((a, b) => b.engaged_users - a.engaged_users);
    igPosts.sort((a, b) => b.engagement - a.engagement);

    return res.status(200).json({
      market,
      period: days,
      facebook: {
        page: {
          id: pageData.id,
          name: pageData.name,
          followers: pageData.followers_count || pageData.fan_count || 0,
          fans: pageData.fan_count || 0
        },
        insights: fbInsights,
        posts: recentPosts
      },
      instagram: igData ? {
        profile: {
          id: igData.id,
          username: igData.username,
          name: igData.name,
          followers: igData.followers_count || 0,
          following: igData.follows_count || 0,
          media_count: igData.media_count || 0
        },
        insights: igInsights,
        posts: igPosts
      } : null,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
