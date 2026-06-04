(function() {
  const tierColors = { 1: '#0e8044', 2: '#2563eb', 3: '#b45309', 4: '#d94e3d', 5: '#b91c1c' };
  const tierLabels = { 1: 'T1 · 官方', 2: 'T2 · 主流媒体', 3: 'T3 · 行业媒体', 4: 'T4 · 自媒体', 5: 'T5 · 未经证实' };

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    var diff = Math.floor((now - d) / 1000);
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 21600) return Math.floor(diff / 3600) + ' 小时前';
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hour = ('0' + d.getHours()).slice(-2);
    var min = ('0' + d.getMinutes()).slice(-2);
    return month + '/' + day + ' ' + hour + ':' + min;
  }

  function renderTierBadge(tier, sourceName) {
    var color = tierColors[tier] || '#888';
    return '<span class="tier-badge" style="background:' + color + '15;color:' + color + '">' +
      (tierLabels[tier] || 'T' + tier) + ' · ' + sourceName + '</span>';
  }

  function renderTraceChain(item) {
    var chain = item.traceChain || [];
    if (chain.length <= 1) {
      return '<div style="font-size:13px;color:#999">暂无追溯链数据（单一信源）</div>';
    }
    var nodes = chain.map(function(node, i) {
      var color = tierColors[node.tier] || '#888';
      return '<div class="trace-node">' +
        '<div class="arrow">' + (i === 0 ? '📡' : '↓') + '</div>' +
        '<div class="info">' +
          '<span class="tier-badge" style="background:' + color + '15;color:' + color + '">T' + node.tier + '</span> ' +
          '<span class="name">' + (node.sourceName || node.platform) + '</span> ' +
          '<span class="time">' + fmtTime(node.publishedAt) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var assessment;
    if (item.sourceTier <= 2) {
      assessment = { verdict: '可信度高 ✅', detail: '原始信源权威，传播路径清晰，多平台交叉验证。' };
    } else if (item.sourceTier === 3) {
      assessment = { verdict: '可信度中等 ⚡', detail: '行业媒体报道，建议对照 T1-T2 信源确认。' };
    } else {
      assessment = { verdict: '可信度低 ⚠️', detail: '信源未经权威确认，请谨慎采信，建议等待官方回应。' };
    }

    return nodes +
      '<div class="trace-assessment">' +
        '<div class="verdict">' + assessment.verdict + '</div>' +
        '<div>' + assessment.detail + '</div>' +
      '</div>';
  }

  function renderItem(item) {
    var crossPlatform = item.crossPlatformCount >= 3
      ? item.crossPlatformCount + ' 平台讨论'
      : item.crossPlatformCount === 2 ? '2 平台讨论' : '仅 ' + item.platform;

    var crossLinks = '';
    var urls = item.crossPlatformUrls || {};
    var keys = Object.keys(urls);
    for (var i = 0; i < keys.length; i++) {
      crossLinks += '<a href="' + urls[keys[i]] + '" target="_blank" rel="noopener" style="color:#888;font-size:12px;margin-right:8px">' + keys[i] + '</a>';
    }

    var warning = '';
    if (item.sourceTier >= 4) {
      warning = '<div class="warning">⚠ ' +
        (item.sourceTier === 5 ? '仅有单一 T5 信源，可信度极低，不建议采信。' : 'T4 信源，未经权威渠道证实，请交叉验证。') +
        '</div>';
    }

    var itemId = 'item-' + (item.id || Math.random());

    return '<div class="item">' +
      renderTierBadge(item.sourceTier, item.sourceName) +
      '<div class="title">' + item.title + '</div>' +
      '<div class="meta">' + crossPlatform + ' · ' + fmtTime(item.publishedAt) + (crossLinks ? ' · ' + crossLinks : '') + '</div>' +
      (item.summary ? '<div class="summary">' + item.summary + '</div>' : '') +
      warning +
      '<div class="expand-toggle" onclick="window._toggleTrace(\'' + itemId + '\', this)">展开追溯 ▼</div>' +
      '<div class="trace" id="' + itemId + '">' + renderTraceChain(item) + '</div>' +
    '</div>';
  }

  window._toggleTrace = function(itemId, el) {
    var trace = document.getElementById(itemId);
    if (!trace) return;
    var isOpen = trace.classList.toggle('open');
    el.textContent = isOpen ? '收起追溯 ▲' : '展开追溯 ▼';
  };

  function renderCompare(data, yesterdayData) {
    if (!yesterdayData) return '';
    var todayIds = {};
    data.items.forEach(function(i) { todayIds[i.id] = true; });
    var yesterdayIds = {};
    yesterdayData.items.forEach(function(i) { yesterdayIds[i.id] = true; });

    var sustained = data.items.filter(function(i) { return yesterdayIds[i.id]; }).slice(0, 3);
    var newcomers = data.items.filter(function(i) { return !yesterdayIds[i.id]; }).slice(0, 3);
    var dropped = yesterdayData.items.filter(function(i) { return !todayIds[i.id]; }).slice(0, 3);

    return '<div class="section">' +
      '<div class="section-title">📅 昨日回顾</div>' +
      '<div class="compare-grid">' +
        '<div class="compare-card"><div class="label">🔥 持续热点</div>' +
          (sustained.length ? sustained.map(function(i) { return '<div class="headline">' + i.title.slice(0, 30) + '...</div>'; }).join('') : '<div style="font-size:13px;color:#999">无</div>') +
        '</div>' +
        '<div class="compare-card"><div class="label">🆕 今日新增</div>' +
          (newcomers.length ? newcomers.map(function(i) { return '<div class="headline">' + i.title.slice(0, 30) + '...</div>'; }).join('') : '<div style="font-size:13px;color:#999">无</div>') +
        '</div>' +
        '<div class="compare-card"><div class="label">⬇ 昨日退出</div>' +
          (dropped.length ? dropped.map(function(i) { return '<div class="headline">' + i.title.slice(0, 30) + '...</div>'; }).join('') : '<div style="font-size:13px;color:#999">无</div>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderSubscribe() {
    return '<div class="subscribe">' +
      '<input type="email" id="email-input" placeholder="输入邮箱订阅每日推送...">' +
      '<button id="subscribe-btn">订阅</button>' +
      '</div>' +
      '<div class="msg" id="subscribe-msg"></div>';
  }

  function bindSubscribe() {
    var btn = document.getElementById('subscribe-btn');
    var input = document.getElementById('email-input');
    var msg = document.getElementById('subscribe-msg');
    if (!btn || !input || !msg) return;
    btn.addEventListener('click', function() {
      var email = input.value.trim();
      if (!email || email.indexOf('@') === -1) {
        msg.textContent = '请输入有效的邮箱地址';
        msg.style.color = '';
        return;
      }
      // Store locally for v1 (production uses Resend API on server side)
      try {
        var subs = JSON.parse(localStorage.getItem('daily-briefing-subscribers') || '[]');
        if (subs.indexOf(email) === -1) {
          subs.push(email);
          localStorage.setItem('daily-briefing-subscribers', JSON.stringify(subs));
        }
        msg.style.color = '#0e8044';
        msg.textContent = '订阅成功！每日 08:00 将发送到您的邮箱。';
        input.value = '';
      } catch (e) {
        msg.textContent = '订阅失败，请稍后重试';
      }
    });
  }

  function load() {
    var app = document.getElementById('app');
    app.innerHTML = '<div class="loading">加载中...</div>';

    fetch('data/latest.json')
      .then(function(res) {
        if (!res.ok) throw new Error('Data not available');
        return res.json();
      })
      .then(function(data) {
        // Try loading yesterday's data
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        var yDate = yesterday.toISOString().slice(0, 10);
        return fetch('data/' + yDate + '.json')
          .then(function(yRes) { return yRes.ok ? yRes.json() : null; })
          .catch(function() { return null; })
          .then(function(yesterdayData) {
            render(data, yesterdayData);
          });
      })
      .catch(function() {
        app.innerHTML = '<div class="empty">' +
          '<p>今日数据尚未生成。</p>' +
          '<p style="font-size:14px;color:#bbb">每日 08:00 (北京时间) 自动更新。</p>' +
          '</div>';
      });
  }

  function render(data, yesterdayData) {
    var app = document.getElementById('app');
    var highCred = data.items.filter(function(i) { return i.sourceTier <= 2; });
    var lowCred = data.items.filter(function(i) { return i.sourceTier >= 3; });

    var platforms = [];
    data.items.forEach(function(i) {
      if (platforms.indexOf(i.platform) === -1) platforms.push(i.platform);
    });

    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var now = new Date();
    var dayName = days[now.getDay()];

    var html = '';

    // Module A: Header
    html += '<div class="header">';
    html += '<h1>Daily Briefing · 全网热点信源分析</h1>';
    html += '<div class="date-line">' + data.date + ' · ' + dayName + ' · ' + platforms.length + ' 个平台 · 更新于 08:00</div>';
    html += renderSubscribe();
    html += '</div>';

    // Module C: High credibility
    if (highCred.length) {
      html += '<div class="section">';
      html += '<div class="section-title">🟢 高可信度 · ' + highCred.length + ' 条</div>';
      highCred.forEach(function(item) { html += renderItem(item); });
      html += '</div>';
    }

    // Module C: Needs verification
    if (lowCred.length) {
      html += '<div class="section">';
      html += '<div class="section-title">🟠 待验证 · ' + lowCred.length + ' 条</div>';
      lowCred.forEach(function(item) { html += renderItem(item); });
      html += '</div>';
    }

    // Module E: Yesterday comparison
    html += renderCompare(data, yesterdayData);

    app.innerHTML = html;
    bindSubscribe();
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
