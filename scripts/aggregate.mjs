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

// Category keyword matching (checked against title + summary)
const CATEGORY_KEYWORDS = {
  'ai-tech': { label: 'AI/科技', keywords: ['ai', 'artificial intelligence', '人工智能', '大模型', 'llm', 'gpt', 'chatgpt', 'openai', 'claude', 'gemini', 'deepseek', '芯片', '半导体', 'chip', 'gpu', 'nvidia', '英伟达', '量子', 'quantum', '航天', 'spacex', '卫星', 'rocket', '机器人', 'robot', '自动驾驶', '5g', '6g', '华为', 'apple', '苹果', 'google', '谷歌', 'microsoft', '微软', 'meta', 'tesla', '特斯拉', '大语言模型', 'agi', '智能体', 'agent'] },
  'finance': { label: '财经', keywords: ['股市', 'a股', '港股', '美股', '股票', 'stock', '经济', 'economy', 'gdp', '贸易', 'tariff', '关税', '房地产', '房价', '基金', 'fund', '加密货币', 'bitcoin', 'crypto', '比特币', '央行', '利率', 'ipo', '上市', '融资', 'funding', '收购', 'acquisition', '财报', 'earnings'] },
  'world': { label: '国际', keywords: ['美国', '俄罗斯', '乌克兰', '北约', 'nato', '欧盟', '日本', '韩国', '中东', '以色列', '伊朗', '朝鲜', '联合国', 'un', '外交', '白宫', 'trump', 'biden', 'putin', '战争', 'war', '军事'] },
  'sports': { label: '体育', keywords: ['足球', '篮球', 'nba', '世界杯', 'world cup', '奥运会', 'olympics', '欧冠', '英超', '西甲', '法网', '温网', 'f1', '马拉松', '决赛', 'championship'] },
  'entertainment': { label: '娱乐', keywords: ['明星', '电影', '电视剧', '综艺', '音乐', '演唱会', '票房', 'box office', '奥斯卡', 'oscar', 'netflix', 'disney', '迪士尼', '好莱坞', 'hollywood'] },
  'health-science': { label: '健康/科学', keywords: ['疫苗', '疫情', '病毒', '疾病', '研究', 'nature', 'science', '论文', 'paper', '科研', '医学', 'cancer', 'climate', '气候', '环保', 'energy', '能源'] },
  'society': { label: '社会', keywords: ['法律', '法院', '政策', '教育', '高考', '交通', '事故', '灾害', '地震', '火灾', '洪水', '安全', '隐私', 'privacy', '监管', 'regulation'] },
  'gaming': { label: '游戏', keywords: ['游戏', '电竞', '手游', 'steam', 'ps5', 'xbox', '任天堂', 'nintendo', '原神', '王者荣耀', 'lol', 'esport', 'gaming'] },
  'auto': { label: '汽车', keywords: ['电动车', '新能源', 'ev', '比亚迪', 'byd', '理想', '蔚来', 'nio', '小鹏', '小米汽车', '特斯拉', 'cybertruck', '电池', 'battery', '充电', 'charging'] },
};

function classifyCategory(title, summary) {
  const text = ((title || '') + ' ' + (summary || '')).toLowerCase();
  let bestCat = null;
  let bestScore = 0;
  for (const [cat, def] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of def.keywords) {
      if (text.includes(kw)) score += kw.length >= 4 ? 2 : 1;
    }
    if (score > bestScore) { bestScore = score; bestCat = cat; }
  }
  return bestScore > 0
    ? { category: bestCat, categoryLabel: CATEGORY_KEYWORDS[bestCat].label }
    : { category: 'other', categoryLabel: '其他' };
}

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
  const title = (raw.title || '').slice(0, 80);
  const summary = raw.summary || null;
  const { category, categoryLabel } = classifyCategory(title, summary);
  return {
    id: raw.id || Math.random().toString(36).slice(2, 10),
    title,
    title_en: raw.title_en || null,
    url: raw.url || '',
    sourceName: raw.sourceName || raw.by || '',
    sourceTier: null,
    platform: raw.platform,
    category,
    categoryLabel,
    crossPlatformCount: 1,
    crossPlatformUrls: {},
    publishedAt: raw.publishedAt || raw.time
      ? new Date((raw.publishedAt || raw.time * 1000)).toISOString()
      : null,
    summary,
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
    categoryDistribution: deduped.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] || 0) + 1;
      return acc;
    }, {}),
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
