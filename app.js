(function() {
  const tierColors = { 1: '#0e8044', 2: '#2563eb', 3: '#b45309', 4: '#d94e3d', 5: '#b91c1c' };
  const tierLabels = { 1: '🟢 T1 · 官方', 2: '🔵 T2 · 主流媒体', 3: '🟡 T3 · 行业媒体', 4: '🟠 T4 · 自媒体', 5: '🔴 T5 · 未证实' };

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escUrl(str) {
    if (!str) return '#';
    var s = String(str);
    if (/^(https?):\/\//i.test(s)) return esc(s);
    return '#';
  }

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
    return month + '月' + day + '日 ' + hour + ':' + min;
  }

  function fmtDateChinese(iso) {
    var d = new Date(iso);
    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + days[d.getDay()];
  }

  function renderTierBadge(tier, sourceName) {
    var color = tierColors[tier] || '#6d6d6d';
    return '<span class="tier-badge" style="background:' + color + '15;color:' + color + '">' +
      esc(tierLabels[tier] || 'T' + tier) + ' · ' + esc(sourceName) + '</span>';
  }

  function renderTraceChain(item) {
    var chain = item.traceChain || [];
    if (chain.length <= 1) {
      return '<div style="font-size:13px;color:#767676">暂无追溯链数据（单一信源）</div>';
    }
    var nodes = chain.map(function(node, i) {
      var color = tierColors[node.tier] || '#6d6d6d';
      return '<div class="trace-node">' +
        '<div class="arrow">' + (i === 0 ? '📡' : '↓') + '</div>' +
        '<div class="info">' +
          '<span class="tier-badge" style="background:' + color + '15;color:' + color + '">T' + esc(String(node.tier)) + '</span> ' +
          '<span class="name">' + esc(node.sourceName || node.platform) + '</span> ' +
          '<span class="time">' + esc(fmtTime(node.publishedAt)) + '</span>' +
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
      : item.crossPlatformCount === 2 ? '2 平台讨论' : '仅 ' + esc(item.platform);

    var crossLinks = '';
    var urls = item.crossPlatformUrls || {};
    var keys = Object.keys(urls);
    for (var i = 0; i < keys.length; i++) {
      crossLinks += ' <a href="' + escUrl(urls[keys[i]]) + '" target="_blank" rel="noopener" style="color:#6d6d6d;font-size:12px;margin-right:8px">' + esc(keys[i]) + '</a>';
    }

    var warning = '';
    if (item.sourceTier >= 4) {
      warning = '<div class="warning">⚠ ' +
        (item.sourceTier === 5 ? '仅有单一 T5 信源，可信度极低，不建议采信。' : 'T4 信源，未经权威渠道证实，请交叉验证。') +
        '</div>';
    }

    var safeId = esc(String(item.id || Math.random())).replace(/\s/g, '_');

    return '<article class="item">' +
      renderTierBadge(item.sourceTier, item.sourceName) +
      '<h3 class="title">' + esc(item.title) + '</h3>' +
      '<div class="meta">' + crossPlatform + ' · ' + esc(fmtTime(item.publishedAt)) + crossLinks + '</div>' +
      (item.summary ? '<p class="summary">' + esc(item.summary) + '</p>' : '') +
      warning +
      '<button class="expand-toggle" data-trace="' + safeId + '" aria-expanded="false">展开追溯 ▼</button>' +
      '<div class="trace" id="trace-' + safeId + '">' + renderTraceChain(item) + '</div>' +
    '</article>';
  }

  // Keyboard-accessible, one-at-a-time trace toggle
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.expand-toggle');
    if (!btn) return;
    var targetId = btn.getAttribute('data-trace');
    var trace = document.getElementById('trace-' + targetId);
    if (!trace) return;

    // Close all other open traces
    var allTraces = document.querySelectorAll('.trace.open');
    var allBtns = document.querySelectorAll('.expand-toggle[aria-expanded="true"]');
    for (var i = 0; i < allTraces.length; i++) {
      if (allTraces[i] !== trace) {
        allTraces[i].classList.remove('open');
      }
    }
    for (var j = 0; j < allBtns.length; j++) {
      if (allBtns[j] !== btn) {
        allBtns[j].setAttribute('aria-expanded', 'false');
        allBtns[j].textContent = '展开追溯 ▼';
      }
    }

    var isOpen = trace.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    btn.textContent = isOpen ? '收起追溯 ▲' : '展开追溯 ▼';
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var btn = e.target.closest('.expand-toggle');
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });

  function renderCompare(data, yesterdayData) {
    if (!yesterdayData) return '';
    var todayIds = {};
    data.items.forEach(function(i) { todayIds[i.id] = true; });
    var yesterdayIds = {};
    yesterdayData.items.forEach(function(i) { yesterdayIds[i.id] = true; });

    var sustained = data.items.filter(function(i) { return yesterdayIds[i.id]; }).slice(0, 3);
    var newcomers = data.items.filter(function(i) { return !yesterdayIds[i.id]; }).slice(0, 3);
    var dropped = yesterdayData.items.filter(function(i) { return !todayIds[i.id]; }).slice(0, 3);

    return '<section class="section">' +
      '<h2 class="section-title">📅 昨日回顾</h2>' +
      '<div class="compare-grid">' +
        '<div class="compare-card"><div class="label">🔥 持续热点</div>' +
          (sustained.length ? sustained.map(function(i) { return '<div class="headline">' + esc(i.title.slice(0, 30)) + '...</div>'; }).join('') : '<div style="font-size:13px;color:#767676">无</div>') +
        '</div>' +
        '<div class="compare-card"><div class="label">🆕 今日新增</div>' +
          (newcomers.length ? newcomers.map(function(i) { return '<div class="headline">' + esc(i.title.slice(0, 30)) + '...</div>'; }).join('') : '<div style="font-size:13px;color:#767676">无</div>') +
        '</div>' +
        '<div class="compare-card"><div class="label">⬇ 昨日退出</div>' +
          (dropped.length ? dropped.map(function(i) { return '<div class="headline">' + esc(i.title.slice(0, 30)) + '...</div>'; }).join('') : '<div style="font-size:13px;color:#767676">无</div>') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderSubscribe() {
    return '<div class="subscribe">' +
      '<label for="email-input" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">邮箱地址</label>' +
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
      // v1: store locally. Production setup requires a serverless function
      // that calls Resend API to add the contact. See README.
      try {
        var subs = JSON.parse(localStorage.getItem('daily-briefing-subscribers') || '[]');
        if (subs.indexOf(email) === -1) {
          subs.push(email);
          localStorage.setItem('daily-briefing-subscribers', JSON.stringify(subs));
        }
        msg.style.color = '#0e8044';
        msg.textContent = '已登记！推送功能需要服务端配置 Resend API 后才生效。详见 README。';
        input.value = '';
      } catch (e) {
        msg.textContent = '登记失败，请稍后重试';
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
          '<p style="font-size:14px;color:#8a8a8a">每日 08:00 (北京时间) 自动更新。</p>' +
          '</div>';
      });
  }

  function render(data, yesterdayData) {
    var app = document.getElementById('app');
    var highCred = data.items.filter(function(i) { return i.sourceTier <= 2; });
    var mediumCred = data.items.filter(function(i) { return i.sourceTier === 3; });
    var lowCred = data.items.filter(function(i) { return i.sourceTier >= 4; });

    var platforms = [];
    data.items.forEach(function(i) {
      if (platforms.indexOf(i.platform) === -1) platforms.push(i.platform);
    });

    var html = '';

    html += '<header class="header">';
    html += '<h1>Daily Briefing · 全网热点信源分析</h1>';
    html += '<div class="date-line">' + esc(fmtDateChinese(data.date)) + ' · ' + platforms.length + ' 个平台 · 更新于 08:00 (北京时间)</div>';
    html += renderSubscribe();
    html += '</header>';

    if (highCred.length) {
      html += '<section class="section">';
      html += '<h2 class="section-title">🟢 高可信度 · ' + highCred.length + ' 条</h2>';
      highCred.forEach(function(item) { html += renderItem(item); });
      html += '</section>';
    }

    if (mediumCred.length) {
      html += '<section class="section">';
      html += '<h2 class="section-title">🟡 行业媒体 · ' + mediumCred.length + ' 条</h2>';
      mediumCred.forEach(function(item) { html += renderItem(item); });
      html += '</section>';
    }

    if (lowCred.length) {
      html += '<section class="section">';
      html += '<h2 class="section-title">🟠 待验证 · ' + lowCred.length + ' 条</h2>';
      lowCred.forEach(function(item) { html += renderItem(item); });
      html += '</section>';
    }

    html += renderCompare(data, yesterdayData);

    app.innerHTML = html;
    bindSubscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
