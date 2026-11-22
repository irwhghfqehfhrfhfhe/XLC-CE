'use strict';
/* ============================================================
 * PCL 风格版本页
 * ------------------------------------------------------------
 * 接管「下载页 → 游戏分类（正式版 / 快照版 / 远古版本 / 全部）」的版本列表：
 *   · 一行一张卡片：方块图标 + 大号版本号 + 类型徽标 + 发布日期 + 已安装状态
 *   · 点卡片原地展开「选择要安装的内容」（PCL 那种内联面板，不再是弹窗）
 *     面板里有加载器卡片、版本名称、加载器版本下拉、进度条与停止按钮
 *   · 置顶最新正式版 / 最新预览版；分页加载（每批 50 条）；隐藏已安装；正序/倒序
 *
 * 复用渲染进程已有的能力（不重复造轮子）：
 *   compatOf / probeOneLoader / mergeLoaderResult —— 加载器兼容性实时探测
 *   mountLoaderVerPicker —— 加载器版本下拉
 *   window.lmc.install / installCancel —— 真实下载安装
 * 原有的 openInstallModal 弹窗一行没动，仍可从旧路径调用。
 * ============================================================ */

const PV = {
  openId: null,         // 当前展开的版本 id（同时只允许展开一个）
  loader: 'Vanilla',
  build: '',
  busy: false,          // 安装进行中
  shown: 50,            // 已渲染条数（分页）
  sort: 'new',          // new = 新→旧；old = 旧→新
  hideInstalled: false,
  lastCat: '', lastQuery: '',
  pct: 0, text: '', bps: 0, bytes: 0, total: 0,
  pinTagOf: {}          // id → 置顶徽标
};
const PV_PAGE = 50;
const PV_GROUPS = {
  release: ['release'],
  snapshot: ['snapshot'],
  old: ['old_beta', 'old_alpha'],
  all: ['release', 'snapshot', 'old_beta', 'old_alpha']
};

/* 建议的 Java 版本（照 Mojang 官方对各版本的最低要求写，仅作提示，不参与启动决策）。
   权威配对（来源：minecraft.wiki / mcreference.com，2026-10 读取）：
   1.16.5- → Java 8｜1.17-1.17.1 → Java 16｜1.18-1.20.4 → Java 17
   ｜1.20.5-1.21.11 → Java 21｜26.1+（日历版本号）→ Java 25 */
function pvJavaHint(id) {
  const s = String(id);
  /* 日历版本号（26.1 / 26.2 / 26.3 …）：Mojang 自 26.1 起弃用 1.x，改用「年份+序号」，全部要求 Java 25 */
  if (/^\d{2}\.\d/.test(s)) return 'Java 25';
  /* 周快照（24w14a / 26w03a …）：按「年份 + 周号」映射回对应时代 */
  const ws = s.match(/^(\d{2})w(\d{2})/);
  if (ws) {
    const yy = +ws[1], ww = +ws[2];
    if (yy >= 26) return 'Java 25';                             /* 26.x 时代 */
    if (yy >= 25) return 'Java 21';                             /* 1.21.x 时代 */
    if (yy >= 24) return ww >= 14 ? 'Java 21' : 'Java 17';      /* 24w14a 是 1.20.5 分界 */
    if (yy >= 22) return 'Java 17';                             /* 1.19 / 1.20 时代 */
    if (yy === 21) return ww >= 19 ? 'Java 16' : 'Java 8';      /* 21w19a 是 1.17 分界 */
    return 'Java 8';                                            /* 20w 及更早 = 1.16 时代 */
  }
  /* 标准 1.x 版本号（含 1.18-pre1 / 1.21.1-rc1 这类 pre/rc） */
  const m = s.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (m) {
    const minor = +m[1];
    const patch = m[2] !== undefined ? +m[2] : 0;
    if (minor <= 16) return 'Java 8';               /* 1.16 及更早 */
    if (minor === 17) return 'Java 16';
    if (minor <= 20) return (minor === 20 && patch >= 5) ? 'Java 21' : 'Java 17';
    return 'Java 21';                               /* 1.21.x */
  }
  /* 远古版本（b1.8.1 / a1.0.4 / rd-132211 …）：旧 Java 编译，现代用 Java 8 即可跑 */
  return 'Java 8';
}
/* 相对时间：PCL 的列表会把发布时间写成「3 天前」这种，比纯日期更直观 */
function pvRel(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d < 1) return '今天';
  if (d < 30) return d + ' 天前';
  if (d < 365) return Math.floor(d / 30) + ' 个月前';
  const y = Math.floor(d / 365);
  return y === 1 ? '去年' : y + ' 年前';
}
function pvInstalledIds() {
  try { return installedIds(); } catch (_) { return new Set((S.installed || []).map(v => v.id)); }
}
function pvBrokenFolders() {
  return new Set((S.broken || []).map(b => b.folder));
}
/* 已安装实例 → 它装的加载器（PCL 会在版本行上标出「这个实例装的是 Fabric」） */
function pvInstalledMap() {
  const m = new Map();
  (S.installed || []).forEach(v => { if (v && v.id) m.set(v.id, v); });
  return m;
}
/* 置顶：最新正式版 / 最新预览版（来自清单的 latest，不自己猜）。
   按当前 tab 给对应的那一条 —— 预览版页顶着个「最新正式版」只会添乱。 */
function pvPins() {
  const out = [];
  if (dlQuery || dlCat === 'old') return out;
  const L = (S.manifest && S.manifest.latest) || {};
  const byId = new Map((S.manifest ? S.manifest.versions : []).map(v => [v.id, v]));
  const want = dlCat === 'snapshot'
    ? [[L.snapshot, '最新预览版', 'pin-preview']]
    : dlCat === 'release'
      ? [[L.release, '最新正式版', '']]
      : [[L.release, '最新正式版', ''], [L.snapshot, '最新预览版', 'pin-preview']];
  want.forEach(([id, tag, cls]) => {
    if (id && byId.has(id) && !out.some(p => p.v.id === id)) out.push({ v: byId.get(id), tag, cls });
  });
  return out;
}
/* 当前筛选后的完整列表（置顶区之外） */
function pvFiltered(pinIds) {
  const all = (S.manifest && S.manifest.versions) || [];
  const cats = PV_GROUPS[dlCat] || ['release'];
  const q = (dlQuery || '').toLowerCase();
  const inst = pvInstalledIds();
  let list = all.filter(v => q ? v.id.toLowerCase().indexOf(q) >= 0 : cats.indexOf(v.type) >= 0);
  if (pinIds && pinIds.size) list = list.filter(v => !pinIds.has(v.id));
  if (PV.hideInstalled) list = list.filter(v => !inst.has(v.id));
  if (PV.sort === 'old') list = list.slice().reverse();
  return list;
}

/* ---------------- 卡片 ---------------- */
function pvCard(v, pinTag, pinCls) {
  const instMap = pvInstalledMap();
  const inst = pvInstalledIds();
  const broken = pvBrokenFolders();
  const installed = inst.has(v.id);
  const residual = !installed && broken.has(v.id);
  const myLoader = installed ? ((instMap.get(v.id) || {}).loader || '') : '';
  const card = el('div', 'pv-card t-' + v.type);
  card.dataset.vid = v.id;

  const head = el('div', 'pv-head');
  head.innerHTML =
    '<img class="pv-ico" src="../assets/blocks/' + ({ release: 'grass', snapshot: 'command', old_beta: 'cobblestone', old_alpha: 'cobblestone' }[v.type] || 'grass') + '.png" alt="" draggable="false">' +
    '<div class="pv-mid">' +
      '<div class="pv-ver">' + esc(v.id) +
        (pinTag ? '<span class="badge ' + (pinCls || '') + '">' + esc(pinTag) + '</span>' : '') +
        (residual ? '<span class="badge residual" title="上次安装未完成留下的不完整目录；再装一次会自动归档并重装">残留</span>' : '') +
      '</div>' +
      '<div class="pv-sub"><span class="pill ' + esc(v.type) + '">' + esc(typeName(v.type)) + '</span>' +
        '<span>' + fmtDate(v.releaseTime || v.time) + '</span>' +
        '<span class="dot"></span><span>' + esc(pvRel(v.releaseTime || v.time)) + '</span>' +
        '<span class="dot"></span><span>建议 ' + esc(pvJavaHint(v.id)) + '</span>' +
        (myLoader && myLoader !== 'Vanilla' ? '<span class="pill loader">' + esc(myLoader) + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="pv-right">' +
      (installed ? '<span class="pv-installed"><svg class="ic sm"><use href="#i-check"/></svg>已安装</span>' : '') +
      '<button class="pv-btn' + (installed ? ' ghost' : '') + '">' + (installed ? '再装一份' : '安装') + '</button>' +
      '<span class="pv-chev"><svg class="ic sm"><use href="#i-chev-d"/></svg></span>' +
    '</div>';
  card.appendChild(head);

  /* 展开 / 收起：整行可点（PCL 也是点条目本体展开，不是只点某个小箭头），
     右侧那个「安装 / 再装一份」按钮同样只是把面板展开 —— 真正的下载动作在面板里再点一次，
     免得手一抖就把几百 MB 下下来了。 */
  head.addEventListener('click', () => {
    if (PV.openId === v.id) { pvClose(); return; }
    pvOpen(card, v);
  });
  gpMark(card);
  return card;
}

/* ---------------- 展开面板 ---------------- */
function pvClose() {
  PV.openId = null;
  PV.busy = false;
  PV.build = '';
  const old = document.querySelector('.pv-card.open .pv-panel');
  if (old) old.remove();
  document.querySelectorAll('.pv-card.open').forEach(c => c.classList.remove('open'));
}
function pvOpen(card, v) {
  const wasOpen = PV.openId === v.id;
  pvClose();
  if (wasOpen) return;
  PV.openId = v.id;
  PV.loader = 'Vanilla';
  PV.build = '';
  PV.pct = 0; PV.text = ''; PV.bps = 0; PV.bytes = 0; PV.total = 0;
  card.classList.add('open');

  const panel = el('div', 'pv-panel');
  panel.innerHTML =
    '<h4>选择要安装的内容</h4>' +
    '<div class="pv-loaders" id="pvLo"></div>' +
    '<div class="pv-opts">' +
      '<label class="field-line"><span>版本名称</span><input type="text" id="pvName" maxlength="60" placeholder="' + esc(v.id) + '"></label>' +
      '<div class="field-line" id="pvBuildLine" style="display:none"></div>' +
    '</div>' +
    '<div id="pvWarn"></div>' +
    '<div class="pv-prog" id="pvProg" style="display:none">' +
      '<div class="prog"><i id="pvBar"></i></div>' +
      '<div class="ptext" id="pvText">准备中…</div>' +
    '</div>' +
    '<div class="pv-foot">' +
      '<button class="pv-btn solid" id="pvGo">开始安装</button>' +
      '<button class="pv-btn ghost" id="pvCancel">收起</button>' +
      '<span class="sp"></span>' +
      '<button class="pv-btn ghost" id="pvWiki">Wiki 更新日志</button>' +
    '</div>';
  card.appendChild(panel);

  const lo = panel.querySelector('#pvLo');
  pvPaintLoaders(lo, v);

  panel.querySelector('#pvCancel').addEventListener('click', (e) => {
    e.stopPropagation();
    if (PV.busy) pvStopInstall();   /* 安装进行中：这个位置变成「停止安装」 */
    else pvClose();
  });
  panel.querySelector('#pvGo').addEventListener('click', (e) => {
    e.stopPropagation();
    if (PV.busy) { pvClose(); toast('安装已在后台进行，可在右下角任务浮窗查看进度'); return; }
    pvStartInstall(v, panel);
  });
  panel.querySelector('#pvWiki').addEventListener('click', (e) => {
    e.stopPropagation();
    try { window.lmc.openUrl('https://minecraft.wiki/w/Java_Edition_' + encodeURIComponent(v.id)); }
    catch (_) { toast('打开浏览器失败', 'warn'); }
  });

  /* 打开就实时探测各加载器是否有构建（先查最可能用的 Fabric，回来立刻重绘） */
  pvProbe(v, () => { if (PV.openId === v.id) pvPaintLoaders(lo, v); }, 'Fabric');
}
/* 加载器卡片（PCL 的横向方块） */
function pvPaintLoaders(box, v) {
  if (!box || !v) return;
  const compat = compatOf(v);
  box.innerHTML = LOADERS.map(L => {
    const c = compat[L] || { ok: true, pending: true };
    const st = c.pending ? '…' : (c.ok ? '✓' : (c.unknown ? '?' : '✗'));
    const cls = c.pending ? '' : (c.ok ? 'ok' : 'bad');
    return '<label class="pv-lo' + (L === PV.loader ? ' sel' : '') + (c.ok || c.pending ? '' : ' bad') + '" data-l="' + esc(L) + '">' +
      '<input type="radio" name="pvloader" value="' + esc(L) + '"' + (L === PV.loader ? ' checked' : '') + '>' +
      '<span class="lo-ic">' + esc(L.slice(0, 2)) + '</span>' +
      '<span class="lo-b"><span class="lo-n">' + esc(L) + '</span><span class="lo-d">' + esc(LOADER_INFO[L] || '') + '</span></span>' +
      '<span class="lo-s ' + cls + '">' + st + '</span>' +
    '</label>';
  }).join('');
  box.querySelectorAll('.pv-lo').forEach(n => {
    n.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const L = n.dataset.l;
      const c = compatOf(v)[L];
      if (c && !c.ok && !c.pending && !c.unknown) { toast(L + ' 与该版本不兼容：' + (c.why || ''), 'warn'); return; }
      PV.loader = L; PV.build = '';
      box.querySelectorAll('.pv-lo').forEach(x => x.classList.remove('sel'));
      n.classList.add('sel');
      pvSyncBuildLine(v);
      pvWarn(v);
      /* 选中的加载器还没结论 → 立刻优先查它 */
      if (c && c.pending) pvProbe(v, () => { if (PV.openId === v.id) pvPaintLoaders(box, v); }, L);
    });
  });
  pvSyncBuildLine(v);
  pvWarn(v);
}
/* 加载器版本下拉（只有能挑版本的加载器才显示） */
function pvSyncBuildLine(v) {
  const host = document.querySelector('#pvBuildLine');
  if (!host || !v) return;
  if (!LOADER_PICKABLE[PV.loader]) { host.style.display = 'none'; host.innerHTML = ''; delete host.dataset.kind; return; }
  const key = PV.loader + '@' + v.id;
  if (host.dataset.kind === key && host.querySelector('.lver-sel')) return;
  host.dataset.kind = key;
  host.style.display = '';
  try {
    mountLoaderVerPicker(host, PV.loader, v.id, { restore: PV.build, onChange: (val) => { PV.build = val; } });
  } catch (e) { host.innerHTML = ''; }
}
function pvWarn(v) {
  const w = document.querySelector('#pvWarn');
  const go = document.querySelector('#pvGo');
  if (!w || !v) return;
  const c = compatOf(v)[PV.loader] || { ok: true };
  if (go) go.disabled = !c.ok || PV.busy;
  if (c.pending) {
    w.innerHTML = '<div class="pv-warn tip">… 正在向 ' + esc(PV.loader) + ' 官方源确认 ' + esc(v.id) + ' 是否有可用构建</div>';
  } else if (!c.ok && c.unknown) {
    w.innerHTML = '<div class="pv-warn">⚠ ' + esc(PV.loader) + ' 构建信息未能确认（' + esc(c.why) + '）—— 这不代表不兼容，可稍后重试</div>';
  } else if (!c.ok) {
    w.innerHTML = '<div class="pv-warn err">✗ ' + esc(PV.loader) + ' 与 ' + esc(v.id) + ' 不兼容：' + esc(c.why) + '</div>';
  } else if (PV.loader === 'OptiFine') {
    w.innerHTML = '<div class="pv-warn tip">ℹ OptiFine 以模组形式安装：会先确保该版本装有 NeoForge 或 Forge，再放进该实例的 mods/ 目录</div>';
  } else if (PV.loader === 'Fabric' || PV.loader === 'Quilt') {
    w.innerHTML = '<div class="pv-warn tip">⚠ ' + esc(PV.loader) + ' 与 OptiFine 存在已知冲突，画质优化建议改用 Sodium / Iris</div>';
  } else {
    w.innerHTML = '';
  }
}
/* 兼容性探测（优先查一个，其余后台补） */
function pvProbe(v, repaint, priority) {
  if (!v || v.type === 'old_beta' || v.type === 'old_alpha') { repaint(); return; }
  const want = priority || PV.loader;
  (async () => {
    try {
      if (LOADER_VERSIONED[want]) {
        const first = await probeOneLoader(want, v.id, true);
        mergeLoaderResult(v.id, want, first);
        repaint();
        const rest = Object.keys(LOADER_VERSIONED).filter(k => k !== want);
        loaderCompatAsync(v, { kinds: rest, force: true, onOne: () => repaint() }).catch(() => {});
        return;
      }
      await loaderCompatAsync(v, { force: true });
      repaint();
    } catch (_) { repaint(); }
  })();
}

/* ---------------- 安装 ---------------- */
async function pvStartInstall(v, panel) {
  if (PV.busy) return;
  const nameEl = document.querySelector('#pvName');
  const sel = document.querySelector('#pvBuildLine .lver-sel');
  const build = sel ? sel.value.trim() : (PV.build || '');
  PV.busy = true;
  const prog = panel.querySelector('#pvProg');
  if (prog) prog.style.display = 'block';
  const go = panel.querySelector('#pvGo');
  if (go) { go.textContent = '转入后台'; go.className = 'pv-btn ghost'; }
  const cancel = panel.querySelector('#pvCancel');
  if (cancel) { cancel.textContent = '停止安装'; cancel.className = 'pv-btn danger'; }
  try {
    const r = await window.lmc.install({
      id: v.id,
      loader: PV.loader,
      customName: nameEl ? nameEl.value.trim() : '',
      reinstall: pvInstalledIds().has(v.id),
      build: build || undefined
    });
    if (!r || !r.started) {
      toast((r && r.reason) || '任务已存在', 'warn');
      PV.busy = false;
      pvClose(); PV.render();
    }
  } catch (e) {
    toast('安装启动失败: ' + (e && e.message), 'error');
    PV.busy = false;
    pvClose(); PV.render();
  }
}
async function pvStopInstall() {
  if (!PV.busy || !PV.openId) return;
  const btn = document.querySelector('#pvCancel');
  if (btn) { btn.disabled = true; btn.textContent = '正在停止…'; }
  try {
    await window.lmc.installCancel({ id: PV.openId, loader: PV.loader });
  } catch (e) { toast('停止失败: ' + e.message, 'error'); }
}
/* 进度渲染（主进程推来的真实字节速率 + 阶段） */
function pvProgPaint() {
  const bar = document.querySelector('#pvBar');
  const txt = document.querySelector('#pvText');
  if (!bar || !txt) return;
  bar.style.width = (PV.pct || 0) + '%';
  let s = PV.text || '准备中…';
  if (PV.pct) s += ' · ' + PV.pct + '%';
  if (PV.bps > 0) {
    s += ' · ↓ ' + (PV.bps >= 1048576 ? (PV.bps / 1048576).toFixed(1) + ' MB/s'
      : PV.bps >= 1024 ? Math.round(PV.bps / 1024) + ' KB/s' : Math.round(PV.bps) + ' B/s');
  }
  if (PV.bps > 4096 && PV.total > 0) {
    const left = PV.total - PV.bytes;
    if (left > 524288) {
      const sec = left / PV.bps;
      s += ' · 预计剩余 ' + (sec < 60 ? Math.max(1, Math.round(sec)) + ' 秒'
        : Math.floor(sec / 60) + ' 分 ' + Math.round(sec % 60) + ' 秒');
    } else if (left > 0) s += ' · 即将完成';
  }
  txt.textContent = s;
}

/* ---------------- 列表渲染 ---------------- */
PV.render = function () {
  const box = document.getElementById('verList');
  if (!box) return;
  if (box.style.display === 'none') return;   /* 当前 tab 是 MOD / 资源包等，不接管 */
  if (!S.manifest) return;
  /* 换分类 / 换了搜索词 → 重置分页与展开态 */
  if (PV.lastCat !== dlCat || PV.lastQuery !== dlQuery) {
    PV.lastCat = dlCat; PV.lastQuery = dlQuery;
    PV.shown = PV_PAGE; pvClose();
  }
  const pins = pvPins();
  const pinIds = new Set(pins.map(p => p.v.id));
  const list = pvFiltered(pinIds);
  const total = list.length + pins.length;
  const bar = document.getElementById('pvBar');
  if (bar) {
    const c = bar.querySelector('.pv-count');
    if (c) c.innerHTML = '共 <b>' + total + '</b> 个版本';
  }

  box.innerHTML = '';
  box.className = 'ver-list pv-list';
  if (pins.length) {
    const wrap = el('div', 'ver-pin');
    wrap.appendChild(el('div', 'ver-pin-head', '置顶 · 当前最新版本'));
    pins.forEach(p => wrap.appendChild(pvCard(p.v, p.tag, p.cls)));
    box.appendChild(wrap);
  }
  if (!list.length && !pins.length) {
    box.appendChild(el('div', 'pv-empty', dlQuery ? '没有匹配「' + dlQuery + '」的版本' : '没有符合条件的版本'));
    return;
  }
  list.slice(0, PV.shown).forEach(v => box.appendChild(pvCard(v)));
  if (list.length > PV.shown) {
    const more = el('div', 'pv-more', '加载更多（还有 ' + (list.length - PV.shown) + ' 个）');
    more.addEventListener('click', () => { PV.shown += PV_PAGE; PV.render(); });
    gpMark(more);
    box.appendChild(more);
  }
  /* 展开态在重绘后要保持（探测结果回来会重绘，不能把用户展开的面板冲掉） */
  if (PV.openId) {
    const keep = PV.openId;
    const v = (S.manifest.versions || []).find(x => x.id === keep) || pins.map(p => p.v).find(x => x.id === keep);
    const card = box.querySelector('.pv-card[data-vid="' + keep.replace(/"/g, '') + '"]');
    PV.openId = null;   /* pvOpen 内部会重新置上，这里先清掉避免它当成「已展开」而收起 */
    if (v && card) pvOpen(card, v);
  }
};

/* ---------------- 筛选栏 ---------------- */
function pvBuildBar() {
  const host = document.getElementById('pvBar');
  if (!host) return;
  host.innerHTML =
    '<span class="pv-count">共 <b>0</b> 个版本</span>' +
    '<span class="sp"></span>' +
    '<div class="pv-seg" id="pvSort">' +
      '<button data-v="new" class="on">最新在前</button>' +
      '<button data-v="old">最旧在前</button>' +
    '</div>' +
    '<label class="pv-chk"><input type="checkbox" id="pvHide">隐藏已安装</label>';
  host.querySelectorAll('#pvSort button').forEach(b => {
    b.addEventListener('click', () => {
      host.querySelectorAll('#pvSort button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      PV.sort = b.dataset.v; PV.shown = PV_PAGE; pvClose(); PV.render();
    });
  });
  const chk = host.querySelector('#pvHide');
  if (chk) chk.addEventListener('change', () => { PV.hideInstalled = chk.checked; PV.shown = PV_PAGE; PV.render(); });
}

/* ---------------- 接管原有版本列表 ---------------- */
/* 旧实现是扁平的 .ver-row 列表 + 安装弹窗；这里换成 PCL 风格卡片 + 内联面板。
   旧的 renderVersionList 保留为 PV.renderFallback，出问题随时可切回。 */
PV.renderFallback = (typeof renderVersionList === 'function') ? renderVersionList : null;
renderVersionList = function () {
  try { PV.render(); }
  catch (e) {
    try { if (PV.renderFallback) PV.renderFallback(); } catch (_) {}
    try { window.lmc.rendererError('pcl-versions: ' + (e && e.stack || e)); } catch (_) {}
  }
};

/* 安装进度 / 结束：更新内联面板，结束后刷新列表（已安装标记要跟着变） */
window.lmc.on('install:progress', (d) => {
  PV.pct = d.percent || 0;
  PV.text = d.text || d.stage || '下载中';
  pvProgPaint();
});
window.lmc.on('install:speed', (d) => {
  PV.bps = d.bps || 0; PV.bytes = d.bytes || 0; PV.total = d.bytesTotal || 0;
  pvProgPaint();
});
window.lmc.on('install:done', (d) => {
  PV.busy = false;
  PV.pct = d && d.ok ? 100 : PV.pct;
  PV.text = d && d.ok ? '✓ 安装完成' : (d && d.cancelled ? '已取消安装' : '✗ 安装失败' + (d && d.error ? '：' + d.error : ''));
  pvProgPaint();
  /* 结束态保留 2.4 秒再收：让用户看清结果，而不是瞬间消失 */
  setTimeout(() => {
    if (PV.openId) pvClose();
    PV.render();
    if (d && d.ok && typeof scanDir === 'function') {
      scanDir().then(() => PV.render()).catch(() => {});
    }
  }, 2400);
});

/* 页面初始化：把筛选栏插到版本列表上方 */
(function pvInit() {
  const list = document.getElementById('verList');
  if (!list) return;
  if (!document.getElementById('pvBar')) {
    const bar = document.createElement('div');
    bar.className = 'pv-bar';
    bar.id = 'pvBar';
    list.parentNode.insertBefore(bar, list);
  }
  pvBuildBar();
  if (S.manifest) PV.render();
})();
