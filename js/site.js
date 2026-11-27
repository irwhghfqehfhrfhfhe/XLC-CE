/* XLC CE 官网交互：滚动入场动画 + 下载点击反馈 */
(function () {
  'use strict';

  /* 滚动入场动画 */
  var targets = document.querySelectorAll('.feat, .shot, .faq, .sec-head, .dl-card, .dl-req, .cta-in, .bd-big, .bd-copy, .plug-card, .plug-shot');
  targets.forEach(function (el) { el.classList.add('reveal'); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('in'); });
  }

  /* 首屏 Hero 立即入场 */
  requestAnimationFrame(function () {
    document.querySelectorAll('.hero-copy, .hero-shot').forEach(function (el, i) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity .7s ease ' + (i * 0.12) + 's, transform .7s ease ' + (i * 0.12) + 's';
      requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'none'; });
    });
  });

  /* 下载按钮：点击后短暂变为「已开始下载…」并回落 */
  document.querySelectorAll('a[download]').forEach(function (a) {
    a.addEventListener('click', function () {
      var orig = a.innerHTML;
      a.innerHTML = '✓ 已开始下载…';
      a.style.pointerEvents = 'none';
      setTimeout(function () { a.innerHTML = orig; a.style.pointerEvents = ''; }, 3000);
    });
  });

  /* 截图点击放大（网页上的缩略图看不清字，点开看原图） */
  var lb = document.getElementById('lb');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbOpen = function (src, alt) {
      lbImg.src = src; lbImg.alt = alt || '';
      lb.classList.add('on'); lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };
    var lbClose = function () {
      lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true');
      lbImg.removeAttribute('src'); document.body.style.overflow = '';
    };
    document.querySelectorAll('.shot img, .bd-big img, .plug-shot img, .hero-shot img').forEach(function (img) {
      img.addEventListener('click', function () { lbOpen(img.currentSrc || img.src, img.alt); });
    });
    lb.addEventListener('click', lbClose);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lbClose(); });
  }

  /* 版本信息集中管理：从 release.json 读取版本号 / 文件名 / 大小 / 日期，
     页面里所有 data-rel 字段自动填充。以后发新版只需改 release.json。 */
  var rel = window.XLC_RELEASE;
  if (rel && rel.version) {
    var fmt = function (n) {
      if (!n) return '';
      var mb = n / 1048576;
      return mb >= 100 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
    };
    document.querySelectorAll('[data-rel="version"]').forEach(function (el) {
      el.textContent = rel.display || rel.version;
    });
    document.querySelectorAll('[data-rel="download"]').forEach(function (el) {
      if (rel.file) el.href = rel.downloadUrl || ('downloads/' + rel.file);
    });
    document.querySelectorAll('[data-rel="filename"]').forEach(function (el) {
      if (rel.file) el.textContent = rel.file;
    });
    var meta = document.querySelector('[data-rel="meta"]');
    if (meta) {
      meta.textContent = 'Windows 10 / 11 · x64 · 约 ' + fmt(rel.size) + ' · 更新于 ' + (rel.releaseDate || '');
    }
    var sizeEl = document.querySelector('[data-rel="size"]');
    if (sizeEl) sizeEl.textContent = '版本 ' + (rel.display || rel.version) + ' · ' + fmt(rel.size);
    document.querySelectorAll('[data-rel="sizeonly"]').forEach(function (el) {
      if (rel.size) el.textContent = fmt(rel.size);
    });
    document.querySelectorAll('[data-rel="reldate"]').forEach(function (el) {
      if (rel.releaseDate) el.textContent = rel.releaseDate;
    });
  }

  /* 更新日志：release.json 的 history 数组（越靠前越新），页面无需再手改 */
  var logList = document.getElementById('logList');
  if (logList) {
    var esc = function (t) {
      return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };
    var hist = (rel && Array.isArray(rel.history)) ? rel.history.slice() : [];
    /* 同一版本号只保留一条（避免手改 json 时重复），按日期倒序 */
    var seen = {};
    hist = hist.filter(function (h) {
      if (!h || !h.version || seen[h.version]) return false;
      seen[h.version] = 1;
      return true;
    }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

    if (!hist.length) {
      logList.innerHTML = '<p class="log-empty">暂无更新记录</p>';
    } else {
      logList.innerHTML = hist.map(function (h, i) {
        var hl = (h.highlights || []);
        return '<article class="log-item' + (i === 0 ? ' latest' : '') + '">' +
          '<div class="log-head">' +
            '<span class="log-ver">v' + esc(h.version) + '</span>' +
            (i === 0 ? '<span class="pill pill-stable">最新</span>' : '') +
            '<span class="log-date">' + esc(h.date || '') + '</span>' +
          '</div>' +
          (h.notes ? '<p class="log-notes">' + esc(h.notes) + '</p>' : '') +
          (hl.length ? '<ul class="log-hl">' + hl.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        '</article>';
      }).join('');
    }
  }
})();

/* 旧版网站提示：每次打开页面都立刻弹出，不做「本次不再提示」 */
(function () {
  'use strict';
  var URL_OLD = 'https://xlc-ce-launcher.app.workbuddy.host/?sharecode=FTJRRJTHES';
  var mask = null;

  function build() {
    mask = document.createElement('div');
    mask.className = 'oldsite-mask';
    mask.setAttribute('aria-hidden', 'true');
    mask.innerHTML =
      '<div class="oldsite-box" role="dialog" aria-modal="true" aria-label="检测到您在中国大陆">' +
        '<span class="oldsite-x" data-old-close title="关闭">×</span>' +
        '<h3>检测到您在中国大陆</h3>' +
        '<p>检测到您在中国大陆，在中国大陆访问 GitHub 网站可能会不稳定，建议您切换到旧版网站</p>' +
        '<div class="oldsite-acts">' +
          '<a class="btn primary" href="' + URL_OLD + '" target="_blank" rel="noopener">前往旧版网站</a>' +
          '<button type="button" class="btn ghost" data-old-close>留在本站</button>' +
        '</div>' +
        '<p class="oldsite-tip">旧版网站与本页内容一致</p>' +
      '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('[data-old-close]')) close();
    });
  }

  function show() {
    if (!mask) build();
    mask.classList.add('on');
    mask.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!mask) return;
    mask.classList.remove('on');
    mask.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-old-site]');
    if (!a) return;
    e.preventDefault();
    show();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
