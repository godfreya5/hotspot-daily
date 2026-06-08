import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Tier assignment by domain
const TIER_MAP = {
  // T1: official / wire services / top journals
  'xinhuanet.com': 1, 'reuters.com': 1, 'apnews.com': 1, 'bbc.com': 1, 'bbc.co.uk': 1,
  'people.com.cn': 1, 'gov.cn': 1, 'npr.org': 1, 'economist.com': 1, 'ft.com': 1,
  'nature.com': 1, 'science.org': 1, 'pnas.org': 1, 'who.int': 1,
  'theguardian.com': 1, 'washingtonpost.com': 1, 'cbsnews.com': 1, 'nbcnews.com': 1,
  // T2: major media / established tech press
  'thepaper.cn': 2, 'nytimes.com': 2, 'wsj.com': 2, 'bloomberg.com': 2,
  'caixin.com': 2, 'techcrunch.com': 2, 'theverge.com': 2, 'arstechnica.com': 2,
  'wired.com': 2, 'engadget.com': 2, 'cnet.com': 2, 'zdnet.com': 2,
  'forbes.com': 2, 'fortune.com': 2, 'axios.com': 2, 'politico.com': 2,
  'theatlantic.com': 2, 'newyorker.com': 2, 'theinformation.com': 2,
  'cnbc.com': 2, 'abcnews.go.com': 2, 'usatoday.com': 2, 'latimes.com': 2,
  'independent.co.uk': 2, 'telegraph.co.uk': 2, 'scmp.com': 2,
  'theregister.com': 2, 'eurekalert.org': 2,
  'wallstreetcn.com': 2, 'cls.cn': 2, 'ifeng.com': 2,
  // T3: industry blogs / niche outlets / aggregators
  '36kr.com': 3, 'medium.com': 3, 'dev.to': 3, 'hackernoon.com': 3,
  'thenextweb.com': 3, 'gizmodo.com': 3, 'techradar.com': 3, 'tomshardware.com': 3,
  'venturebeat.com': 3, 'protocol.com': 3, 'thehackernews.com': 3,
  'bleepingcomputer.com': 3, 'schneier.com': 3, 'stratechery.com': 3,
  // T4: UGC / social media platforms
  'weibo.com': 4, 'zhihu.com': 4, 'douyin.com': 4, 'bilibili.com': 4,
  'tieba.baidu.com': 4, 'toutiao.com': 4,
};

// Category keyword matching (checked against title + summary)
const CATEGORY_KEYWORDS = {
  'ai-tech': { label: 'AI/科技', keywords: ['ai', 'artificial intelligence', '人工智能', '大模型', 'llm', 'gpt', 'chatgpt', 'openai', 'claude', 'gemini', 'deepseek', '芯片', '半导体', 'chip', 'gpu', 'nvidia', '英伟达', '量子', 'quantum', '航天', 'spacex', '卫星', 'rocket', '机器人', 'robot', '自动驾驶', '5g', '6g', '华为', 'apple', '苹果', 'google', '谷歌', 'microsoft', '微软', 'meta', 'tesla', '特斯拉', '大语言模型', 'agi', '智能体', 'agent', '数据', '数据库', '算力', '服务器', '光刻', '存储', '海力士', '黄仁勋', '互联网', '软件', '算法', '编程', '开源', 'github', '程序员', '开发者'] },
  'finance': { label: '财经', keywords: ['股市', 'a股', '港股', '美股', '股票', 'stock', '经济', 'economy', 'gdp', '贸易', 'tariff', '关税', '房地产', '房价', '基金', 'fund', '加密货币', 'bitcoin', 'crypto', '比特币', '央行', '利率', 'ipo', '上市', '融资', 'funding', '收购', 'acquisition', '财报', 'earnings', '加息', '降息', '通胀', '人民币', '美元', '欧元', '日元', '汇率', '债', '银行', '保险', '证券', '涨停', '跌停'] },
  'world': { label: '国际', keywords: ['美国', '俄罗斯', '乌克兰', '北约', 'nato', '欧盟', '日本', '韩国', '中东', '以色列', '伊朗', '朝鲜', '联合国', 'un', '外交', '白宫', 'trump', 'biden', 'putin', '战争', 'war', '军事', '特朗普', '普京', '中方', '外交部', '回应', '制裁', '冲突', '导弹', '海军', '空军', '陆军', '南海', '台海'] },
  'sports': { label: '体育', keywords: ['足球', '篮球', 'nba', '世界杯', 'world cup', '奥运会', 'olympics', '欧冠', '英超', '西甲', '法网', '温网', 'f1', '马拉松', '决赛', 'championship', '联赛', '冠军', '球队', '球员', '进球', '教练'] },
  'entertainment': { label: '娱乐', keywords: ['明星', '电影', '电视剧', '综艺', '音乐', '演唱会', '票房', 'box office', '奥斯卡', 'oscar', 'netflix', 'disney', '迪士尼', '好莱坞', 'hollywood', '演员', '导演', '播出', '上线', '开播'] },
  'health-science': { label: '健康/科学', keywords: ['疫苗', '疫情', '病毒', '疾病', '研究', 'nature', 'science', '论文', 'paper', '科研', '医学', 'cancer', 'climate', '气候', '环保', 'energy', '能源', '医院', '药物', '治疗', '发现', '科学家', '实验', '基因', '细胞', '地震', '海啸', '台风'] },
  'society': { label: '社会', keywords: ['法律', '法院', '政策', '教育', '高考', '交通', '事故', '灾害', '火灾', '洪水', '安全', '隐私', 'privacy', '监管', 'regulation', '警方', '公安', '通报', '调查', '处罚', '整改', '出台', '新规', '公告', '通知', '民生', '养老金', '社保', '就业', '毕业', '大学生', '房价', '楼市', '城管'] },
  'gaming': { label: '游戏', keywords: ['游戏', '电竞', '手游', 'steam', 'ps5', 'xbox', '任天堂', 'nintendo', '原神', '王者荣耀', 'lol', 'esport', 'gaming', '赛季', '皮肤', '新英雄', '副本'] },
  'auto': { label: '汽车', keywords: ['电动车', '新能源', 'ev', '比亚迪', 'byd', '理想', '蔚来', 'nio', '小鹏', '小米汽车', '特斯拉', 'cybertruck', '电池', 'battery', '充电', 'charging', '车型', '交付', '销量'] },
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
  hackernews: null, v2ex: 4,
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
  const pd = PLATFORM_DEFAULTS[platform];
  if (pd !== undefined && pd !== null) {
    return pd;
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
  const baseUrl = process.env.TRENDRADAR_URL || 'http://localhost:3333';
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };

  try {
    // Step 1: initialize MCP session
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          clientInfo: { name: 'hotspot-daily', version: '1.0' },
        },
        id: 1,
      }),
    });
    if (!initRes.ok) {
      console.error(`TrendRadar initialize failed: HTTP ${initRes.status}`);
      return [];
    }
    const sessionId = initRes.headers.get('mcp-session-id');
    if (!sessionId) {
      console.error('TrendRadar: no mcp-session-id header in initialize response');
      return [];
    }
    // Consume SSE body
    await initRes.text();

    // Step 2: send notifications/initialized
    const callHeaders = { ...headers, 'mcp-session-id': sessionId };
    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    // Step 3: call get_latest_news to fetch today's hot news from all platforms
    const callRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: callHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_latest_news',
          arguments: { limit: 200, include_url: true },
        },
        id: 2,
      }),
    });
    const bodyText = await callRes.text();

    // Parse SSE response: "event: message\ndata: {...}\n\n"
    let items = [];
    for (const line of bodyText.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6); // Strip "data: " prefix
      try {
        const parsed = JSON.parse(jsonStr);
        const text = parsed.result?.content?.[0]?.text;
        if (text) {
          const inner = JSON.parse(text);
          if (inner.success && Array.isArray(inner.data)) {
            items = inner.data;
            console.log(`TrendRadar get_latest_news: ${inner.summary?.total || items.length} items from ${inner.summary?.platforms || '?'} platforms`);
          }
        }
      } catch (e) {
        // Skip non-JSON or malformed lines
      }
    }

    if (!items.length) {
      console.error('TrendRadar: no items returned from get_latest_news');
      return [];
    }

    return items.map(d => {
      const item = {
        id: `tr-${d.platform}-${d.rank || 0}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: (d.title || '').slice(0, 120),
        url: d.url || '',
        sourceName: d.platform_name || d.platform || '',
        platform: d.platform || 'unknown',
        publishedAt: d.timestamp ? new Date(d.timestamp + '+08:00').toISOString() : null,
        summary: null,
        sourceTier: null,
        category: null,
        categoryLabel: null,
        crossPlatformCount: 1,
        crossPlatformUrls: {},
        traceChain: [],
      };
      const { category, categoryLabel } = classifyCategory(item.title, item.summary);
      item.category = category;
      item.categoryLabel = categoryLabel;
      return item;
    });
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

  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(resolve(ROOT, `data/${date}.json`), JSON.stringify(output, null, 2));
  writeFileSync(resolve(ROOT, 'data/latest.json'), JSON.stringify(output, null, 2));
  console.log(`Saved data/${date}.json (${deduped.length} items)`);

  // Send email
  await sendDailyEmail(output);

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });

export { fetchHN, fetchV2EX, fetchTrendRadar, normalizeItem, assignTier, getDomain, PLATFORM_DEFAULTS };
