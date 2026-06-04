import { writeFileSync, mkdirSync } from 'fs';
import { Resend } from 'resend';

// Tier assignment by domain
const TIER_MAP = {
  'xinhuanet.com': 1, 'reuters.com': 1, 'apnews.com': 1, 'bbc.com': 1,
  'people.com.cn': 1, 'gov.cn': 1,
  'thepaper.cn': 2, 'nytimes.com': 2, 'wsj.com': 2, 'techcrunch.com': 2,
  'caixin.com': 2, 'theverge.com': 2, 'bloomberg.com': 2,
  '36kr.com': 3, 'theinformation.com': 3, 'arstechnica.com': 3,
};

// Platform default tiers
const PLATFORM_DEFAULTS = {
  thepaper: 2, cls: 2, wallstreetcn: 2, ifeng: 2,
  weibo: 4, zhihu: 4, douyin: 4, bilibili: 4, tieba: 5,
  toutiao: 4, baidu: null,
  hackernews: 4, v2ex: 4,
};

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return null; }
}

function assignTier(sourceName, domain, platform, crossPlatformCount) {
  if (domain) {
    for (const [knownDomain, tier] of Object.entries(TIER_MAP)) {
      if (domain === knownDomain || domain.endsWith('.' + knownDomain)) return tier;
    }
  }
  if (PLATFORM_DEFAULTS[platform] !== undefined) {
    return PLATFORM_DEFAULTS[platform];
  }
  if (crossPlatformCount >= 3) return 3;
  return 4;
}

function normalizeItem(raw) {
  return {
    id: raw.id || Math.random().toString(36).slice(2, 10),
    title: (raw.title || '').slice(0, 80),
    title_en: raw.title_en || null,
    url: raw.url || '',
    sourceName: raw.sourceName || raw.by || '',
    sourceTier: null,
    platform: raw.platform,
    crossPlatformCount: 1,
    crossPlatformUrls: {},
    publishedAt: raw.publishedAt || raw.time
      ? new Date((raw.publishedAt || raw.time * 1000)).toISOString()
      : null,
    summary: raw.summary || null,
    traceChain: [],
  };
}

async function fetchHN(limit = 30) {
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!res.ok) throw new Error(`HN topstories returned ${res.status}`);
    const ids = (await res.json()).slice(0, limit);
    const items = [];
    for (const id of ids) {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!r.ok) continue;
      const d = await r.json();
      if (!d || !d.id) continue;
      items.push(normalizeItem({
        id: `hn-${d.id}`,
        title: d.title,
        url: d.url || `https://news.ycombinator.com/item?id=${d.id}`,
        sourceName: d.by,
        platform: 'hackernews',
        publishedAt: d.time ? new Date(d.time * 1000).toISOString() : null,
        summary: `${d.score} points, ${d.descendants || 0} comments`,
      }));
    }
    return items;
  } catch (e) {
    console.error('HN fetch failed:', e.message);
    return [];
  }
}

async function fetchV2EX() {
  try {
    const res = await fetch('https://www.v2ex.com/api/topics/hot.json');
    if (!res.ok) throw new Error(`V2EX returned ${res.status}`);
    const data = await res.json();
    return data.map(d => normalizeItem({
      id: `v2ex-${d.id}`,
      title: d.title,
      url: d.url,
      sourceName: d.member?.username || 'V2EX',
      platform: 'v2ex',
      publishedAt: new Date(d.created * 1000).toISOString(),
      summary: `${d.replies} replies · ${d.node?.title || ''}`,
    }));
  } catch (e) {
    console.error('V2EX fetch failed:', e.message);
    return [];
  }
}

async function fetchTrendRadar() {
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'search_news',
      arguments: { query: '', date_range: 'today', limit: 50, include_rss: true }
    },
    id: 1
  };
  try {
    const res = await fetch('http://localhost:3333/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    let rawText = null;
    if (json.result?.content && json.result.content.length > 0 && json.result.content[0].text) {
      rawText = json.result.content[0].text;
    }
    const data = rawText
      ? JSON.parse(rawText)
      : (json.result?.data || []);
    const items = Array.isArray(data) ? data : (data.items || data.data || []);
    return items.map(d => normalizeItem({
      id: d.id || d.url || Math.random().toString(36).slice(2, 10),
      title: d.title,
      title_en: d.title_en,
      url: d.url,
      sourceName: d.sourceName || d.source_name || d.publisher || '',
      platform: d.platform || d.source || 'unknown',
      publishedAt: d.publishedAt || d.published_at || d.created_at,
      summary: d.summary || d.description,
    }));
  } catch (e) {
    console.error('TrendRadar fetch failed:', e.message);
    return [];
  }
}

function extractKeywords(title) {
  if (!title) return [];
  const cleaned = title
    .replace(/[，。！？、；：""''「」【】《》（）\s]+/g, ' ')
    .replace(/[^\w一-鿿\s]/g, '')
    .trim()
    .toLowerCase();
  return cleaned.split(/\s+/).filter(w => w.length >= 2);
}

function keywordOverlap(a, b) {
  const ka = new Set(a);
  const kb = new Set(b);
  return [...ka].filter(k => kb.has(k)).length;
}

function deduplicate(items) {
  const keywords = items.map(i => extractKeywords(i.title));
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const cluster = [items[i]];
    used.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      if (keywordOverlap(keywords[i], keywords[j]) >= 3) {
        cluster.push(items[j]);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }

  return clusters.map(cluster => {
    if (cluster.length === 1) return cluster[0];
    cluster.sort((a, b) => (a.sourceTier || 5) - (b.sourceTier || 5));
    const primary = { ...cluster[0] };
    primary.crossPlatformCount = [...new Set(cluster.map(c => c.platform))].length;
    primary.crossPlatformUrls = {};
    cluster.forEach(c => {
      if (c.platform && c.url) primary.crossPlatformUrls[c.platform] = c.url;
    });
    primary.traceChain = cluster.map(c => ({
      url: c.url,
      sourceName: c.sourceName,
      tier: c.sourceTier,
      platform: c.platform,
      publishedAt: c.publishedAt,
      role: c === cluster[0] ? 'primary' : 'related',
    }));
    return primary;
  });
}

async function sendDailyEmail(data) {
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping email.');
    return;
  }
  if (!process.env.RESEND_AUDIENCE_ID) {
    console.log('RESEND_AUDIENCE_ID not set, skipping email.');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const tierColors = { 1: '#0e8044', 2: '#2563eb', 3: '#b45309', 4: '#d94e3d', 5: '#b91c1c' };
  const tierLabels = { 1: 'T1 官方', 2: 'T2 主流媒体', 3: 'T3 行业媒体', 4: 'T4 自媒体', 5: 'T5 未证实' };

  const itemsHtml = data.items.slice(0, 20).map(item => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e8e5e0">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;background:${tierColors[item.sourceTier]}15;color:${tierColors[item.sourceTier]};margin-bottom:6px">
          ${tierLabels[item.sourceTier]} · ${item.sourceName}
        </span>
        <div style="font-size:16px;font-weight:600;color:#1a1a1a;margin-bottom:4px">${item.title}</div>
        <div style="font-size:13px;color:#888">${item.crossPlatformCount} 平台 · ${item.summary || ''}</div>
        ${item.sourceTier >= 4 ? `<div style="font-size:12px;color:${tierColors[item.sourceTier]};margin-top:4px">⚠ 未经权威渠道证实，请交叉验证</div>` : ''}
      </td>
    </tr>
  `).join('');

  const unsubscribeUrl = process.env.UNSUBSCRIBE_URL || '#';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="max-width:600px;margin:0 auto;padding:20px;font-family:Georgia,serif;background:#faf9f7;color:#2c2c2c">
  <h1 style="font-size:24px;color:#1a1a1a;margin-bottom:4px">Daily Briefing</h1>
  <p style="font-size:13px;color:#888;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e8e5e0">
    ${data.date} · ${data.platformCount} 个平台 · ${data.itemCount} 条热点
  </p>
  <table style="width:100%">${itemsHtml}</table>
  <p style="font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #e8e5e0">
    每日 08:00 (北京时间) 自动推送 · <a href="${unsubscribeUrl}" style="color:#888">退订</a>
  </p>
</body></html>`;

  try {
    await resend.emails.send({
      from: 'Daily Briefing <briefing@resend.dev>',
      to: (process.env.EMAIL_RECIPIENTS || 'subscriber@example.com').split(',').map(s => s.trim()).filter(Boolean),
      subject: `Daily Briefing · ${data.date} · ${data.itemCount} 条热点`,
      html,
    });
    console.log('Email sent.');
  } catch (e) {
    console.error('Email send failed:', e.message);
  }
}

async function main() {
  console.log('Starting aggregation...');
  const date = new Date().toISOString().slice(0, 10);

  const [trendRadar, hn, v2ex] = await Promise.all([
    fetchTrendRadar(),
    fetchHN(30),
    fetchV2EX(),
  ]);

  const allItems = [...trendRadar, ...hn, ...v2ex];
  console.log(`Fetched ${allItems.length} items (TrendRadar: ${trendRadar.length}, HN: ${hn.length}, V2EX: ${v2ex.length})`);

  // Assign first-pass tiers
  allItems.forEach(item => {
    const domain = getDomain(item.url);
    item.sourceTier = assignTier(item.sourceName, domain, item.platform, 1);
  });

  // Deduplicate
  const deduped = deduplicate(allItems);
  console.log(`After dedup: ${deduped.length} unique items`);

  // Re-assign tiers with cross-platform data
  deduped.forEach(item => {
    const domain = getDomain(item.url);
    item.sourceTier = assignTier(item.sourceName, domain, item.platform, item.crossPlatformCount);
  });

  // Sort by tier (low = high credibility first), then by recency
  deduped.sort((a, b) => {
    if (a.sourceTier !== b.sourceTier) return (a.sourceTier || 5) - (b.sourceTier || 5);
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });

  // Save
  const output = {
    date,
    generatedAt: new Date().toISOString(),
    platformCount: [...new Set(deduped.map(i => i.platform))].length,
    itemCount: deduped.length,
    tierDistribution: {
      t1: deduped.filter(i => i.sourceTier === 1).length,
      t2: deduped.filter(i => i.sourceTier === 2).length,
      t3: deduped.filter(i => i.sourceTier === 3).length,
      t4: deduped.filter(i => i.sourceTier === 4).length,
      t5: deduped.filter(i => i.sourceTier === 5).length,
    },
    items: deduped,
  };

  mkdirSync('data', { recursive: true });
  writeFileSync(`data/${date}.json`, JSON.stringify(output, null, 2));
  writeFileSync('data/latest.json', JSON.stringify(output, null, 2));
  console.log(`Saved data/${date}.json (${deduped.length} items)`);

  // Send email
  await sendDailyEmail(output);

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });

export { fetchHN, fetchV2EX, fetchTrendRadar, normalizeItem, assignTier, getDomain, PLATFORM_DEFAULTS };
