'use strict';
/* ============================================================
 * 基岩版主题（Minecraft Bedrock 风格）
 * ------------------------------------------------------------
 * 只在「设置 → 个性化 → 界面主题」选中 bedrock 时启用：
 *   · 主页换成仿基岩版主菜单（#page-bedrock，标题图 + 启动游戏 + 好友 / 联机 + 设置，
 *     右下角更衣室 / 切换账户）
 *   · 侧栏在主菜单这一页收起，换左上角「启动器」抽屉；进到其它页面侧栏照常回来
 *   · 所有按钮点击都有音效（assets/sfx/*.wav，可在基岩版设置里关掉或调音量）
 *   · 设置 / 好友 / 切换账户 / 游戏版本 都用基岩版风格的弹层
 *
 * 依赖 renderer.js 里的全局（同一页面按顺序加载，直接按名字用）：
 *   S / $ / esc / toast / gotoPage / startGame / stopGame / selectVersion /
 *   applyPersonalize / applyAccounts / frInvite
 * 由 renderer.js 在主题切换与启动完成时调用 window.bdOnTheme / window.bdBoot。
 * ============================================================ */
(function () {
  const SND_SRC = {
    click: '../assets/sfx/click.wav',
    tick: '../assets/sfx/tick.wav',
    back: '../assets/sfx/back.wav',
    launch: '../assets/sfx/launch.wav'
  };
  const pool = Object.create(null);
  const BD = { kind: '', tab: 'general', play: 'game', prev: '', plug: '' };
  let friendsCache = [];
  /* 社交面板用的在线状态快照（loadSocial 每次刷新都覆盖一份）：
     「⋮ → 邀请联机」要靠它判断对方在不在线，没这份数据就只能盲发。 */
  let socPres = {};
  /* 收到的联机邀请：同一时间只显示一个，其余排队（跟 renderer 的 frInvites 同思路） */
  const INV = { cur: null, queue: [] };

  /* ---------------- 3D 角色（右下角常驻 + 更衣室 / 切换账户弹层） ----------------
   * 用的是账户页同一个渲染器（src/skin3d.js 的 XLC_SKIN3D.mount），但各自独立实例：
   * 右下角一个、弹层里一个，互不干扰。皮肤数据直接取 S.accounts 里的当前账户，
   * 跟账户页是同一份，不存在「两边显示不一样」。
   */
  const SK = { corner: null, big: null, key: '', act: 'default', talk: null, talkOn: false, talkStage: null };
  /* 弹层「借」过去的旧 DOM（陶瓦联机控件 / 添加账户卡片）：关弹层时按原位置放回去。
     借而不是重写，是因为这两块逻辑太长（微软登录 / 外置登录 / 房间码），
     重写一遍必然弄坏功能 —— 功能一行不动，只把外观换成基岩版（见 styles.css 的 .bd-adopt）。 */
  let adopted = [];
  let adoptAnchor = null;

  const cfg = () => (S && S.config) || {};
  const isOn = () => document.body.classList.contains('bedrock-mode');
  const insts = () => (Array.isArray(S.installed) ? S.installed : []);
  const curVer = () => { const s = document.getElementById('selVersion'); return s ? s.value : ''; };
  /* 1.4.15：原版基座**强制隐藏**（用户要求，不留开关）——
     基座是装 Fabric / Forge 时自动补上的那份纯原版，加载器实例的 inheritsFrom 指着它，
     用户真正要启动的永远是加载器那一条。所有「选版本 / 切版本」的列表都过这个过滤器。
     唯一的例外：当前选中的正好是基座（只装了原版）时留着它，否则「当前」那一项会凭空消失。 */
  const isBaseInst = (v) => !!(v && v.isBase);
  const pickInsts = () => {
    const list = insts(), cur = curVer();
    return list.filter(v => !isBaseInst(v) || v.id === cur);
  };
  const playerName = () => {
    const i = document.getElementById('inpName');
    return ((i && i.value) || cfg().username || 'Steve').trim() || 'Steve';
  };

  /* ---------------- 音效 ----------------
   * 用小的音频池：连点同一个按钮时不会互相打断，也最多同时 4 路，不会吵。
   * 音量 / 开关都跟着配置走（uiSound / uiSoundVol），默认 55%。 */
  function sfxVol() {
    const c = cfg();
    if (c.uiSound === false) return 0;
    const v = typeof c.uiSoundVol === 'number' ? c.uiSoundVol : 0.55;
    return Math.max(0, Math.min(1, v));
  }
  function playSfx(kind) {
    const vol = sfxVol();
    if (vol <= 0.001) return false;
    const name = SND_SRC[kind] ? kind : 'tick';
    const list = pool[name] || (pool[name] = []);
    let a = list.find(x => x.paused || x.ended);
    if (!a) {
      if (list.length >= 4) a = list[0];
      else { a = new Audio(SND_SRC[name]); a.preload = 'auto'; list.push(a); }
    }
    try {
      a.currentTime = 0;
      a.volume = vol;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});   /* 被系统策略拦下就静默，不打扰 */
      return true;
    } catch (_) { return false; }
  }

  /* ---------------- 3D 角色的实现 ---------------- */
  const accList = () => (Array.isArray(S.accounts) ? S.accounts : []);
  const accName = () => S.accActive || (S.config && (S.config.activeAccount || S.config.username)) || '';
  const accActive = () => accList().find(a => a.name === accName()) || null;
  const skinURL = (a) => (a && a.skinUrl) || (typeof DEFAULT_SKIN_URL === 'string' ? DEFAULT_SKIN_URL : '../assets/skin-steve.png');
  function loadSkin(url) {
    if (typeof loadSkinImg === 'function') return loadSkinImg(url);
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  }
  function paintStage(st, a) {
    if (!st) return;
    loadSkin(skinURL(a))
      .then(img => st.setImage(img, (a && a.model) || 'classic'))
      .catch(() => {});
  }
  function cornerStage() {
    if (SK.corner) return SK.corner;
    const cv = document.getElementById('bdSkinCv');
    if (!cv || !window.XLC_SKIN3D) return null;
    try {
      SK.corner = window.XLC_SKIN3D.mount(cv, { onDoubleTap: () => tauntToggle(SK.corner) });
      SK.corner.setAction(SK.act);
    } catch (e) { console.warn('基岩版立牌挂载失败：', e && e.message); return null; }
    return SK.corner;
  }
  function bigStage(canvasId) {
    destroyBig();
    const cv = document.getElementById(canvasId);
    if (!cv || !window.XLC_SKIN3D) return null;
    try {
      SK.big = window.XLC_SKIN3D.mount(cv, { onDoubleTap: () => tauntToggle(SK.big) });
      SK.big.setAction(SK.act);
    } catch (e) { SK.big = null; }
    return SK.big;
  }
  function destroyBig() {
    if (SK.talkStage && SK.talkStage === SK.big) stopTaunt();
    if (SK.big) { try { SK.big.destroy(); } catch (_) {} SK.big = null; }
  }
  function markChips() {
    document.querySelectorAll('.bd-chip[data-bdact]').forEach(b => b.classList.toggle('on', b.dataset.bdact === SK.act));
  }
  function setAct(act) {
    SK.act = act || 'default';
    if (SK.act !== 'sit') stopTaunt();          /* 说话只在坐下里有意义 */
    if (SK.corner) SK.corner.setAction(SK.act);
    if (SK.big) SK.big.setAction(SK.act);
    markChips();
  }
  /* 双击角色 = 开口说话（自己转圈 + 一直 duang），再点两下停。
     音频和账户页那首是同一个文件，但对象独立 —— 两边不会互相抢。 */
  function tauntToggle(st) {
    if (!st) return;
    if (SK.talkOn) { stopTaunt(); return; }
    try {
      if (!SK.talk) {
        SK.talk = new Audio('../assets/taunt.m4a');
        SK.talk.preload = 'auto';
        SK.talk.loop = true;
        SK.talk.addEventListener('ended', () => stopTaunt());
      }
      SK.talk.currentTime = 0;
      const p = SK.talk.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
    SK.talkOn = true;
    SK.talkStage = st;
    SK.act = 'sit';
    st.setAction('sit');
    if (st.setTalking) st.setTalking(true);
    if (SK.corner && SK.corner !== st) SK.corner.setAction('sit');
    markChips();
  }
  function stopTaunt() {
    if (SK.talk && !SK.talk.paused) { try { SK.talk.pause(); SK.talk.currentTime = 0; } catch (_) {} }
    if (SK.talkStage && SK.talkStage.setTalking) SK.talkStage.setTalking(false);
    SK.talkOn = false;
    SK.talkStage = null;
  }
  /* 只有账户 / 皮肤变了才重新载图，免得每次 sync 都重画一遍 */
  function refreshSkin(force) {
    const a = accActive();
    const key = (a && a.name || '') + '|' + (a && a.skinUrl || '') + '|' + (a && a.model || '');
    if (!force && key === SK.key) return;
    SK.key = key;
    paintStage(cornerStage(), a);
    paintStage(SK.big, a);
    const nm = document.getElementById('bdModelName');
    if (nm) nm.textContent = (a && a.name) || accName() || 'Steve';
  }

  /* ---------------- 借 DOM（弹层里的旧功能） ---------------- */
  function adoptOne(el, host) {
    if (!el || !host) return;
    if (!adoptAnchor) {
      adoptAnchor = document.createComment('bd-adopt');
      el.parentNode.insertBefore(adoptAnchor, el);
    }
    adopted.push(el);
    host.appendChild(el);
  }
  function unadoptAll() {
    if (!adoptAnchor) { adopted = []; return; }
    const p = adoptAnchor.parentNode;
    /* 按原顺序插回锚点前面 —— 顺序一定对，不管它们原来是不是相邻 */
    adopted.forEach(n => { try { p.insertBefore(n, adoptAnchor); } catch (_) {} });
    try { p.removeChild(adoptAnchor); } catch (_) {}
    adopted = [];
    adoptAnchor = null;
  }


  /* ---------------- 主菜单同步 ---------------- */
  function sync() {
    const play = document.getElementById('bdPlay');
    if (!play) return;
    const list = insts(), cur = curVer();
    const v = list.find(x => x.id === cur);

    const nameEl = document.getElementById('bdVerName');
    if (nameEl) {
      nameEl.textContent = v
        ? (v.id + (v.loader && v.loader !== 'Vanilla' ? ' · ' + v.loader : ''))
        : (list.length ? '选择版本' : '未安装');
      nameEl.title = nameEl.textContent;
    }

    const tx = document.getElementById('bdPlayTx');
    const running = !!S.gameRunning, launching = !!S.launching, stopping = !!S.gameStopping;
    play.classList.toggle('running', running);
    play.disabled = stopping || (launching && !running);
    /* 借进「游戏」页时叫「启动游戏」（跟游戏里那颗按钮一致），平时在主菜单还是「进入游戏」 */
    const inPlay = !!document.querySelector('#bdGameSlot #bdPlay');
    if (tx) tx.textContent = stopping ? '正在关闭…' : running ? '关闭' : launching ? '启动中…' : (inPlay ? '启动游戏' : '进入游戏');
    const use = play.querySelector('use');
    if (use) use.setAttribute('href', running ? '#i-stop' : '#i-play');

    const st = document.getElementById('bdState');
    if (st) st.textContent = stopping ? '正在关闭…' : running ? '游戏运行中' : launching ? '启动中…' : '就绪';
    const pl = document.getElementById('bdPlayer');
    if (pl) pl.textContent = playerName();
    const fv = document.getElementById('bdVerFoot');
    if (fv) fv.textContent = cfg().appVersion || '—';

    const tip = document.getElementById('bdTip');
    if (tip) {
      if (!list.length) tip.innerHTML = '还没有安装任何版本 —— 点 <b>下载</b> 装一个';
      else if (running) tip.innerHTML = '<b>' + esc(cur) + '</b> 正在运行 · 到「游戏」里可以关闭';
      else tip.innerHTML = '';
    }
    const vp = document.getElementById('bdVerPanel');
    if (vp && vp.classList.contains('on')) renderVers();
    /* 1.4.14：左下角当前实例角标跟着最新选择走 */
    paintInst();
    /* 「游戏」弹层里的版本下拉：跟着当前实例走 */
    const gsel = document.getElementById('bdGameVer');
    if (gsel && gsel.options.length && cur) gsel.value = cur;
    refreshSkin();
  }

  /* ---------------- 版本下拉（启动游戏右侧） ---------------- */
  function renderVers() {
    const p = document.getElementById('bdVerPanel');
    if (!p) return;
    const list = pickInsts(), cur = curVer();
    if (!list.length) {
      p.innerHTML = '<div class="bd-vempty">尚未安装任何版本</div>' +
        '<div class="bd-vmanage" data-nav="download">去下载页安装一个 →</div>';
      return;
    }
    p.innerHTML = list.map(v =>
      '<div class="bd-vrow' + (v.id === cur ? ' cur' : '') + '" data-ver="' + esc(v.id) + '">' +
        '<span class="bd-vname">' + esc(v.id) + '</span>' +
        (v.loader && v.loader !== 'Vanilla' ? '<span class="bd-vtag">' + esc(v.loader) + '</span>' : '') +
        (isBaseInst(v) ? '<span class="bd-vtag base">原版</span>' : '') +
      '</div>').join('') +
      '<div class="bd-vmanage" data-nav="instances">管理实例（启动 / 重命名 / 删除）→</div>';
  }
  /* 1.4.0 起版本下拉搬进「游戏」弹层，主页上不再有 #bdVerPanel —— 这几个函数都做空保护 */
  function openVers() {
    const p = document.getElementById('bdVerPanel');
    if (!p) return;
    renderVers(); p.classList.add('on');
  }
  function closeVers() {
    const p = document.getElementById('bdVerPanel');
    if (p) p.classList.remove('on');
  }
  function toggleVers() {
    const p = document.getElementById('bdVerPanel');
    if (!p) return;
    if (p.classList.contains('on')) { p.classList.remove('on'); playSfx('back'); return; }
    openVers();
  }

  /* ---------------- 弹层骨架 ---------------- */
  function sheetHTML(head, body, foot) {
    return '<div class="bd-sheet-head">' +
        '<span class="bd-ttl">' + head.ttl + '</span>' +
        (head.sub ? '<span class="bd-sub">' + head.sub + '</span>' : '') +
        '<button type="button" class="bd-btn bd-x" data-close>关闭</button>' +
      '</div>' +
      '<div class="bd-sheet-body">' + body + '</div>' +
      '<div class="bd-sheet-foot">' + foot + '</div>';
  }
  /* 满屏单页面板（1.4.13）：联机 / 切换账户 / 更衣室都用这一套骨架 ——
     跟设置页同一条浅灰标题栏（返回箭头 + 居中标题 + 右侧小字）、同一块半透明石块面板，
     只是没有左边那排分组导航。sheet 的 className 要是 'bd-sheet bd-set'，
     .bd-set 那条规则会把面板从「中间 940×680」摊成整屏。 */
  function paneShell(o) {
    return '<div class="bd-set-top">' +
        '<button type="button" class="bd-set-back" data-close data-sfx="back" title="返回（Esc）">' +
          '<svg class="ic"><use href="#i-chevron-left"/></svg></button>' +
        '<div class="bd-ttl">' + o.ttl + '</div>' +
        '<div class="bd-set-tag">' + (o.tag || '基岩版界面') + '</div>' +
      '</div>' +
      '<div class="bd-set-body"><div class="bd-panes">' +
        '<div class="bd-pane on' + (o.cls ? ' ' + o.cls : '') + '">' +
          '<div class="bd-set-hd"><h3>' + o.head + '</h3><p>' + o.sub + '</p></div>' +
          o.body +
        '</div>' +
      '</div></div>' +
      '<div class="bd-sheet-foot">' + (o.left ? '<span class="bd-left">' + o.left + '</span>' : '') + o.foot + '</div>';
  }
  const seg = (key, cur, opts) => '<div class="bd-seg">' + opts.map(o =>
    '<button type="button" class="bd-segbtn' + (String(cur) === String(o[0]) ? ' on' : '') + '" data-set="' + key + '" data-val="' + o[0] + '">' + o[1] + '</button>'
  ).join('') + '</div>';
  const optRow = (name, desc, ctl) =>
    '<div class="bd-opt"><div class="bd-opt-main"><div class="bd-opt-name">' + name + '</div>' +
    (desc ? '<div class="bd-opt-desc">' + desc + '</div>' : '') + '</div>' +
    '<div class="bd-opt-ctl">' + ctl + '</div></div>';

  /* ---------------- 设置弹层 ----------------
     1.4.5 起「功能」页签整个移除（用户要求）：它原来只是把启动器每一页做个入口网格，
     主菜单 / 关于 / 侧栏已经够了，留着反而多一层。
     1.4.6 起「诊断」单独成页签（原来只是「关于」里的一颗按钮）。 */
  const TABS = [
    ['general', '通用'],
    ['game', '游戏'],
    ['look', '界面'],
    ['sound', '音效'],
    ['diag', '诊断'],
    ['about', '关于']
  ];

  /* 左侧导航（1.4.9）：照基岩版设置界面 —— 分组小标题 + 每项一个图标，
     右边是这一页的具体选项。分组只影响显示，页签顺序仍然由 TABS 决定。 */
  const NAV = [
    ['grp', '启动器'],
    ['tab', 'general', '通用', 'i-settings'],
    ['tab', 'game', '游戏', 'i-gamepad'],
    ['grp', '外观与声音'],
    ['tab', 'look', '界面', 'i-palette'],
    ['tab', 'sound', '音效', 'i-volume'],
    ['grp', '维护'],
    ['tab', 'diag', '诊断', 'i-pulse'],
    ['tab', 'about', '关于', 'i-info']
  ];
  /* 右侧每页顶端的大标题 + 一句说明（游戏里「可访问性 / 适合所有人」那个位置） */
  const PHEAD = {
    general: ['通用', '启动器的日常行为：玩家名、启动后的窗口、进游戏的语言'],
    game: ['游戏', '默认实例、内存分配与版本隔离'],
    look: ['界面', '当前外观，以及每次打开启动器先看到哪一页'],
    sound: ['音效', '按钮点击声与音量，不影响游戏里的声音'],
    diag: ['诊断', '游戏起不来、下载失败时，先看这里'],
    about: ['关于', '版本号、检查更新、下载页入口']
  };
  const paneHead = (k) => '<div class="bd-set-hd"><h3>' + PHEAD[k][0] + '</h3><p>' + PHEAD[k][1] + '</p></div>';

  function paneGeneral() {
    const c = cfg();
    return optRow('玩家名', '离线模式下进游戏用的名字（和启动器主页的玩家名同一个）',
        '<input class="bd-inp" id="bdName" maxlength="16" value="' + esc(c.username || playerName()) + '" spellcheck="false">') +
      optRow('启动游戏后', '点启动后启动器窗口怎么处理',
        seg('launcherVisibility', c.launcherVisibility || 'keep', [['keep', '保持'], ['min', '最小化'], ['hide', '隐藏']])) +
      optRow('强制简体中文', '启动前把游戏语言改成简体中文，进游戏不用再翻设置',
        seg('forceChinese', c.forceChinese === false ? '0' : '1', [['1', '开'], ['0', '关']]));
  }
  function paneGame() {
    const c = cfg();
    const list = pickInsts();
    const opts = ['<option value="">跟随上次选择</option>'].concat(list.map(v =>
      '<option value="' + esc(v.id) + '"' + (c.defaultVersion === v.id ? ' selected' : '') + '>' + esc(v.id) + '</option>'));
    const mem = typeof c.mem === 'number' ? c.mem : 4;
    return optRow('默认启动实例', list.length ? '启动器启动时默认选中的实例' : '还没有安装实例',
        '<select class="bd-sel" id="bdDefVer">' + opts.join('') + '</select>') +
      optRow('内存分配', '给游戏的最大堆内存（智能分配开启时以它为准）',
        '<input type="range" class="bd-range" id="bdMem" min="1" max="32" step="1" value="' + mem + '">' +
        '<span class="bd-range-val" id="bdMemVal">' + mem + ' GB</span>') +
      optRow('智能内存分配', '按实例模组数量和当前可用内存自动给，比手动填省心',
        seg('memAuto', c.memAuto === false ? '0' : '1', [['1', '开'], ['0', '关']])) +
      optRow('版本隔离', '每个实例单独的 mods / saves，互不干扰',
        seg('forceIsolate', c.forceIsolate || 'auto', [['auto', '自动'], ['on', '强制开'], ['off', '关']]));
  }
  function paneLook() {
    const c = cfg();
    const startOpts = [['home', '启动器主页'], ['bedrock', '基岩版主菜单'], ['download', '下载'], ['instances', '实例管理'],
      ['account', '账户 / 更衣室'], ['friends', '好友'], ['settings', '启动器设置']].map(o =>
      '<option value="' + o[0] + '"' + ((c.startPage || 'home') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>');
    /* 这一页**故意没有**主题选择器（1.4.4）：
       以前这里摆着「深色 / 浅色 / 基岩版」，手滑点一下就弹出基岩版、掉回普通启动器，
       看着像点了「退出基岩版」。现在只显示当前外观，要换回去统一走
       「启动器设置 → 实验性功能 → 关闭基岩版主题」——那是唯一出口。 */
    return optRow('当前外观', '基岩版主菜单。要换回深色 / 浅色，去「启动器设置 → 实验性功能 → 关闭基岩版主题」',
        '<span class="bd-tag cur">基岩版</span>') +
      optRow('主菜单背景', '「跟随时间」按本机时钟自动换：白天 / 黄昏 / 夜晚，下载页、诊断页一起变',
        seg('bdSky', c.bdSky || 'auto', [['auto', '跟随时间'], ['day', '白天'], ['dusk', '黄昏'], ['night', '夜晚']])) +
      optRow('自定义控件', '主菜单上的标题、四颗按钮、社交、3D 角色…都能拖到任意位置，拖右下角小方块改大小（只影响基岩版主菜单）',
        '<button type="button" class="bd-btn bd-green" data-act="layoutedit" data-sfx="click">开始调整</button>') +
      optRow('控件布局', '摆乱了就一键退回出厂位置，或只复位某一块（在调整界面里）',
        '<button type="button" class="bd-btn" data-act="layoutreset" data-sfx="click">全部复位</button>') +
      optRow('启动后进入', '每次打开启动器先看到哪一页',
        '<select class="bd-sel" id="bdStartPage">' + startOpts.join('') + '</select>');
  }
  function paneSound() {
    const c = cfg();
    const vol = Math.round((typeof c.uiSoundVol === 'number' ? c.uiSoundVol : 0.55) * 100);
    return optRow('界面音效', '按钮、页签、列表项的点击声（基岩版主题默认开）',
        seg('uiSound', c.uiSound === false ? '0' : '1', [['1', '开'], ['0', '关']])) +
      optRow('音量', '音效音量（不影响游戏内声音）',
        '<input type="range" class="bd-range" id="bdVol" min="0" max="100" step="5" value="' + vol + '">' +
        '<span class="bd-range-val" id="bdVolVal">' + vol + '%</span>') +
      optRow('试听', '听一下当前的音量合不合适',
        '<button type="button" class="bd-btn" data-act="preview" style="min-height:32px;padding:5px 12px;font-size:12px">' +
        '<svg class="ic sm"><use href="#i-play"/></svg>播放</button>') +
      '<div class="bd-note">音效取自游戏里的一记敲击（<b>assets/sfx/*.wav</b>，4 个、总共约 13 KB），只在你点按钮时响，不会自己播。</div>';
  }
  /* 诊断（1.4.6）：从「关于」里独立出来的页签。
     内容不是重写的 —— 还是把 #page-diag 那一整块借进来（跟诊断页 / 下载页借资源区块同一个手法），
     崩溃分析、实例完整性、AI 分析、启动器崩溃记录全用 renderer 原来那套，只换材质。 */
  function paneDiag() {
    return '<div class="bd-diag-head">' +
        '<span class="bd-diag-tip">崩溃原因 · 文件完整性 · AI 深度分析</span>' +
        '<button type="button" class="bd-btn bd-mini" data-act="diagdir" data-sfx="click" title="打开诊断记录所在的文件夹">记录目录 →</button>' +
      '</div>' +
      '<div class="bd-diag-body bd-diag-flat" id="bdDiagPane"></div>';
  }
  /* 关于（1.4.6）：只剩「版本号 + 检查更新 + 打开下载页」三样，
     跟普通界面「设置 → 版本更新」那张卡做的事完全一样，只是换成基岩版材质。
     原来的「完整设置 / 诊断 / 账户」三颗入口按钮都撤了 —— 设置页本来就在设置里，
     诊断已成页签，账户在主菜单有「切换账户」。 */
  function paneAbout() {
    const c = cfg();
    return '<div class="bd-upd">' +
        '<div class="bd-upd-main">' +
          '<div class="bd-upd-brand">XLC CE Launcher · 基岩版界面</div>' +
          '<div class="bd-upd-cur"><span>当前版本</span><b id="bdUpdCur">' + esc(c.appVersion || '—') + '</b>' +
            (c.appVersionPre ? '<i class="bd-tag pre">快照</i>' : '') + '</div>' +
          '<div class="bd-upd-state" id="bdUpdState"><i></i><span id="bdUpdStateTx">尚未检测</span></div>' +
        '</div>' +
        '<div class="bd-upd-btns">' +
          '<button type="button" class="bd-btn bd-green" data-act="chkupd" data-sfx="click">检查更新</button>' +
          '<button type="button" class="bd-btn" data-act="opendl" data-sfx="click">打开下载页</button>' +
        '</div>' +
      '</div>' +
      '<div class="bd-upd-out" id="bdUpdOut"><div class="bd-empty">点「检查更新」从官方下载页读取最新版本。</div></div>';
  }
  const PANES = {
    general: paneGeneral, game: paneGame, look: paneLook,
    sound: paneSound, diag: paneDiag, about: paneAbout
  };

  function settingsBody() {
    const nav = NAV.map(n => n[0] === 'grp'
      ? '<div class="bd-nav-grp">' + n[1] + '</div>'
      : '<button type="button" class="bd-tab' + (BD.tab === n[1] ? ' on' : '') + '" data-tab="' + n[1] + '">' +
        '<svg class="ic sm"><use href="#' + n[3] + '"/></svg><span>' + n[2] + '</span></button>').join('');
    const panes = TABS.map(t =>
      '<div class="bd-pane' + (BD.tab === t[0] ? ' on' : '') + '" data-pane="' + t[0] + '">' +
        paneHead(t[0]) + PANES[t[0]]() + '</div>').join('');
    return '<div class="bd-set-body">' +
        '<div class="bd-tabs bd-set-nav">' + nav + '</div>' +
        '<div class="bd-panes">' + panes + '</div>' +
      '</div>';
  }
  function repaintSettings() {
    const sheet = document.getElementById('bdSheet');
    if (!sheet) return;
    /* 重画会把整个弹层 innerHTML 换掉，借来的诊断 DOM 会跟着被清掉 —— 先还回 #page-diag */
    if (DG.host && DG.host.id === 'bdDiagPane') dgRelease();
    /* 满屏（1.4.9）：最上面一条浅灰标题栏 + 左边分组导航 + 右边选项，
       背景露出主菜单的全景，跟游戏里的设置界面一个样子。 */
    sheet.className = 'bd-sheet bd-set';
    sheet.innerHTML =
      '<div class="bd-set-top">' +
        '<button type="button" class="bd-set-back" data-close data-sfx="back" title="返回（Esc）">' +
          '<svg class="ic"><use href="#i-chevron-left"/></svg></button>' +
        '<div class="bd-ttl">设置</div>' +
        '<div class="bd-set-tag">基岩版界面</div>' +
      '</div>' +
      settingsBody() +
      '<div class="bd-sheet-foot"><span class="bd-left">改完立即生效并自动保存</span>' +
        '<button type="button" class="bd-btn" data-close>完成</button></div>';
    afterPanePaint();
  }
  /* 页签内容有「活物」要挂上去：诊断那块 DOM、关于页的更新状态 */
  function afterPanePaint() {
    if (BD.kind !== 'settings') return;
    if (BD.tab === 'diag') dgMount(document.getElementById('bdDiagPane'));
    else if (DG.host && DG.host.id === 'bdDiagPane') dgRelease();
    if (BD.tab === 'about') loadUpdPane();
  }
  function paintTab(tab) {
    BD.tab = tab;
    document.querySelectorAll('#bdSheet .bd-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('#bdSheet .bd-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === tab));
    afterPanePaint();
  }

  /* ---------------- 好友弹层 ---------------- */
  function friendsBody() {
    return '<div class="bd-pane on">' +
        '<h4>我的好友码</h4>' +
        '<div class="bd-item" style="margin-top:8px">' +
          '<div class="bd-ic"><svg class="ic"><use href="#i-user-check"/></svg></div>' +
          '<div class="bd-item-main"><b style="font-size:15px;letter-spacing:2px" id="bdFrCode">—</b>' +
            '<span>每人只有一个、终身不变，发给朋友就能互加</span></div>' +
          '<div class="bd-act"><button type="button" class="bd-btn" data-act="copycode">复制</button></div>' +
        '</div>' +
        '<h4 style="margin-top:20px">添加好友</h4>' +
        '<div class="bd-item" style="margin-top:8px">' +
          '<input class="bd-inp" id="bdFrInput" placeholder="XXXX-XXXX-XXXX" maxlength="14" style="flex:1;text-transform:uppercase">' +
          '<div class="bd-act"><button type="button" class="bd-btn" data-act="addfriend">添加</button></div>' +
        '</div>' +
        '<h4 style="margin-top:20px">好友列表 <span id="bdFrHint" style="color:rgba(255,255,255,.4);font-size:10.5px;letter-spacing:0"></span></h4>' +
        '<div class="bd-list" id="bdFrList"><div class="bd-empty">加载中…</div></div>' +
      '</div>';
  }
  async function loadFrPane() {
    const box = document.getElementById('bdFrList');
    if (!box) return;
    const r = await window.lmc.friendsGet().catch(() => null);
    if (!r || !r.ok) { box.innerHTML = '<div class="bd-empty">好友服务暂时不可用（检查网络后重试）</div>'; return; }
    const code = document.getElementById('bdFrCode');
    if (code) code.textContent = r.code || '—';
    friendsCache = r.friends || [];
    const pr = await window.lmc.friendsPresence().catch(() => null);
    const pres = pr && pr.ok ? pr : { status: {} };
    const hint = document.getElementById('bdFrHint');
    if (hint) hint.textContent = pres.connected ? '在线状态实时刷新' : '在线状态服务未连上';
    if (!friendsCache.length) {
      box.innerHTML = '<div class="bd-empty">还没有好友 —— 把上面的好友码发给朋友，或输入对方的码添加</div>';
      return;
    }
    box.innerHTML = friendsCache.map(f => {
      const st = pres.status[f.code] || {};
      const online = !!st.online;
      return '<div class="bd-item">' +
          '<div class="bd-ic">' + (f.avatar ? '<img src="' + esc(f.avatar) + '" alt="">' : '<svg class="ic"><use href="#i-user"/></svg>') + '</div>' +
          '<div class="bd-item-main"><b>' + esc(f.name) +
            '<span class="bd-dot' + (online ? ' on' : '') + '" title="' + (online ? '在线' : '离线') + '"></span></b>' +
            '<span>' + (online ? '在线 · 可以邀请联机' : '离线') + ' · 好友码 ' + esc(f.code) + '</span></div>' +
          '<div class="bd-act">' +
            (online ? '<button type="button" class="bd-btn" data-invite="' + esc(f.code) + '">邀请联机</button>' : '') +
            '<button type="button" class="bd-btn" data-del="' + esc(f.code) + '" title="从好友列表里移除">移除</button>' +
          '</div></div>';
    }).join('');
  }

  /* ---------------- 切换账户弹层（左列表 + 右 3D 模型 + 就地添加账户） ----------------
   * 原来这里「管理」是跳账户页、更衣室也是跳账户页 —— 现在都在弹层里做完：
   *   · 点一行 → 右边那块 3D 就换成那个账户的皮肤（跟账户页同一个渲染器）
   *   · 「设为当前」直接切账户；「设置」打开账户设置弹窗（改皮肤 / 模型 / 玩家名 / 删除）
   *   · 「添加账户」把账户页那张添加卡片原样借过来（离线 / 微软正版 / 外置登录都能用）
   */
  function accountsBody() {
    return '<div class="bd-accwrap">' +
          '<div class="bd-accmain">' +
            '<h4 style="margin-top:0">账户列表 · 点一行看它的皮肤</h4>' +
            '<div class="bd-list" id="bdAccList"><div class="bd-empty">加载中…</div></div>' +
            '<div class="bd-accadd" id="bdAccAdd">' +
              '<button type="button" class="bd-btn" data-act="addadopt">＋ 添加账户（离线 / 微软正版 / 外置登录）</button>' +
              '<div class="bd-adopt" id="bdAccAddHost"></div>' +
            '</div>' +
          '</div>' +
          '<div class="bd-accside"><canvas id="bdAccCv" width="232" height="314"></canvas></div>' +
        '</div>';
  }
  async function loadAccPane() {
    const box = document.getElementById('bdAccList');
    if (!box) return;
    const r = await window.lmc.accountList().catch(() => null);
    if (!r || !r.ok) { box.innerHTML = '<div class="bd-empty">账户列表读取失败</div>'; return; }
    /* 顺手把账户缓存同步给右下角常驻的小人 —— 不打开账户页也能看到正确的皮肤 */
    S.accounts = r.accounts || [];
    S.accActive = r.active || S.accActive || '';
    const cur = r.active || '';
    const list = S.accounts;
    if (!list.length) {
      box.innerHTML = '<div class="bd-empty">还没有账户 —— 点下面「添加账户」建一个</div>';
      /* 没账户时右边也要站着人（默认史蒂夫），不然弹层右半边是空的 */
      paintStage(bigStage('bdAccCv'), null);
      refreshSkin(true);
      return;
    }
    box.innerHTML = list.map(a => {
      const type = a.type === 'ms' ? '微软正版' : a.type === 'authlib' ? '外置登录' : '离线账户';
      return '<div class="bd-item" data-view="' + esc(a.name) + '" title="点一下看这个账户的皮肤">' +
          '<div class="bd-ic">' + (a.skinUrl
            ? '<img src="' + esc(a.skinUrl) + '" alt="">'
            : '<svg class="ic"><use href="#i-user"/></svg>') + '</div>' +
          '<div class="bd-item-main"><b>' + esc(a.name) +
            (a.type === 'ms' ? '<span class="bd-tag ms">正版</span>' : '') +
            (a.name === cur ? '<span class="bd-tag cur">当前</span>' : '') + '</b>' +
            '<span>' + type + (a.model === 'slim' ? ' · 苗条模型' : '') + '</span></div>' +
          '<div class="bd-act">' +
            (a.name === cur ? '' : '<button type="button" class="bd-btn" data-acc="' + esc(a.name) + '">设为当前</button>') +
            '<button type="button" class="bd-btn" data-accset="' + esc(a.name) + '">设置</button>' +
          '</div></div>';
    }).join('');
    markAccRow(cur);
    paintStage(bigStage('bdAccCv'), accActive());
  }
  function markAccRow(name) {
    document.querySelectorAll('#bdAccList .bd-item').forEach(r => r.classList.toggle('on', r.dataset.view === name));
  }
  /* 「添加账户」：把账户页那张卡片原样借进弹层（.bd-adopt 里已经把外观换成基岩版） */
  function ensureAccAdd() {
    const wrap = document.getElementById('bdAccAdd');
    const host = document.getElementById('bdAccAddHost');
    if (!wrap || !host) return;
    wrap.classList.toggle('on');
    if (!wrap.classList.contains('on') || host.dataset.done === '1') return;
    const card = document.querySelector('#page-account .set-card');
    if (!card) { toast('没找到添加账户面板，请到账户页操作', 'warn'); return; }
    host.dataset.done = '1';
    adoptOne(card, host);
  }
  async function switchAcc(name) {
    try {
      const r = await window.lmc.accountSwitch({ name });
      if (r && r.ok) {
        /* 主进程已经把 config.activeAccount 落盘了，但返回体里没有整份配置：
           这里补一下内存里的副本，免得切完账户后别处读 S.config 还是旧名字 */
        S.config.activeAccount = r.active || name;
        S.config.username = r.active || name;
        S.accActive = r.active || name;
        if (Array.isArray(r.accounts)) S.accounts = r.accounts;
      }
      if (typeof applyAccounts === 'function') applyAccounts(r, '已切换到 ' + name);
      refreshSkin(true);
      sync();
      await loadAccPane();
      if (BD.kind === 'dress') loadDressAcc();
      if (r && r.ok) toast('已切换到 ' + name + '，下次启动就用这个账户');
    } catch (e) { toast('切换失败: ' + e.message, 'error'); }
  }

  /* ---------------- 更衣室弹层（大号 3D 模型 + 动作 + 换皮肤） ---------------- */
  const DRESS_ACTS = [['default', '默认'], ['walk', '走路'], ['run', '跑步'], ['swim', '游泳'], ['sit', '坐下']];
  function dressBody() {
    return '<div class="bd-dress">' +
        '<div class="bd-dress-stage"><canvas id="bdDressCv" width="300" height="408"></canvas></div>' +
        '<div class="bd-dress-side">' +
          '<h4>动作</h4>' +
          '<div class="bd-chips">' + DRESS_ACTS.map(a =>
            '<button type="button" class="bd-chip" data-bdact="' + a[0] + '">' + a[1] + '</button>').join('') + '</div>' +
          '<h4>看哪个账户的皮肤</h4>' +
          '<div class="bd-list bd-dress-list" id="bdDressAcc"><div class="bd-empty">加载中…</div></div>' +
          '<div class="bd-note" style="margin-top:12px">按住画面拖动转视角 · 滚轮缩放 · 头会跟着鼠标转<br>' +
            '切到<b>坐下</b>后：点一下画面弹一下（duang），<b>快点点两下</b>开口说话，<b>再点两下停</b>。</div>' +
        '</div></div>';
  }
  async function loadDressAcc() {
    const box = document.getElementById('bdDressAcc');
    if (!box) return;
    const r = await window.lmc.accountList().catch(() => null);
    const list = (r && r.ok && r.accounts) || [];
    if (r && r.ok) { S.accounts = list; S.accActive = r.active || S.accActive || ''; }
    if (!list.length) {
      box.innerHTML = '<div class="bd-empty">还没有账户（先用默认皮肤看着）</div>';
      paintStage(bigStage('bdDressCv'), null);
      markChips();
      return;
    }
    const cur = (r && r.active) || '';
    box.innerHTML = list.map(a =>
      '<div class="bd-item' + (a.name === cur ? ' on' : '') + '" data-view="' + esc(a.name) + '">' +
        '<div class="bd-ic">' + (a.skinUrl ? '<img src="' + esc(a.skinUrl) + '" alt="">' : '<svg class="ic"><use href="#i-user"/></svg>') + '</div>' +
        '<div class="bd-item-main"><b>' + esc(a.name) + (a.name === cur ? '<span class="bd-tag cur">当前</span>' : '') + '</b>' +
          '<span>' + (a.model === 'slim' ? '苗条模型' : '经典模型') + (a.skinUrl ? ' · 自定义皮肤' : ' · 默认皮肤') + '</span></div>' +
      '</div>').join('');
    paintStage(bigStage('bdDressCv'), accActive());
    markChips();
  }
  /* 改皮肤 / 换模型 / 改玩家名：直接开账户设置弹窗（那套流程是现成的，不重写） */
  function openSkinSettings(name) {
    const n = name || accName();
    if (!n) { toast('先建一个账户', 'warn'); return; }
    if (typeof openAccountSettings === 'function') openAccountSettings(n);
    else gotoPage('account');
  }

  /* ---------------- 退出启动器（1.4.11：基岩版全屏后没有标题栏，关闭入口只剩这一处） ---------------- */
  function quitBody() {
    return '<div class="bd-note" style="margin-top:0">' +
          (S.gameRunning
            ? '启动器会直接关闭。<b>游戏还在运行</b> —— 关启动器不会把游戏一起关掉，它会自己继续跑。'
            : '启动器会直接关闭。没有正在运行的游戏。') +
        '</div>' +
        '<div class="bd-note">基岩版界面是全屏的，窗口右上角那排按钮已经收起来了；下次想退出可以再来这里，' +
          '或者点左上角「普通模式」换回带标题栏的界面。</div>';
  }

  /* ---------------- 联机弹层（陶瓦联机，DOM 原样借过来） ---------------- */
  function lanBody() {
    return '<div class="bd-note" style="margin-top:0">建房间 / 进房间 / 模组核对都是原来那套逻辑，只是搬进了基岩版面板 —— 功能一点没变。</div>' +
        '<div class="bd-adopt" id="bdLanHost"></div>';
  }
  function ensureLan() {
    const host = document.getElementById('bdLanHost');
    if (!host || host.dataset.done === '1') return;
    host.dataset.done = '1';
    /* 「好友联机」那张卡：要挑 mpMain 外面的（mpMain 里的「联机大厅」卡会跟着 mpMain 一起搬，
       单独抽出来反而会把大厅内容从 mpMain 里挖走） */
    const friendCard = Array.from(document.querySelectorAll('#page-mp .set-card'))
      .find(c => c.id !== 'mpSetup' && !c.closest('#mpMain'));
    const nodes = [
      document.getElementById('mpSetup'),
      document.getElementById('mpMain'),
      friendCard,
      document.querySelector('#page-mp .third-party-note')
    ];
    nodes.forEach(n => adoptOne(n, host));
    /* 原来进联机页会做的事，这里手动调一次（不跳页也要把状态跑起来） */
    try { if (typeof mpOnEnter === 'function') mpOnEnter(); } catch (_) {}
  }

  /* ---------------- 「游戏」页（1.4.10：整页照基岩版「游戏 / Play」界面重排）
   *   版式（对着游戏里的界面一条一条对）：
   *     · 顶上一条浅灰标题栏：左边返回箭头、中间「游戏」、右边「社交 (N)」
   *     · 下面一排通栏宽页签：游戏 / 插件 —— 游戏里的「世界 · Realms · 服务器」
   *       只留第一个（本启动器没有 Realms/服务器页面），右边补一个「插件」
   *     · 页签右下是绿色主按钮：游戏页 = 进入游戏（还是原来那颗 #bdPlay），
   *       插件页 = 打开插件目录（mods 文件夹）
   *     · 再下面是整块半透明石块面板：游戏页放「版本 + 最近玩的存档」，
   *       插件页放当前版本的模组列表（可直接启用 / 禁用）
   *   空列表照游戏里的空态：一句「这里还没有…!」+ 一张像素画 + 一句说明。
   * ------------------------------------------------------------------ */
  function playArt(title, cap) {
    return '<div class="bd-art">' +
        '<div class="bd-art-t">' + esc(title) + '</div>' +
        '<svg class="bd-art-img" viewBox="0 0 220 120" shape-rendering="crispEdges" aria-hidden="true">' +
          '<defs><linearGradient id="bdArtSky" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#5d90cf"/><stop offset=".52" stop-color="#e5a95f"/>' +
            '<stop offset=".78" stop-color="#f7d79c"/><stop offset="1" stop-color="#f4d29a"/>' +
          '</linearGradient></defs>' +
          '<rect width="220" height="120" fill="url(#bdArtSky)"/>' +
          '<rect x="150" y="40" width="26" height="26" fill="#ffeaa6"/>' +
          '<rect x="146" y="58" width="34" height="8" fill="#ffd97d"/>' +
          '<rect x="18" y="34" width="34" height="8" fill="#f2f5f8"/>' +
          '<rect x="10" y="42" width="50" height="8" fill="#dfe6ee"/>' +
          '<rect x="96" y="24" width="28" height="7" fill="#f2f5f8"/>' +
          '<rect x="88" y="31" width="44" height="7" fill="#dfe6ee"/>' +
          '<rect x="0" y="80" width="220" height="12" fill="#63a832"/>' +
          '<rect x="0" y="92" width="220" height="5" fill="#4d8526"/>' +
          '<rect x="0" y="97" width="220" height="23" fill="#6d4b2b"/>' +
          '<rect x="24" y="72" width="6" height="20" fill="#6b4526"/>' +
          '<rect x="14" y="60" width="26" height="14" fill="#3f7b2a"/>' +
          '<rect x="20" y="56" width="14" height="6" fill="#4b8f31"/>' +
          '<rect x="176" y="70" width="6" height="22" fill="#6b4526"/>' +
          '<rect x="166" y="58" width="26" height="14" fill="#3f7b2a"/>' +
          '<rect x="172" y="54" width="14" height="6" fill="#4b8f31"/>' +
        '</svg>' +
        '<div class="bd-art-c">' + esc(cap) + '</div>' +
      '</div>';
  }
  function gameShell() {
    return '<div class="bd-set-top bd-play-top">' +
        '<button type="button" class="bd-set-back" data-close data-sfx="back" title="返回（Esc）">' +
          '<svg class="ic"><use href="#i-chevron-left"/></svg></button>' +
        '<div class="bd-ttl">游戏</div>' +
        '<button type="button" class="bd-btn bd-play-soc" data-open="social" data-sfx="click" title="社交：好友 / 玩家列表">' +
          '<svg class="ic sm"><use href="#i-users"/></svg><span>社交 (<b id="bdPlaySocN">0</b>)</span></button>' +
      '</div>' +
      '<div class="bd-play-tabs" id="bdPlayTabs">' +
        '<button type="button" class="bd-ptab on" data-ptab="game" data-sfx="click">' +
          '<svg class="ic sm"><use href="#i-map"/></svg><span>游戏</span></button>' +
        '<button type="button" class="bd-ptab" data-ptab="addon" data-sfx="click">' +
          '<svg class="ic sm"><use href="#i-puzzle"/></svg><span>插件</span></button>' +
        /* 1.4.15：普通模式「实例管理」搬进来的第三个页签 */
        '<button type="button" class="bd-ptab" data-ptab="inst" data-sfx="click">' +
          '<svg class="ic sm"><use href="#i-box"/></svg><span>实例</span></button>' +
      '</div>' +
      '<div class="bd-play-acts">' +
        /* 左边「切换版本」——原来在面板里的版本下拉挪到这里，跟游戏里选世界同一条横线；
           插件页签用不上版本，换成一句统计（内置 4 · 社区 N），右边绿色按钮 = 刷新插件列表 */
        '<div class="bd-play-ver" id="bdPlayVer">' +
          '<span class="bd-play-vlb">切换版本</span>' +
          '<select class="bd-sel" id="bdGameVer"></select>' +
        '</div>' +
        '<div id="bdGameSlot"></div>' +
        '<span class="bd-play-plb" id="bdPlugStat" hidden></span>' +
        '<button type="button" class="bd-btn bd-green bd-play-main" id="bdAddonRef" data-act="plugrefresh" data-sfx="click" hidden>刷新插件</button>' +
        /* 实例页签：左边一句统计，右边一颗刷新（不摆版本下拉，这页本身就是在挑实例） */
        '<span class="bd-play-plb" id="bdInstStat" hidden></span>' +
        '<button type="button" class="bd-btn bd-green bd-play-main" id="bdInstRef" data-act="instrefresh" data-sfx="click" hidden>刷新实例</button>' +
      '</div>' +
      '<div class="bd-play-body">' +
        '<div class="bd-play-pane on" data-pane="game">' +
          '<div class="bd-game-hint" id="bdGameHint"></div>' +
          '<h4>最近玩的存档</h4>' +
          '<div class="bd-worlds" id="bdWorlds"><div class="bd-empty">扫描存档中…</div></div>' +
        '</div>' +
        /* 插件页签 = 普通模式「插件」页的基岩版版式：内置插件 + 社区插件，
           一行一张卡，能启用 / 停用 / 打开，社区插件还能开目录、删除 */
        '<div class="bd-play-pane" data-pane="addon">' +
          '<div class="bd-plg-grid" id="bdAddonList"><div class="bd-empty">读取插件列表…</div></div>' +
          /* 插件面板的宿主：点「打开」时把普通模式那套面板整块搬进来（功能一份不重写），
             不开新页面、不跳回普通界面 */
          '<div class="bd-plg-host" id="bdPlgHost" hidden>' +
            '<div class="bd-plg-bar">' +
              '<button type="button" class="bd-btn bd-mini" data-act="plugback" data-sfx="back">' +
                '<svg class="ic sm"><use href="#i-chevron-left"/></svg><span>插件列表</span></button>' +
              '<b id="bdPlgHostTtl"></b>' +
            '</div>' +
            '<div class="bd-plg-body" id="bdPlgBody"></div>' +
          '</div>' +
        '</div>' +
        /* 实例页签 = 普通模式「实例管理」页的基岩版版式：一行一个实例，
           挑当前 / 启动 / 改名 / 开目录 / 删除，全在这页做完（1.4.15） */
        '<div class="bd-play-pane" data-pane="inst">' +
          '<div class="bd-inst-hd">' +
            '<span>点一行左边的「设为当前」换实例，「启动」直接开游戏；改名只动版本目录与 JSON，存档不碰。</span>' +
          '</div>' +
          '<div class="bd-inst-list" id="bdInstList"><div class="bd-empty">读取实例…</div></div>' +
          '<div class="bd-inst-more" id="bdInstMore"></div>' +
        '</div>' +
      '</div>';
  }
  /* 页签：游戏 / 插件（绿按钮跟着换：进入游戏 ↔ 刷新插件） */
  function paintPlay(tab) {
    /* 从插件页签切走时，先把搬进来的插件面板还回普通页面 */
    if (BD.plug && tab !== 'addon') plugPaneRestore(true);
    BD.play = tab;
    document.querySelectorAll('#bdSheet .bd-ptab').forEach(b => b.classList.toggle('on', b.dataset.ptab === tab));
    document.querySelectorAll('#bdSheet .bd-play-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === tab));
    const slot = document.getElementById('bdGameSlot');
    const ver = document.getElementById('bdPlayVer');
    const stat = document.getElementById('bdPlugStat');
    const ref = document.getElementById('bdAddonRef');
    if (slot) slot.hidden = tab !== 'game';
    if (ver) ver.hidden = tab !== 'game';
    if (stat) stat.hidden = tab !== 'addon';
    if (ref) ref.hidden = tab !== 'addon';
    const ist = document.getElementById('bdInstStat');
    const iref = document.getElementById('bdInstRef');
    if (ist) ist.hidden = tab !== 'inst';
    if (iref) iref.hidden = tab !== 'inst';
    if (tab === 'addon' && !BD.plug) loadPlugins();
    if (tab === 'inst') loadInstPane();
  }

  /* ---------------- 插件页签（1.4.11：跟普通模式「插件」页对齐）
   *   普通模式那一页列的是「启动器插件」，不是游戏 mods 目录：
   *     · 内置插件 4 个（种子地图 / 一键开服 / 手柄控制 / 模组翻译器）—— 只能启用 / 停用
   *     · 社区插件（.zip 导入）—— 能启用 / 停用 / 打开面板 / 开目录 / 删除
   *   这里数据全部走同一套 IPC（plugin:list / toggle / remove / open-dir），
   *   「打开」直接交回普通模式那边的 openPlugin —— 面板只有一份，不重写第二套。
   * ------------------------------------------------------------------ */
  const BP = { on: {}, third: [], loaded: false };
  /* 内置插件的元信息：优先用 renderer 里的 PLUGIN_DEFS（只有一份定义，改了不会两处不一致）；
     renderer 还没跑到 / 名字变了就退回这份兜底。 */
  const BP_DEFS = [
    { id: 'seedmap', name: '种子地图', ver: '1.0.1', tag: '工具', ic: '#i-map', color: '#10b981',
      desc: '输入任意种子，直接在启动器内查看该世界的生物群系、村庄、要塞与结构分布；支持从已有存档一键读取种子。' },
    { id: 'server', name: '一键开服', ver: '1.0.0', tag: '联机', ic: '#i-server', color: '#f59e0b',
      desc: '选择 Paper / Purpur / 原版 / Fabric 与游戏版本，自动下载服务端、生成 eula 与 server.properties，一键启动并查看日志。' },
    { id: 'gamepad', name: '手柄控制', ver: '1.0.0', tag: '操作', ic: '#i-gamepad', color: '#8b5cf6',
      desc: '用手柄操作启动器：十字键移焦点、A 确认、B 返回、LB/RB 切页、Start 启动游戏，不碰键鼠也能走完全流程。' },
    { id: 'translator', name: '模组翻译器', ver: '1.0.0', tag: '工具', ic: '#i-globe', color: '#0ea5e9',
      desc: '上传一个模组 JAR，把里面的英文文本翻成中文，生成汉化资源包；不改原模组，翻过的文本会缓存。' }
  ];
  function plugDefs() {
    try {
      if (typeof PLUGIN_DEFS !== 'undefined' && PLUGIN_DEFS && PLUGIN_DEFS.length) return PLUGIN_DEFS;
    } catch (_) {}
    return BP_DEFS;
  }
  function plugOn(id) { return BP.on[id] !== false; }
  /* 一张卡：图标 + 名字 / 标签 + 简介 + 操作区（开关 / 打开 / 目录 / 删除） */
  function plugCard(p, third) {
    const on = plugOn(p.id);
    const ic = p.iconUrl
      ? '<span class="bd-plg-ic"><img src="' + esc(p.iconUrl) + '" alt=""></span>'
      : '<span class="bd-plg-ic" style="color:' + esc(p.color || '#38bdf8') + '">' +
          '<svg class="ic"><use href="' + esc(third ? '#i-puzzle' : (p.ic || '#i-puzzle')) + '"/></svg></span>';
    const tags = third
      ? '<span class="bd-tag">社区</span>' +
        (p.author ? '<span class="bd-tag">' + esc(p.author) + '</span>' : '') +
        '<span class="bd-tag">v' + esc(p.version || '1.0.0') + '</span>'
      : '<span class="bd-tag">' + esc(p.tag || '工具') + '</span><span class="bd-tag">v' + esc(p.ver || '1.0.0') + '</span>';
    const desc = third
      ? (p.description || '社区插件（没有写简介）')
      : (p.desc || '');
    const canOpen = on && (!third || !!p.entry);
    return '<div class="bd-plg' + (on ? '' : ' off') + '">' +
        '<div class="bd-plg-top">' + ic +
          '<div class="bd-plg-main"><b>' + esc(p.name || p.id) + tags + '</b>' +
            '<span class="bd-plg-desc">' + esc(desc) + '</span></div>' +
        '</div>' +
        '<div class="bd-plg-foot">' +
          '<button type="button" class="bd-sw' + (on ? ' on' : '') + '" data-act="plugtoggle" data-plug="' + esc(p.id) +
            '" data-sfx="tick" title="' + (on ? '点击停用' : '点击启用') + '"><i></i></button>' +
          '<span class="bd-plg-st">' + (on ? '已启用' : '已停用') + '</span>' +
          '<div class="bd-plg-acts">' +
            (third ? '<button type="button" class="bd-btn bd-mini" data-act="plugdir" data-plug="' + esc(p.id) + '" data-sfx="click">目录</button>' : '') +
            (third ? '<button type="button" class="bd-btn bd-mini bd-danger" data-act="plugdel" data-plug="' + esc(p.id) + '" data-sfx="click">删除</button>' : '') +
            '<button type="button" class="bd-btn bd-mini bd-green" data-act="plugopen" data-plug="' + esc(p.id) + '" data-sfx="click"' +
              (canOpen ? '' : ' disabled') + '>' + (third && !p.entry ? '无面板' : '打开') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  async function loadPlugins() {
    const box = document.getElementById('bdAddonList');
    if (!box) return;
    if (!BP.loaded) box.innerHTML = '<div class="bd-empty">读取插件列表…</div>';
    const r = await window.lmc.pluginList().catch(() => null);
    if (!r || !r.ok) {
      box.innerHTML = '<div class="bd-empty">读取失败：' + esc((r && r.error) || '未知错误') + '</div>';
      return;
    }
    BP.on = r.plugins || {};
    BP.third = Array.isArray(r.third) ? r.third : [];
    BP.loaded = true;
    const defs = plugDefs();
    const st = document.getElementById('bdPlugStat');
    if (st) st.textContent = '内置 ' + defs.length + ' 个 · 社区 ' + BP.third.length + ' 个';
    box.innerHTML = defs.map(p => plugCard(p, false)).join('') +
      BP.third.map(p => plugCard(p, true)).join('');
  }
  function plugName(id) {
    const d = plugDefs().find(x => x.id === id) || BP.third.find(x => x.id === id);
    return d ? d.name : id;
  }
  /* 启用 / 停用：内置插件立刻生效（手柄那个还要重算焦点），社区插件下次打开时按新状态走 */
  async function plugToggle(id) {
    if (!id) return;
    const now = !plugOn(id);
    const r = await window.lmc.pluginToggle({ id, enabled: now }).catch(() => null);
    if (!r || !r.ok) { toast((r && r.error) || '操作失败', 'error'); return; }
    if (r.plugins) BP.on = r.plugins; else BP.on[id] = now;
    playSfx('tick');
    toast('插件「' + plugName(id) + '」已' + (now ? '启用' : '停用'), now ? 'ok' : 'warn');
    if (id === 'gamepad' && typeof gpApply === 'function') { try { gpApply(); } catch (_) {} }
    loadPlugins();
  }
  /* ---------------- 插件面板（1.4.12：留在基岩版里，不再跳普通界面）
   *   普通模式那四个面板（种子地图 / 一键开服 / 手柄控制 / 模组翻译器）是
   *   一整块 DOM，事件也全绑在它们自己身上。这里不重写第二套，做法跟联机、
   *   诊断页一样：把节点整块搬进弹层宿主，点「返回」或者关弹层再搬回原位。
   *   社区插件仍然是主进程开的独立窗口（它本来就跑在另一个进程里）。
   * ------------------------------------------------------------------ */
  const BD_PLUG_PANES = { seedmap: 'plgSeedmap', server: 'plgServer', gamepad: 'plgGamepad', translator: 'plgTranslator' };
  let plugMoved = null;     /* 当前搬进弹层的面板节点 */
  let plugAnchor = null;    /* 它原来位置前的注释锚点（搬回去还插在这儿） */
  /* 把面板搬回普通页面并复位显示状态 —— 不搬回去的话，普通模式插件页会停在面板上 */
  function plugPaneRestore(silent) {
    if (!plugMoved && !BD.plug) return;
    if (plugMoved) {
      const p = plugAnchor && plugAnchor.parentNode;
      if (p) { try { p.insertBefore(plugMoved, plugAnchor); } catch (_) {} }
      plugMoved = null;
    }
    if (plugAnchor) { try { plugAnchor.remove(); } catch (_) {} plugAnchor = null; }
    BD.plug = '';
    /* 让普通模式那套把面板收起来（否则插件页会停在面板上，看不到列表） */
    if (typeof closePlugin === 'function') { try { closePlugin(); } catch (_) {} }
    const host = document.getElementById('bdPlgHost');
    const grid = document.getElementById('bdAddonList');
    const body = document.getElementById('bdPlgBody');
    if (host) host.hidden = true;
    if (grid) grid.hidden = false;
    if (body) body.innerHTML = '';
    /* 面板收起来 → 横线上那行「内置 N 个 · 刷新插件」回来 */
    if (BD.play === 'addon') {
      const stat = document.getElementById('bdPlugStat');
      const ref = document.getElementById('bdAddonRef');
      if (stat) stat.hidden = false;
      if (ref) ref.hidden = false;
    }
    /* 插件面板里改过东西（比如开过服、翻过模组）—— 回来刷新一下卡片状态 */
    if (!silent && BD.kind === 'game' && BD.play === 'addon') loadPlugins();
  }
  function plugPaneOpen(id) {
    const pane = document.getElementById(BD_PLUG_PANES[id] || '');
    const body = document.getElementById('bdPlgBody');
    const host = document.getElementById('bdPlgHost');
    const grid = document.getElementById('bdAddonList');
    if (!pane || !body || !host) return false;
    plugPaneRestore(true);
    /* 锚点记在原位置前，搬回去顺序不会乱 */
    plugAnchor = document.createComment('bd-plug');
    pane.parentNode.insertBefore(plugAnchor, pane);
    plugMoved = pane;
    body.appendChild(pane);
    /* 面板自带的返回按钮（#btnSeedBack 之类）绑的是普通模式的 closePlugin，
       这里再补一刀：把面板搬回原位、重新露出插件卡片列表 */
    if (!body.dataset.wired) {
      body.dataset.wired = '1';
      body.addEventListener('click', (e) => {
        if (!e.target.closest('#btnSeedBack,#btnSrvBack,#btnGpBack,#btnTrBack')) return;
        plugPaneRestore();
      });
    }
    host.hidden = false;
    if (grid) grid.hidden = true;
    /* 面板打开时，横线上那行「内置 N 个 · 刷新插件」就用不上了 —— 收起来，别让人隔着面板点它 */
    const stat = document.getElementById('bdPlugStat');
    const ref = document.getElementById('bdAddonRef');
    if (stat) stat.hidden = true;
    if (ref) ref.hidden = true;
    const ttl = document.getElementById('bdPlgHostTtl');
    if (ttl) ttl.textContent = plugName(id);
    BD.plug = id;
    /* 打开状态先同步给普通模式那套逻辑（openPlugin 读的是 PLG.on） */
    try { if (typeof PLG !== 'undefined' && PLG.on) PLG.on[id] = plugOn(id); } catch (_) {}
    /* 节点已经在可见位置了，再跑初始化 —— 面板里要量尺寸的控件这时候才量得准 */
    try { if (typeof openPlugin === 'function') openPlugin(id); } catch (_) {}
    return true;
  }
  /* 打开：内置插件 = 搬面板进弹层；社区插件 = 主进程的独立窗口 */
  function plugOpen(id) {
    if (!id) return;
    if (!plugOn(id)) { toast('插件已停用，请先在列表里启用', 'warn'); return; }
    const t = BP.third.find(x => x.id === id);
    playSfx('click');
    if (t) {
      try { if (typeof openThirdParty === 'function') openThirdParty(t); } catch (_) {}
      return;
    }
    if (!plugPaneOpen(id)) toast('插件面板打不开', 'error');
  }
  async function plugDir(id) {
    if (!id) return;
    const r = await window.lmc.pluginOpenDir({ id }).catch(() => null);
    if (!r || !r.ok) toast('打开失败：' + ((r && r.error) || '未知错误'), 'error');
  }
  async function plugDel(id) {
    if (!id) return;
    const name = plugName(id);
    if (typeof askConfirm === 'function' &&
        !(await askConfirm('删除插件「' + name + '」？', {
          danger: true, okText: '删除',
          detail: '插件自己的目录（含它在插件目录里存的数据）会被删除，它的授权记录也会一并清掉；游戏目录、存档与启动器设置不受影响。以后想用可以重新导入插件包。'
        }))) return;
    try { if (typeof destroyPluginPage === 'function') destroyPluginPage(id); } catch (_) {}
    const r = await window.lmc.pluginRemove({ id }).catch(() => null);
    if (!r || !r.ok) { toast('删除失败：' + ((r && r.error) || '未知错误'), 'error'); return; }
    toast('插件「' + name + '」已删除', 'warn');
    loadPlugins();
  }
  async function loadGame() {
    const list = pickInsts(), cur = curVer();
    const sel = document.getElementById('bdGameVer');
    if (sel) {
      sel.innerHTML = list.length
        ? list.map(v => {
            /* 实例名里一般已经带了加载器（1.21.4-Fabric），别再拼一次 */
            const id = v.id, ld = v.loader && v.loader !== 'Vanilla' ? v.loader : '';
            const dup = ld && new RegExp(ld, 'i').test(id);
            return '<option value="' + esc(id) + '">' + esc(id + (ld && !dup ? ' · ' + ld : '')) + '</option>';
          }).join('')
        : '<option value="">尚未安装任何版本</option>';
      if (cur) sel.value = cur;
    }
    const hint = document.getElementById('bdGameHint');
    if (hint) {
      hint.textContent = list.length
        ? '「启动游戏」直接启动左边选中的版本；点下面的存档会切到它所在的实例。'
        : '还没有安装任何版本 —— 先去「下载」装一个。';
    }
    const box = document.getElementById('bdWorlds');
    if (!box) return;
    const r = await window.lmc.savesList().catch(() => null);
    const saves = (r && r.ok ? r.saves : []) || [];
    if (!saves.length) {
      box.innerHTML = playArt('这里还没有存档…!', '进游戏建一个世界，这里就会列出来');
      return;
    }
    box.innerHTML = saves.slice(0, 8).map(s => {
      const d = s.lastPlayed ? new Date(s.lastPlayed) : null;
      const dt = d ? (d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' +
        String(d.getDate()).padStart(2, '0')) : '—';
      return '<button type="button" class="bd-world" data-save="' + esc(s.path || '') +
        '" data-inst="' + esc(s.instance || '') + '">' +
        '<span class="bd-world-img">' +
          (s.icon ? '<img src="' + s.icon + '" alt="" draggable="false">' : '<svg class="ic"><use href="#i-map"/></svg>') +
        '</span>' +
        '<span class="bd-world-meta"><b>' + esc(s.levelName || s.name || '未命名') + '</b>' +
          '<span>' + esc(s.instance || '—') + ' · ' + dt + '</span>' +
          /* 1.4.14：世界名下面那支小铅笔 —— 点它改名（不会触发「切到存档所在实例」） */
          '<span class="bd-world-edit" role="button" tabindex="0" title="改这个世界的名字" ' +
            'data-saveedit="' + esc(s.path || '') + '" data-savename="' + esc(s.levelName || s.name || '') + '">' +
            '<svg class="ic"><use href="#i-pencil"/></svg>改名</span>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  /* ---------------- 社交面板（右上角「社交」→ 右侧滑出） ----------------
   * 版式照基岩版：搜索框 / 玩家 · 好友码 两个页签 / 我自己的状态 / 在线 / 离线列表；
   * 每行右侧「⋮」= 该玩家的选项（收藏夹 · 静音 · 拉黑 · 举报 · 移除好友）。
   * 收藏 / 静音 / 拉黑是本机偏好，存在 localStorage；移除好友才真的走 friends:remove。 */
  const SOC_KEY = 'xlc.bd.social';
  function socPrefs() {
    try {
      const o = JSON.parse(localStorage.getItem(SOC_KEY) || '{}') || {};
      return { fav: o.fav || [], mute: o.mute || [], block: o.block || [] };
    } catch (_) { return { fav: [], mute: [], block: [] }; }
  }
  function socSavePrefs(p) { try { localStorage.setItem(SOC_KEY, JSON.stringify(p)); } catch (_) {} }

  function socialShell() {
    return '<div class="bd-sheet-head bd-soc-top">' +
        '<input class="bd-inp bd-soc-search" id="bdSocSearch" placeholder="搜索人员" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="bd-btn bd-x" data-close title="关闭">✕</button>' +
      '</div>' +
      '<div class="bd-soc-tabs">' +
        '<button type="button" class="bd-soc-tab on" data-soc="players">玩家</button>' +
        '<button type="button" class="bd-soc-tab" data-soc="code">好友码</button>' +
      '</div>' +
      '<div class="bd-sheet-body" style="position:relative">' +
        '<div class="bd-soc-body" id="bdSocBody"><div class="bd-empty">加载中…</div></div>' +
        '<div class="bd-soc-opts" id="bdSocOpts"><div class="bd-soc-optbox" id="bdSocOptBox"></div></div>' +
      '</div>';
  }
  function socAvatar(a) {
    const url = a && a.avatar ? a.avatar : '';
    return '<span class="bd-soc-av">' + (url
      ? '<img src="' + esc(url) + '" alt="" draggable="false">'
      : '<svg class="ic"><use href="#i-user"/></svg>') + '</span>';
  }
  async function loadSocial() {
    const box = document.getElementById('bdSocBody');
    if (!box) return;
    const tab = BD.socTab || 'players';
    document.querySelectorAll('#bdSheet .bd-soc-tab').forEach(b => b.classList.toggle('on', b.dataset.soc === tab));
    if (tab === 'code') {
      box.innerHTML = friendsBody();
      loadFrPane();
      return;
    }
    const r = await window.lmc.friendsGet().catch(() => null);
    friendsCache = (r && r.ok ? r.friends : friendsCache) || [];
    const pr = await window.lmc.friendsPresence().catch(() => null);
    const st = pr && pr.ok ? (pr.status || {}) : {};
    socPres = st;                       /* 「⋮ → 邀请联机」用这份判断在不在线 */
    const p = socPrefs();
    const kw = (BD.socQ || '').trim().toLowerCase();
    const list = friendsCache.filter(f => !kw ||
      String(f.name || '').toLowerCase().includes(kw) || String(f.code || '').toLowerCase().includes(kw));
    const isOn = f => !!(st[f.code] && st[f.code].online);
    const online = list.filter(isOn), offline = list.filter(f => !isOn(f));

    const row = (f) => {
      const on = isOn(f);
      const tags = (p.fav.includes(f.code) ? '<span class="bd-soc-tag">收藏</span>' : '') +
        (p.mute.includes(f.code) ? '<span class="bd-soc-tag">静音</span>' : '') +
        (p.block.includes(f.code) ? '<span class="bd-soc-tag">已拉黑</span>' : '') +
        (invPending(f.code) ? '<span class="bd-soc-tag inv">邀请中</span>' : '');
      return '<div class="bd-soc-row" data-socrow="' + esc(f.code) + '">' +
          socAvatar({ avatar: f.avatar }) +
          '<span class="bd-soc-nm"><b>' + esc(f.name || f.code) + tags + '</b>' +
            '<span>' + (on ? '在线' : '离线') + (f.code ? ' · ' + esc(f.code) : '') + '</span></span>' +
          '<button type="button" class="bd-soc-more" data-socmore="' + esc(f.code) + '" title="更多选项">⋮</button>' +
        '</div>';
    };

    const me = accActive() || { name: playerName() };
    box.innerHTML =
      '<div class="bd-soc-me live">' + socAvatar({ avatar: me.avatar }) +
        '<div class="bd-soc-nm"><b>' + esc(me.name || playerName()) + ' <i>(你)</i></b><span>在 Minecraft 菜单中</span></div>' +
      '</div>' +
      '<div class="bd-soc-sec">在线 (' + online.length + ')</div>' +
      (online.length ? '<div class="bd-soc-list">' + online.map(row).join('') + '</div>'
        : '<div class="bd-soc-empty">没有好友在线</div>') +
      '<div class="bd-soc-sec off">离线 (' + offline.length + ')</div>' +
      (offline.length ? '<div class="bd-soc-list">' + offline.map(row).join('') + '</div>'
        : '<div class="bd-soc-empty">还没有好友 —— 切到「好友码」加一个</div>');
    const n = document.getElementById('bdSocialN');
    if (n) n.textContent = online.length;
  }
  function socOpenOpts(code) {
    const ov = document.getElementById('bdSocOpts'), box = document.getElementById('bdSocOptBox');
    if (!ov || !box) return;
    const f = (friendsCache || []).find(x => x.code === code) || { name: code, code };
    const p = socPrefs();
    const has = arr => arr.includes(code);
    const online = !!(socPres[code] && socPres[code].online);
    const pend = invPending(code);
    box.innerHTML = '<div class="bd-soc-optttl">' + esc(f.name || code) + ' 的选项</div>' +
      /* 邀请联机：真的走 MQTT 信令（跟好友页那颗按钮同一条通道）——
         对方在线才可点，发出去以后 60 秒没回应算超时 */
      '<button type="button" class="bd-btn' + (online && !pend ? ' bd-green' : '') + '" data-popt="invite"' +
        (online && !pend ? '' : ' disabled') + '>' +
        (pend ? '邀请已发出，等待回应…' : '邀请联机') + '</button>' +
      (online || pend ? '' : '<div class="bd-soc-opt-hint">对方当前离线，等他打开启动器才能邀请</div>') +
      '<button type="button" class="bd-btn" data-popt="fav">' + (has(p.fav) ? '从收藏夹移除' : '添加到收藏夹') + '</button>' +
      '<button type="button" class="bd-btn" data-popt="mute">' + (has(p.mute) ? '取消静音' : '静音') + '</button>' +
      '<button type="button" class="bd-btn" data-popt="block">' + (has(p.block) ? '取消拉黑' : '拉黑') + '</button>' +
      '<button type="button" class="bd-btn" data-popt="report">举报</button>' +
      '<button type="button" class="bd-btn" data-popt="remove">移除好友</button>' +
      '<button type="button" class="bd-btn" data-popt="cancel">取消</button>';
    ov.classList.add('on');
    BD.socOptCode = code;
  }

  /* ---------------- 邀请联机（真实的联机信令，不是摆设） ----------------
   * 通道：main.js 的 friends:signal-send → 公共 MQTT 私聊频道（按好友码哈希）
   * 往返：invite → 对方 accept → 我这边 frHostForFriend 开陶瓦房间、把房间码发过去
   *       → 对方 frJoinRoom 核对模组后真的加入。这条链路跟好友页那颗「邀请联机」完全一样，
   *       这里只是多一层「在线才让点 / 发出后打标 / 超时提示」的界面逻辑。
   * 待办表直接用 renderer 的 S.frPending：对方同意或拒绝时，frHandleSignal 会来清它。
   */
  function frPendingMap() {
    try { if (typeof S !== 'undefined' && S && S.frPending instanceof Map) return S.frPending; } catch (_) {}
    return null;
  }
  function invPending(code) { const m = frPendingMap(); return !!(m && m.get(code)); }

  async function bdInviteFriend(code) {
    const f = (friendsCache || []).find(x => x.code === code) || { name: code, code };
    const nm = f.name || '好友';
    const st = socPres[code] || {};
    if (!st.online) { toast(nm + ' 不在线，没法邀请联机', 'warn'); return false; }
    if (invPending(code)) { toast('已经发过邀请了，等 ' + nm + ' 回应…'); return false; }
    const inviteId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const r = await window.lmc.friendsSignalSend({ to: code, payload: { type: 'invite', inviteId } }).catch(() => null);
    if (!r || !r.ok) {
      toast('邀请没发出去：' + ((r && r.error) || '联机信令服务未连上，检查网络后重试'), 'error');
      return false;
    }
    toast('已邀请 ' + nm + ' 联机，等待回应…');
    const m = frPendingMap();
    if (m) {
      const timer = setTimeout(() => {
        const p = m.get(code);
        if (p && p.inviteId === inviteId) {
          m.delete(code);
          toast(nm + ' 没有回应，邀请已超时', 'warn');
          if (document.getElementById('bdSocBody')) loadSocial();
        }
      }, 60000);
      m.set(code, { inviteId, btn: null, timer });
    }
    if (document.getElementById('bdSocBody')) loadSocial();   /* 行上立刻出现「邀请中」标签 */
    return true;
  }
  async function socAct(kind) {
    const code = BD.socOptCode;
    if (!code || kind === 'cancel') {
      const ov = document.getElementById('bdSocOpts');
      if (ov) ov.classList.remove('on');
      return;
    }
    const p = socPrefs();
    const toggle = arr => (arr.includes(code) ? arr.filter(x => x !== code) : arr.concat(code));
    if (kind === 'invite') {
      /* 先把弹层收掉再发：发送要等 IPC 往返，留在遮罩里什么反馈都看不见 */
      const ov0 = document.getElementById('bdSocOpts');
      if (ov0) ov0.classList.remove('on');
      await bdInviteFriend(code);
      return;
    }
    if (kind === 'fav') { p.fav = toggle(p.fav); socSavePrefs(p); toast(p.fav.includes(code) ? '已添加到收藏夹' : '已从收藏夹移除'); }
    else if (kind === 'mute') { p.mute = toggle(p.mute); socSavePrefs(p); toast(p.mute.includes(code) ? '已静音该玩家' : '已取消静音'); }
    else if (kind === 'block') { p.block = toggle(p.block); socSavePrefs(p); toast(p.block.includes(code) ? '已拉黑该玩家' : '已取消拉黑'); }
    else if (kind === 'report') { toast('已记录举报：' + code + '（本机记录）'); }
    else if (kind === 'remove') {
      try { const r = await window.lmc.friendsRemove({ code }); if (r && r.friends) friendsCache = r.friends; } catch (_) {}
      toast('已移除好友');
    }
    const ov = document.getElementById('bdSocOpts');
    if (ov) ov.classList.remove('on');
    loadSocial();
    if (typeof window.bdSync === 'function') { /* 好友变了，顺带刷新好友页 */ }
  }

  /* ---------------- 收到的联机邀请（基岩版弹层） ----------------
   * renderer 的 showInviteDialog 在基岩版主题下把邀请交给这里（window.BEDROCK.invite）。
   * 同意 = 回 accept 信令 → 对方 frHostForFriend 开房间、发房间码 → frJoinRoom 真的加入；
   * 拒绝 = 回 reject。协议与好友页一模一样，这里只把外观换成基岩版。
   */
  function inviteBody(inv) {
    return '<div class="bd-pane on bd-inv">' +
        '<div class="bd-inv-ic"><svg class="ic"><use href="#i-user-check"/></svg></div>' +
        '<div class="bd-inv-ttl">' + esc(inv.name || '好友') + ' 邀请你一起玩 MC</div>' +
        '<div class="bd-inv-sub">同意后会先核对房主的模组，再把你拉进同一个联机房间；' +
          '进游戏点「多人游戏」就能看到对方的世界。</div>' +
        '<div class="bd-inv-meta">好友码 ' + esc(inv.from || '—') + '</div>' +
      '</div>';
  }
  function showInvite(inv) {
    if (!isOn() || !inv || inv.type !== 'invite') return false;
    if (BD.kind === 'invite') { INV.queue.push(inv); return true; }   /* 一次只显示一个 */
    INV.cur = inv;
    openSheet('invite');
    playSfx('tick');
    return true;
  }
  function nextInvite() {
    if (!INV.queue.length) return;
    const inv = INV.queue.shift();
    if (!isOn()) {                        /* 期间切回普通模式了：交回 renderer 原来的弹窗 */
      try { if (typeof showInviteDialog === 'function') showInviteDialog(inv); } catch (_) {}
      return;
    }
    INV.cur = inv;
    openSheet('invite');
  }
  async function inviteAnswer(yes) {
    const inv = INV.cur || {};
    INV.cur = null;
    closeSheet();
    if (!inv.from) { nextInvite(); return; }
    let sent = false;
    try {
      const r = await window.lmc.friendsSignalSend({ to: inv.from, payload: { type: yes ? 'accept' : 'reject', inviteId: inv.inviteId } });
      sent = !!(r && r.ok);
    } catch (_) { sent = false; }
    if (yes) {
      if (!sent) {
        /* 回信没发出去：对方会一直等下去，直接说清楚，别让两边干等 */
        toast('同意没能发给 ' + (inv.name || '好友') + '（联机信令未连上），让他重新邀请一次', 'error');
        setTimeout(nextInvite, 260);
        return;
      }
      toast('已同意，等 ' + (inv.name || '好友') + ' 建好房间…');
      /* 基岩版下 gotoPage('mp') 会被折成「留在主菜单 + 打开联机弹层」，
         不会再掉回普通版联机页（1.4.8） */
      if (typeof gotoPage === 'function') gotoPage('mp');
      if (typeof mpSetStatus === 'function') mpSetStatus('正在加入 ' + (inv.name || '好友') + ' 的联机房间…', '等待对方创建房间，通常几秒内完成；房间码到了会自动加入。');
    } else {
      toast(sent ? '已拒绝 ' + (inv.name || '好友') + ' 的邀请' : '拒绝没能发出去（联机信令未连上）');
    }
    setTimeout(nextInvite, 260);
  }

  /* ---------------- 打开 / 关闭弹层 ---------------- */
  function openSheet(kind) {
    const root = document.getElementById('bdRoot');
    const sheet = document.getElementById('bdSheet');
    if (!root || !sheet) return;
    closeVers();
    /* 换弹层前先把上一次借走的 DOM 还回去，不然它会被 innerHTML 一起清掉 */
    unadoptAll(); destroyBig(); stopTaunt();
    /* 记住上一层的弹层：从「游戏」页点右上角「社交」，关掉社交要回到游戏页，
       而不是把人丢回主菜单（游戏里那个社交是盖在游戏页上的） */
    if (BD.kind && BD.kind !== kind) BD.prev = BD.kind;
    BD.kind = kind;
    sheet.className = 'bd-sheet';
    /* 满屏面板自己会铺满，遮罩就不用再压一层黑 —— 否则全景被 .bd-ov 的
       0.58 + 面板自身的底色叠两次，几乎全黑，等于没背景。
       1.4.13：联机 / 切换账户 / 更衣室也改成满屏，一并算进来 */
    const FULL_KINDS = { settings: 1, game: 1, lan: 1, accounts: 1, dress: 1 };
    root.classList.toggle('bd-full', !!FULL_KINDS[kind]);
    if (kind === 'settings') { repaintSettings(); }
    else if (kind === 'game') {
      /* 1.4.10：整页换成游戏里的「游戏」界面（顶部灰条 + 游戏/插件 两个通栏页签 + 石块面板） */
      sheet.className = 'bd-sheet bd-play';
      sheet.innerHTML = gameShell();
      const mn = document.getElementById('bdSocialN');
      const pn = document.getElementById('bdPlaySocN');
      if (mn && pn) pn.textContent = mn.textContent;
      /* 绿色「启动游戏」还是主页那颗 #bdPlay，借进页签右下角（事件与状态都还是它自己）。
         借完立刻 sync 一次 —— 按钮文字按「借没借进游戏页」在 进入游戏 / 启动游戏 之间切 */
      adoptOne(document.getElementById('bdPlay'), document.getElementById('bdGameSlot'));
      sync();
      loadGame();
      paintPlay(BD.play || 'game');
    } else if (kind === 'quit') {
      /* 基岩版全屏以后没有标题栏、没有关闭按钮：退出只能走这里（左上角「退出启动器」） */
      sheet.className = 'bd-sheet bd-sm';
      sheet.innerHTML = sheetHTML({ ttl: '退出启动器', sub: '关掉整个启动器' }, quitBody(),
        '<button type="button" class="bd-btn bd-danger" data-act="quitnow" data-sfx="back">退出启动器</button>' +
        '<button type="button" class="bd-btn" data-close data-sfx="click">取消</button>');
    } else if (kind === 'social') {
      sheet.className = 'bd-sheet bd-side';
      sheet.innerHTML = socialShell();
      loadSocial();
    } else if (kind === 'friends') {
      sheet.innerHTML = sheetHTML({ ttl: '好友', sub: '加好友 · 看谁在线 · 一键联机' }, friendsBody(),
        '<button type="button" class="bd-btn" data-open="lan">联机大厅</button><button type="button" class="bd-btn" data-close>关闭</button>');
      loadFrPane();
    } else if (kind === 'accounts') {
      /* 1.4.13：满屏面板（跟设置页同一套骨架，没有左侧分组导航） */
      sheet.className = 'bd-sheet bd-set';
      sheet.innerHTML = paneShell({
        ttl: '切换账户', tag: '账户 · 基岩版界面',
        head: '切换账户', sub: '点一行看它的皮肤 · 就地设为当前 · 也能直接加一个新账户',
        body: accountsBody(),
        left: '改动立即生效',
        foot: '<button type="button" class="bd-btn" data-close>关闭</button>'
      });
      loadAccPane();
    } else if (kind === 'dress') {
      sheet.className = 'bd-sheet bd-set';
      sheet.innerHTML = paneShell({
        ttl: '更衣室', tag: '皮肤 · 基岩版界面',
        head: '更衣室', sub: '看皮肤 · 摆动作 · 换皮肤 —— 跟账户页同一个 3D 渲染器',
        body: dressBody(),
        left: '拖动转视角 · 滚轮缩放',
        foot: '<button type="button" class="bd-btn" data-act="skinset">上传皮肤 / 换模型</button>' +
          '<button type="button" class="bd-btn" data-close>关闭</button>'
      });
      loadDressAcc();
    } else if (kind === 'lan') {
      sheet.className = 'bd-sheet bd-set';
      sheet.innerHTML = paneShell({
        ttl: '联机', tag: '陶瓦联机 · 基岩版界面',
        head: '联机', sub: '陶瓦联机 Terracotta · 建房 / 进房 / 模组核对，跟普通模式那份完全一样',
        cls: 'bd-lan', body: lanBody(),
        left: '内核版本对不上会 404，先去「重装内核」',
        foot: '<button type="button" class="bd-btn" data-close>关闭</button>'
      });
      ensureLan();
    } else if (kind === 'vers') {
      /* 左下角实例角标点开的就是它：点一行就地换版本（1.4.14） */
      sheet.className = 'bd-sheet bd-sm';
      sheet.innerHTML = sheetHTML({ ttl: '切换版本', sub: '当前实例 · 点一行就切过去' }, versBody(),
        '<button type="button" class="bd-btn" data-go="instances">管理实例 →</button>' +
        '<button type="button" class="bd-btn" data-close>关闭</button>');
    } else if (kind === 'rename') {
      /* 存档卡上的小铅笔点开的就是它（1.4.14） */
      sheet.className = 'bd-sheet bd-sm';
      sheet.innerHTML = sheetHTML({ ttl: '改世界名', sub: '只改显示名 · 存档内容与文件夹都不动' }, renameBody(BD.rename),
        '<button type="button" class="bd-btn bd-green" data-act="saverename">保存</button>' +
        '<button type="button" class="bd-btn" data-close>取消</button>');
      setTimeout(() => {
        const i = document.getElementById('bdRenameInp');
        if (i) { i.focus(); try { i.select(); } catch (_) {} }
      }, 60);
    } else if (kind === 'invite') {
      const inv = INV.cur || {};
      sheet.className = 'bd-sheet bd-sm';   /* 邀请是个小确认框：别撑成设置那种大面板 */
      sheet.innerHTML = sheetHTML({ ttl: '联机邀请', sub: '好友喊你一起玩' }, inviteBody(inv),
        '<button type="button" class="bd-btn bd-green" data-act="invok">同意 · 加入房间</button>' +
        '<button type="button" class="bd-btn" data-act="invno">拒绝</button>');
    }
    root.classList.add('on');
    root.setAttribute('aria-hidden', 'false');
    /* 弹层一开就把主菜单那层「藏起来」：按钮 / 标题 / 3D 角色 / 底栏都隐去，
       只留仍在转的全景当背景（1.4.9）。不然设置页半透明的时候，底下的
       「游戏 · 设置 · 联机 · 下载」还透出来，看着像糊了一层玻璃而不是打开菜单。 */
    document.body.classList.add('bd-veil');
  }
  function closeSheet() {
    const root = document.getElementById('bdRoot');
    if (!root || !root.classList.contains('on')) return;
    const prev = BD.prev || '';
    BD.prev = '';
    if (BD.kind === 'lan') { try { if (typeof mpStopPolling === 'function') mpStopPolling(); } catch (_) {} }
    stopTaunt();
    destroyBig();
    /* 插件面板还挂在弹层里的话先搬回普通页面（不然普通模式插件页会停在面板上） */
    plugPaneRestore(true);
    unadoptAll();
    /* 诊断那块 DOM 还挂在设置页签里的话，先还给 #page-diag —— 否则弹层一清空它就没了 */
    if (DG.host && DG.host.id === 'bdDiagPane') dgRelease();
    /* 邀请弹层被 ✕ / Esc 关掉 = 不回信，只把当前这条丢掉（不当作拒绝发给对方） */
    if (BD.kind === 'invite') INV.cur = null;
    root.classList.remove('on');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bd-veil');
    BD.kind = '';
    document.getElementById('bdSheet').innerHTML = '';
    /* 万一把弹层是从满屏诊断页上打开的：收起来以后把它重新挂回页面上，别留一块空面板 */
    const gpage = document.getElementById('page-bedrock-diag');
    if (gpage && gpage.classList.contains('active')) dgAdopt();
    /* 「启动游戏」借回主菜单以后，文字要变回「进入游戏」 */
    sync();
    /* 从「游戏」页开的社交面板：关掉以后回到游戏页，而不是甩回主菜单 */
    if (prev === 'game') openSheet('game');
  }

  /* ---------------- 保存与选项 ---------------- */
  async function saveCfg(patch) {
    try {
      const r = await window.lmc.saveConfig(patch);
      if (r && typeof r === 'object') S.config = r;
      else S.config = Object.assign({}, S.config, patch);
    } catch (_) { S.config = Object.assign({}, S.config, patch); }
    sync();
    return S.config;
  }
  function markSeg(key, val) {
    document.querySelectorAll('#bdSheet .bd-segbtn[data-set="' + key + '"]')
      .forEach(b => b.classList.toggle('on', String(b.dataset.val) === String(val)));
  }
  async function setOpt(key, val, btn) {
    const c = cfg();
    switch (key) {
      case 'theme': {
        if ((c.theme || 'dark') === val) return;
        S.config.theme = val;
        if (typeof applyPersonalize === 'function') applyPersonalize();
        await saveCfg({ theme: val });
        if (val === 'bedrock') {
          repaintSettings();
          toast('已切换到基岩版主题');
        } else {
          closeSheet();
          if (typeof gotoPage === 'function') gotoPage('home');
          toast(val === 'light' ? '已切换到浅色模式' : '已切换到深色模式');
        }
        break;
      }
      case 'uiSound': {
        const on = val === '1';
        c.uiSound = on;
        markSeg('uiSound', val);
        await saveCfg({ uiSound: on });
        if (on) playSfx('click');
        break;
      }
      case 'forceChinese': {
        const on = val === '1';
        c.forceChinese = on; markSeg(key, val);
        await saveCfg({ forceChinese: on });
        break;
      }
      case 'memAuto': {
        const on = val === '1';
        c.memAuto = on; markSeg(key, val);
        await saveCfg({ memAuto: on });
        break;
      }
      case 'launcherVisibility': {
        c.launcherVisibility = val; markSeg(key, val);
        await saveCfg({ launcherVisibility: val });
        break;
      }
      case 'forceIsolate': {
        c.forceIsolate = val; markSeg(key, val);
        await saveCfg({ forceIsolate: val });
        break;
      }
      case 'bgMode': {
        c.bgMode = val; markSeg(key, val);
        await saveCfg({ bgMode: val });
        if (typeof applyPersonalize === 'function') applyPersonalize();
        break;
      }
      case 'bdSky': {
        /* 主菜单背景：跟随时间 / 白天 / 黄昏 / 夜晚（1.4.14）—— 改完立刻生效 */
        c.bdSky = val; markSeg(key, val);
        await saveCfg({ bdSky: val });
        applySky();
        break;
      }
      default: break;
    }
  }

  /* ---------------- 设置里的输入框 ---------------- */
  let saveTimer = 0;
  function debounceSave(patch, ms) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveCfg(patch); }, ms || 350);
  }
  function onSheetInput(e) {
    const t = e.target;
    if (t.id === 'bdName') {
      const v = t.value.trim();
      const inp = document.getElementById('inpName');
      if (inp) inp.value = t.value;
      const su = document.getElementById('setUsername');
      if (su) su.value = t.value;
      const hn = document.getElementById('heroName');
      if (hn) hn.textContent = v || 'Steve';
      sync();
      debounceSave({ username: v || 'Steve' }, 500);
      return;
    }
    if (t.id === 'bdMem') {
      const v = Math.max(1, Math.min(32, +t.value || 4));
      const lab = document.getElementById('bdMemVal');
      if (lab) lab.textContent = v + ' GB';
      debounceSave({ mem: v }, 400);
      return;
    }
    if (t.id === 'bdVol') {
      const v = Math.max(0, Math.min(100, +t.value || 0));
      const lab = document.getElementById('bdVolVal');
      if (lab) lab.textContent = v + '%';
      debounceSave({ uiSoundVol: v / 100 }, 350);
      return;
    }
    if (t.id === 'bdSocSearch') {
      BD.socQ = t.value;
      if (BD.kind === 'social') loadSocial();
      return;
    }
  }
  function onSheetChange(e) {
    const t = e.target;
    if (t.id === 'bdGameVer') {
      const v = t.value;
      if (v && typeof selectVersion === 'function') { selectVersion(v, true); sync(); toast('已选择 ' + v); }
      return;
    }
    if (t.id === 'bdDefVer') {
      const v = t.value;
      saveCfg({ defaultVersion: v });
      if (v && typeof selectVersion === 'function') selectVersion(v, true);
      toast(v ? '默认启动实例：' + v : '默认实例跟随上次选择');
      return;
    }
    if (t.id === 'bdStartPage') {
      const v = t.value;
      const label = ({ home: '启动器主页', bedrock: '基岩版主菜单', download: '下载', instances: '实例管理',
        account: '账户 / 更衣室', friends: '好友', settings: '启动器设置' })[v] || v;
      saveCfg({ startPage: v });
      toast('下次打开启动器会进入「' + label + '」');
      return;
    }
    if (t.id === 'bdVol') playSfx('click');
  }

  /* ---------------- 各种点击动作 ---------------- */
  async function sheetAction(act, el) {
    if (act === 'preview') { playSfx('launch'); return; }
    /* 自定义控件（1.4.13）：先把设置页关掉，再回主菜单进调整模式 ——
       设置面板是满屏的，不关就跟主菜单叠一块了 */
    if (act === 'layoutedit') {
      closeSheet();
      setTimeout(() => leStart(), 80);
      return;
    }
    if (act === 'layoutreset') {
      leResetAll();
      toast('控件布局已恢复默认');
      return;
    }
    /* 存档改名：校验放主进程，这里只挡空名 / 没变的名字（1.4.14） */
    if (act === 'saverename') {
      const inp = document.getElementById('bdRenameInp');
      const name = ((inp && inp.value) || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
      const r = BD.rename || {};
      if (!name) { toast('名字不能为空', 'warn'); if (inp) inp.focus(); return; }
      if (!r.path) { toast('找不到这个存档的路径', 'error'); return; }
      if (name === r.name) { closeSheet(); openSheet('game'); return; }
      if (el) el.disabled = true;
      const res = await window.lmc.savesRename({ path: r.path, name }).catch(() => null);
      if (el) el.disabled = false;
      if (!res || !res.ok) { toast((res && res.error) || '改名失败', 'error'); return; }
      BD.rename = null;
      toast('已改名为「' + name + '」');
      /* 改完回到「游戏」页，列表会重新扫一遍，新名字立刻能看到 */
      closeSheet();
      openSheet('game');
      return;
    }
    if (act === 'copycode') {
      const code = (document.getElementById('bdFrCode') || {}).textContent || '';
      try { await navigator.clipboard.writeText(code); toast('好友码已复制'); }
      catch (_) { toast('复制失败，手动选中复制吧', 'warn'); }
      return;
    }
    if (act === 'addfriend') {
      const inp = document.getElementById('bdFrInput');
      const code = (inp && inp.value || '').trim().toUpperCase();
      if (!code) { toast('先输入好友码', 'warn'); return; }
      const btn = document.querySelector('#bdSheet [data-act="addfriend"]');
      if (btn) btn.disabled = true;
      const r = await window.lmc.friendsAdd({ code }).catch(() => null);
      if (btn) btn.disabled = false;
      if (!r || !r.ok) { toast((r && r.error) || '添加失败', 'error'); return; }
      if (inp) inp.value = '';
      toast('已添加好友');
      loadFrPane();
      return;
    }
    if (act === 'invite') {
      const code = el.dataset.invite;
      const f = friendsCache.find(x => x.code === code);
      if (!f) return;
      if (typeof frInvite === 'function') frInvite(f, el);
      return;
    }
    if (act === 'delfriend') {
      const code = el.dataset.del;
      const f = friendsCache.find(x => x.code === code);
      if (!f) return;
      if (typeof askConfirm === 'function' &&
          !(await askConfirm('移除好友「' + f.name + '」？', { detail: '只是从列表里删掉，对方不会收到通知；想再加回来输入好友码即可。', danger: true, okText: '移除' }))) return;
      const r = await window.lmc.friendsRemove({ code }).catch(() => null);
      if (!r || !r.ok) { toast((r && r.error) || '移除失败', 'error'); return; }
      toast('已移除 ' + f.name);
      loadFrPane();
      return;
    }
    if (act === 'addadopt') { ensureAccAdd(); return; }
    if (act === 'skinset') { openSkinSettings(SK.key ? accName() : ''); return; }
    if (act === 'openacc') { openSheet('accounts'); return; }
    if (act === 'invok') { await inviteAnswer(true); return; }
    if (act === 'invno') { await inviteAnswer(false); return; }
    /* ---- 关于 / 诊断页签 ---- */
    if (act === 'chkupd') { checkUpdNow(); return; }
    if (act === 'opendl') { openDownloadPage(); return; }
    if (act === 'diagdir') {
      const b = document.getElementById('btnDiagOpenDir');
      if (b) b.click();
      return;
    }
    /* ---- 游戏页 · 插件页签（跟普通模式「插件」页走同一套 IPC） ---- */
    if (act === 'plugrefresh') { loadPlugins(); return; }
    /* ---- 游戏页 · 实例页签（1.4.15） ---- */
    if (act === 'instrefresh') { await scanDir(); loadInstPane(); toast('已刷新'); return; }    if (act === 'plugback') { plugPaneRestore(); return; }
    if (act === 'plugtoggle') { await plugToggle(el.dataset.plug || ''); return; }
    if (act === 'plugopen') { plugOpen(el.dataset.plug || ''); return; }
    if (act === 'plugdir') { await plugDir(el.dataset.plug || ''); return; }
    if (act === 'plugdel') { await plugDel(el.dataset.plug || ''); return; }
    /* ---- 左上角「退出启动器」确认 ---- */
    if (act === 'quitnow') {
      try { window.lmc.win.close(); } catch (_) {}
      return;
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    const play = document.getElementById('bdPlay');
    if (!play) return;

    play.addEventListener('click', () => {
      if (S.gameRunning) { if (typeof stopGame === 'function') stopGame(); return; }
      if (S.launching) { toast('游戏正在启动中，请稍候…', 'warn'); return; }
      if (!insts().length) { toast('还没有安装任何版本，先去下载一个吧', 'warn'); gotoPage('download'); return; }
      const id = curVer();
      if (!id) { toast('先选一个版本', 'warn'); toggleVers(); return; }
      if (typeof startGame === 'function') startGame({ versionId: id });
    });

    const byId = (id) => document.getElementById(id);
    /* 主菜单四颗按钮：游戏 / 设置 / 联机（紫）/ 下载；右上角是社交 */
    if (byId('bdGame')) byId('bdGame').addEventListener('click', () => openSheet('game'));
    if (byId('bdSettings')) byId('bdSettings').addEventListener('click', () => openSheet('settings'));
    if (byId('bdLan')) byId('bdLan').addEventListener('click', () => openSheet('lan'));
    if (byId('bdDownload')) byId('bdDownload').addEventListener('click', () => gotoPage('download'));
    if (byId('bdSocial')) byId('bdSocial').addEventListener('click', () => openSheet('social'));
    /* 左上角开关：切回普通模式（深色）。跟设置里「关闭基岩版主题」是同一条路，
       落盘 / 清 body 类 / 回主页都由 setOpt 负责 */
    if (byId('bdMode')) byId('bdMode').addEventListener('click', () => { setOpt('theme', 'dark'); });
    /* 左上角「退出启动器」：基岩版全屏、没有标题栏，这是唯一的关闭入口（先问一遍再退） */
    if (byId('bdQuit')) byId('bdQuit').addEventListener('click', () => openSheet('quit'));
    /* 1.4.14 左下角：实例角标（点开就地换版本）/ 标语（点一下换一句）/ 下载进度（点进下载页） */
    if (byId('bdInst')) byId('bdInst').addEventListener('click', () => openSheet('vers'));
    if (byId('bdSplash')) byId('bdSplash').addEventListener('click', () => splashNext());
    if (byId('bdDlBar')) byId('bdDlBar').addEventListener('click', () => {
      closeSheet();
      gotoPage('download');
    });
    /* 基岩版诊断页：返回 / 记录目录（指回页头里原来那颗按钮） */
    if (byId('bdDiagBack')) byId('bdDiagBack').addEventListener('click', () => gotoPage('bedrock'));
    if (byId('bdDiagDir')) byId('bdDiagDir').addEventListener('click', () => {
      const b = byId('btnDiagOpenDir');
      if (b) b.click();
    });
    if (byId('bdDress')) byId('bdDress').addEventListener('click', () => openSheet('dress'));
    if (byId('bdAccount')) byId('bdAccount').addEventListener('click', () => openSheet('accounts'));
    /* 基岩版下载页：返回 / 分类 / 搜索 / 「更多资源」 */
    if (byId('bdDlBack')) byId('bdDlBack').addEventListener('click', () => gotoPage('bedrock'));
    if (byId('bdDlTabs')) byId('bdDlTabs').addEventListener('click', (e) => {
      const b = e.target.closest('.bd-segbtn');
      if (!b) return;
      const cat = b.dataset.cat || 'release';
      if (cat === DL.cat) return;
      byId('bdDlTabs').querySelectorAll('.bd-segbtn').forEach(x => x.classList.toggle('on', x === b));
      /* 换分类就把搜索词清掉：拿「sodium」去搜光影只会得到空列表 */
      DL.q = '';
      if (byId('bdDlSearch')) byId('bdDlSearch').value = '';
      clearTimeout(DL.timer);
      dlPick(cat);
    });
    if (byId('bdDlSearch')) byId('bdDlSearch').addEventListener('input', () => {
      DL.q = byId('bdDlSearch').value || '';
      if (DL_RES[DL.cat]) { dlMirrorSearch(DL.q); return; }   /* 资源列表自己有防抖，不用再挡一层 */
      clearTimeout(DL.timer);
      DL.timer = setTimeout(() => { if (!DL_RES[DL.cat]) dlRender(); }, 90);   /* 每敲一个字就重排 700 行会掉帧，压一下 */
    });
    if (byId('bdDlMore')) byId('bdDlMore').addEventListener('click', () => {
      /* 完整下载页唯一独有的功能：按 URL 下载任意文件。走它原来那个弹窗，不另写一份 */
      const b = document.getElementById('btnCustomDl');
      if (b) b.click(); else gotoPage('download', { full: true });
    });
    /* 下载页 · Java：一行一个 Java（用这个 / 复制路径）、四颗下载按钮、重新检测 / 打开目录 */
    if (byId('bdDlJava')) byId('bdDlJava').addEventListener('click', (e) => {
      const dl = e.target.closest('[data-jdl]');
      if (dl) { playSfx('click'); jvDownload(parseInt(dl.dataset.jdl, 10)); return; }
      const act = e.target.closest('[data-jact]');
      if (act) { jvAct(act.dataset.jact, act); return; }
      /* 点整行 = 用这个 Java（跟设置页「使用」那颗按钮一样的效果） */
      const row = e.target.closest('.bd-jv-row');
      if (row) jvAct('use', row.querySelector('[data-jact="use"]'));
    });
    /* 旧版主菜单里的版本下拉（弹层里还有一份 select，这里保留兼容） */
    if (byId('bdVerBtn')) byId('bdVerBtn').addEventListener('click', toggleVers);
    if (byId('bdVerPanel')) byId('bdVerPanel').addEventListener('click', (e) => {
      const row = e.target.closest('.bd-vrow');
      if (row) {
        playSfx('tick');
        selectVersion(row.dataset.ver, true);
        closeVers(); sync();
        toast('已选择 ' + row.dataset.ver);
        return;
      }
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        closeVers();
        /* 1.4.15：「管理实例」以前会 gotoPage('instances') 掉进普通模式的深色页，现在开游戏弹层的实例页签 */
        if (nav.dataset.nav === 'instances') openInstPane();
        else gotoPage('download');
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#bdPlay, #bdVerBtn, #bdVerPanel')) closeVers();
    });
    /* 右下角那个小人自己的动作条（站 / 走 / 坐）—— 和更衣室按钮是分开的两块 */
    document.querySelectorAll('#bdModel .bd-chip').forEach(b =>
      b.addEventListener('click', () => setAct(b.dataset.bdact)));
    document.getElementById('bdOv').addEventListener('click', () => { closeSheet(); playSfx('back'); });

    const sheet = document.getElementById('bdSheet');
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { closeSheet(); playSfx('back'); return; }
      /* ---- 实例页签里的行内动作（设为当前 / 启动 / 改名 / 目录 / 删除 / 展开基座，1.4.15） ---- */
      const ia = e.target.closest('[data-iact]');
      if (ia) { instAct(ia); return; }
      const tab = e.target.closest('.bd-tab');
      if (tab) { paintTab(tab.dataset.tab); return; }
      /* 游戏页的宽页签：游戏 / 插件 */
      const ptab = e.target.closest('.bd-ptab[data-ptab]');
      if (ptab) { paintPlay(ptab.dataset.ptab); playSfx('click'); return; }
      const sg = e.target.closest('.bd-segbtn');
      if (sg) { setOpt(sg.dataset.set, sg.dataset.val, sg); return; }
      const open = e.target.closest('[data-open]');
      if (open) { openSheet(open.dataset.open); return; }
      const chip = e.target.closest('.bd-chip[data-bdact]');
      if (chip) { setAct(chip.dataset.bdact); return; }
      const acc = e.target.closest('[data-acc]');
      if (acc) { switchAcc(acc.dataset.acc); return; }
      const accset = e.target.closest('[data-accset]');
      if (accset) { openSkinSettings(accset.dataset.accset); return; }
      const del = e.target.closest('[data-del]');
      if (del) { sheetAction('delfriend', del); return; }
      const view = e.target.closest('[data-view]');
      if (view) {
        const a = accList().find(x => x.name === view.dataset.view);
        if (a) { paintStage(SK.big, a); document.querySelectorAll('#bdSheet [data-view]').forEach(r => r.classList.toggle('on', r === view)); }
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) { sheetAction(act.dataset.act, act); return; }
      /* ---- 社交面板 ---- */
      const socTab = e.target.closest('.bd-soc-tab');
      if (socTab) { BD.socTab = socTab.dataset.soc; loadSocial(); return; }
      const socMore = e.target.closest('[data-socmore]');
      if (socMore) { socOpenOpts(socMore.dataset.socmore); return; }
      const popt = e.target.closest('[data-popt]');
      if (popt) { socAct(popt.dataset.popt); return; }
      if (e.target.id === 'bdSocOpts') { e.target.classList.remove('on'); return; }
      /* ---- 实例列表（左下角角标 → 切换版本，1.4.14） ---- */
      const pick = e.target.closest('[data-pickver]');
      if (pick) {
        const id = pick.dataset.pickver;
        if (id && typeof selectVersion === 'function') {
          selectVersion(id, true);
          sync();
          toast('已切到 ' + id);
        }
        closeSheet();
        return;
      }
      /* ---- 存档卡名字下面那支小铅笔：改世界名（1.4.14）。
             必须排在「点存档卡切实例」前面，否则点铅笔会连带把那行也触发掉 ---- */
      const sed = e.target.closest('[data-saveedit]');
      if (sed) {
        e.preventDefault();
        BD.rename = { path: sed.dataset.saveedit || '', name: sed.dataset.savename || '' };
        openSheet('rename');
        return;
      }
      /* ---- 「游戏」弹层里的存档卡片：切到它所在的实例 ---- */
      const world = e.target.closest('.bd-world[data-save]');
      if (world) {
        const inst = world.dataset.inst;
        if (inst && typeof selectVersion === 'function') {
          selectVersion(inst, true); sync();
          toast('已切到存档所在实例：' + inst);
        } else {
          toast('这个存档所在实例已经不在列表里了', 'warn');
        }
        return;
      }
      const go = e.target.closest('[data-go]');
      if (go) {
        /* 1.4.15：切版本弹层底下那颗「管理实例 →」留在基岩版里 */
        if (go.dataset.go === 'instances') { openInstPane(); return; }
        closeSheet(); gotoPage(go.dataset.go); return;
      }
      const inv = e.target.closest('[data-invite]');
      if (inv) { sheetAction('invite', inv); return; }
    });
    sheet.addEventListener('input', onSheetInput);
    sheet.addEventListener('change', onSheetChange);
    document.getElementById('bdSheet').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'bdFrInput') {
        const btn = document.querySelector('#bdSheet [data-act="addfriend"]');
        if (btn) btn.click();
      }
      /* 改名弹层里按回车 = 保存（1.4.14） */
      if (e.key === 'Enter' && e.target.id === 'bdRenameInp') {
        const btn = document.querySelector('#bdSheet [data-act="saverename"]');
        if (btn) { e.preventDefault(); btn.click(); }
      }
      /* 小铅笔是 span 冒充的按钮：Enter / 空格也要能触发 */
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList &&
          e.target.classList.contains('bd-world-edit')) {
        e.preventDefault(); e.target.click();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      /* 调整控件的时候 Esc = 完成（保存并退出），别让它顺手关掉什么 */
      if (LE.on) { leDone(true); return; }
      /* 空保护是必须的：#bdVerPanel 已经在 1.4.0 删掉了（版本下拉搬进「游戏」弹层），
         以前这里直接读 .classList，基岩版主菜单上每按一次 Esc 就抛 TypeError，
         而且异常发生在下面「下载页 / 诊断页回主菜单」之前 —— 那两个页面的 Esc 一并失效 */
      const root = document.getElementById('bdRoot');
      /* 插件面板开着的时候，Esc 先退回插件列表（跟游戏里「Esc = 上一级」一个意思），
         再按一次才关弹层 */
      if (root && root.classList.contains('on') && BD.plug) { plugPaneRestore(); return; }
      if (root && root.classList.contains('on')) { closeSheet(); return; }
      const vp = document.getElementById('bdVerPanel');
      if (vp && vp.classList.contains('on')) { closeVers(); return; }
      /* 下载页 / 诊断页：Esc = 回主菜单（跟游戏里返回上一级一样） */
      const dpage = document.getElementById('page-bedrock-dl');
      if (dpage && dpage.classList.contains('active')) { gotoPage('bedrock'); return; }
      const gpage = document.getElementById('page-bedrock-diag');
      if (gpage && gpage.classList.contains('active')) gotoPage('bedrock');
    });

    /* 全局点击音：只在基岩版主题下生效，且只对基岩版自己的控件发声 */
    document.addEventListener('click', (e) => {
      if (!isOn()) return;
      const t = e.target.closest('.bd-btn, .bd-tab, .bd-segbtn, .bd-vrow, .bd-navitem, .bd-vmanage, .bd-mode');
      if (!t || t.disabled) return;
      const kind = t.dataset.sfx ||
        (t.classList.contains('bd-vrow') || t.classList.contains('bd-navitem') || t.classList.contains('bd-vmanage') || t.classList.contains('bd-tab') ? 'tick' : 'click');
      playSfx(kind);
    }, true);

    /* 装完一个版本：人还停在基岩版下载页的话，把「已安装」标记刷出来
       （renderer 的 install:done 会先关弹窗、再 scanDir 重扫实例，所以延后一拍） */
    try {
      window.lmc.on('install:done', () => {
        const p = document.getElementById('page-bedrock-dl');
        if (!p || !p.classList.contains('active')) return;
        if (DL_RES[DL.cat]) return;      /* 资源列表装完不用重绘（会把翻到的页码顶回第一页） */
        setTimeout(() => { if (isOn()) dlRender(); }, 1200);
        setTimeout(() => { if (isOn()) dlRender(); }, 3200);
      });
    } catch (_) {}

    sync();
  }

  /* ---------------- 基岩版下载页（#page-bedrock-dl） ----------------
   * 主菜单「下载」不再落到启动器那套版本下载页，而是这一页：满屏全景 + 方块按钮。
   * 版本数据跟完整下载页是同一份官方清单（S.manifest，没加载就现拉一次）；
   * 安装直接调 renderer 的 openInstallModal —— 加载器选择 / 进度 / 取消 /
   * 「装完自检」全是原来的逻辑，这里一行没改，只换了版式。
   * 页面切换的映射（download → bedrock-dl）在 renderer.js 的 gotoPage 里。 */
  const DL = { cat: 'release', q: '', timer: null, area: null };
  const DL_CATS = {
    release: ['release'], snapshot: ['snapshot'],
    old: ['old_beta', 'old_alpha'],
    all: ['release', 'snapshot', 'old_beta', 'old_alpha']
  };
  /* 资源类页签：不重写搜索 / 安装 / 兼容性拦截那一整套（那是 renderer 里好几个函数 + 后端 IPC），
     改写为「把完整下载页对应的那一块 DOM 整块搬进来」—— 事件监听跟着节点走，搬过来照样能用；
     离开这一页再原样插回去。这里是每类的文案 / 搜索框 id / 空态提示。 */
  const DL_RES = {
    mod:          { area: 'resArea', ttl: 'MOD',    q: '#resSearch', ph: '搜索 MOD（支持中文，如「小地图」）…',
                    hint: 'MOD 装进所选实例的 mods —— 原版实例装不了，先装 Fabric / Forge / NeoForge' },
    modpack:      { area: 'mpArea',  ttl: '整合包', q: '#mpSearch',  ph: '搜索整合包（支持中文）…',
                    hint: '整合包会自动新建一个带加载器的实例，装完直接能玩' },
    resourcepack: { area: 'rpArea',  ttl: '资源包', q: '#rpSearch',  ph: '搜索资源包（支持中文）…',
                    hint: '资源包装进 resourcepacks，进游戏后在「资源包」里启用' },
    shader:       { area: 'spArea',  ttl: '光影',   q: '#spSearch',  ph: '搜索光影（支持中文，如「写实」）…',
                    hint: '光影装进 shaderpacks，游戏里用 Iris / OptiFine 选中即可生效' },
    datapack:     { area: 'dpArea',  ttl: '数据包', q: '#dpSearch',  ph: '搜索数据包（支持中文）…',
                    hint: '数据包装进所选存档的 datapacks，进世界自动生效' }
  };
  const DL_VER_HINT = '点任意一行装这个版本 —— 加载器（Vanilla / Fabric / Forge …）在弹窗里选';
  const DL_JAVA_HINT = '查看 / 安装 / 切换 Java 全在这一页 —— 下载装进游戏目录的 runtime，不碰系统 PATH';
  const dlBox = () => document.getElementById('bdDlList');
  function dlEmpty(html) {
    const box = dlBox();
    if (box) box.innerHTML = '<div class="bd-dl-empty">' + html + '</div>';
  }
  function dlRow(v, installed, isLatest) {
    const row = document.createElement('div');
    row.className = 'bd-item';
    row.dataset.ver = v.id;
    row.innerHTML =
      '<span class="bd-ic">' + (typeof blockIconHtml === 'function' ? blockIconHtml(v.type) : '') + '</span>' +
      '<div class="bd-item-main"><b>' + esc(v.id) +
        (isLatest ? '<span class="bd-tag cur">最新</span>' : '') +
        (installed ? '<span class="bd-tag inst">已安装</span>' : '') +
      '</b><span>' + esc((typeof typeName === 'function' ? typeName(v.type) : v.type) || '') +
        ' · ' + esc((typeof fmtDate === 'function' ? fmtDate(v.releaseTime) : '') || '—') + '</span></div>' +
      '<div class="bd-act"></div>';
    const act = row.querySelector('.bd-act');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bd-btn ' + (installed ? 'bd-mini' : 'bd-green');
    btn.dataset.sfx = 'click';
    btn.textContent = installed ? '再装一份' : '安装';
    btn.addEventListener('click', (e) => { e.stopPropagation(); dlInstall(v, installed); });
    act.appendChild(btn);
    row.addEventListener('click', () => dlInstall(v, installed));
    return row;
  }
  function dlInstall(v, installed) {
    playSfx('click');
    if (typeof openInstallModal === 'function') openInstallModal(v, !!installed);
    else toast('安装面板没准备好，去完整下载页试试', 'warn');
  }
  function dlRender() {
    const box = dlBox();
    if (!box) return;
    if (!S.manifest || !Array.isArray(S.manifest.versions)) { dlEmpty('正在获取版本清单…'); return; }
    const cats = DL_CATS[DL.cat] || DL_CATS.release;
    const q = DL.q.trim().toLowerCase();
    const latest = (S.manifest.latest || {}).release || '';
    const has = new Set(insts().map(v => v.id));
    const all = S.manifest.versions.filter(v => (q ? String(v.id).toLowerCase().includes(q) : cats.includes(v.type)));
    const LIMIT = 300;
    const list = all.slice(0, LIMIT);
    box.innerHTML = '';
    if (!list.length) dlEmpty('没有匹配的版本');
    list.forEach(v => box.appendChild(dlRow(v, has.has(v.id), v.id === latest)));
    /* 最新正式版顶到第一行：「全部 / 快照」里它常被一堆新快照压在下面，翻起来费劲 */
    const i = list.findIndex(v => v.id === latest);
    if (i > 0) box.insertBefore(box.children[i], box.children[0]);
    const cnt = document.getElementById('bdDlCount');
    if (cnt) cnt.textContent = all.length + ' 个版本' + (all.length > LIMIT ? '（显示前 ' + LIMIT + ' 个，用搜索缩小）' : '');
    const via = document.getElementById('bdDlVia');
    if (via) via.textContent = S.manifestVia ? '源：' + S.manifestVia : '';
  }
  async function dlLoad() {
    if (!S.manifest || !Array.isArray(S.manifest.versions)) {
      dlEmpty('正在获取版本清单…');
      let r = null;
      try { r = await window.lmc.getManifest(); } catch (_) {}
      if (!r || !r.ok) {
        dlEmpty('清单获取失败：' + esc((r && r.error) || '网络错误') +
          '<br>可以先去「启动器设置 → 下载源」换一个源再回来');
        return;
      }
      S.manifest = r.manifest;
      S.manifestVia = r.via;
    }
    dlRender();
  }
  /* ---- 资源类页签：借完整下载页的区块 ---- */
  function dlRelease() {
    const a = DL.area;
    if (!a) return;
    DL.area = null;
    try { a.el.style.display = 'none'; } catch (_) {}
    try { a.parent.insertBefore(a.el, a.next); } catch (_) { try { a.parent.appendChild(a.el); } catch (__) {} }
    const host = document.getElementById('bdDlRes');
    if (host) { host.classList.remove('on'); host.innerHTML = ''; }
  }
  function dlAdopt(cat) {
    const host = document.getElementById('bdDlRes');
    const ent = DL_RES[cat];
    if (!host || !ent || typeof DL_RES_TABS === 'undefined' || !DL_RES_TABS[cat]) return null;
    const area = document.getElementById(ent.area);
    if (!area) return null;
    if (DL.area && DL.area.el !== area) dlRelease();
    if (!DL.area) {
      DL.area = { el: area, parent: area.parentNode, next: area.nextSibling };
      /* 五个资源区互斥：跟完整下载页切 tab 一样先把别的收起来 */
      Object.keys(DL_RES_TABS).forEach(k => {
        const n = document.getElementById(DL_RES_TABS[k].area);
        if (n && n !== area) n.style.display = 'none';
      });
      host.appendChild(area);
    }
    area.style.display = '';
    host.classList.add('on');
    /* 区块自带的搜索框在这一页藏掉（顶部那条搜索框统一管），只剩搜索框的头部整条收起来 */
    const head = area.querySelector('.dl-res-head');
    if (head) {
      const onlySearch = !Array.from(head.children).some(n => !n.classList.contains('searchbox'));
      head.style.display = onlySearch ? 'none' : '';
    }
    /* 目标版本 / 存档下拉是靠实例与存档列表填的；刚扫完目录这里可能还是旧的 */
    try { if (typeof refreshAuxSelects === 'function') refreshAuxSelects(); } catch (_) {}
    const pg = DL_RES_TABS[cat].page();
    if (pg && !pg.loaded) { pg.loaded = true; pg.search(); }   /* 首次切过来自动拉热门 */
    else if (pg) pg.refresh();
    return pg;
  }
  /* 顶部搜索框 → 资源区自己的那个 input（它们是同一个查询的唯一入口，值要同步过去，
     再抛一个 input 事件让原来的防抖搜索跑起来，不用重新实现搜索） */
  function dlMirrorSearch(v) {
    const ent = DL_RES[DL.cat];
    if (!ent) return;
    const inp = document.querySelector(ent.q);
    if (!inp) return;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  /* 切分类：版本类走清单渲染，资源类把对应的 DOM 搬进来 */
  function dlPick(cat) {
    DL.cat = cat || 'release';
    const isJava = DL.cat === 'java';
    const res = !!DL_RES[DL.cat];
    const listBox = dlBox();
    const host = document.getElementById('bdDlRes');
    const jbox = document.getElementById('bdDlJava');
    const find = document.querySelector('#page-bedrock-dl .bd-dl-find');
    const meta = document.querySelector('#page-bedrock-dl .bd-dl-meta');
    const more = document.getElementById('bdDlMore');
    const ttl = document.getElementById('bdDlTtl');
    const hint = document.getElementById('bdDlHint');
    const inp = document.getElementById('bdDlSearch');
    if (ttl) ttl.textContent = isJava ? '下载 Java' : (res ? DL_RES[DL.cat].ttl : '下载游戏');
    if (hint) hint.textContent = isJava ? DL_JAVA_HINT : (res ? DL_RES[DL.cat].hint : DL_VER_HINT);
    if (inp) inp.placeholder = res ? DL_RES[DL.cat].ph : '搜索版本…';
    /* Java 这一页没有搜索、没有源信息、也没有「自定义文件」，三样都收起来 */
    if (meta) meta.style.display = (res || isJava) ? 'none' : '';
    if (find) find.style.display = isJava ? 'none' : '';
    if (more) more.style.display = isJava ? 'none' : '';
    if (jbox) jbox.classList.toggle('on', isJava);
    if (isJava) {
      dlRelease();
      if (host) host.classList.remove('on');
      if (listBox) listBox.style.display = 'none';
      jvEnter();
      return null;
    }
    if (res) {
      if (listBox) listBox.style.display = 'none';
      const ent = DL_RES[DL.cat];
      const rq = ent && document.querySelector(ent.q);
      if (rq) rq.value = DL.q;      /* 把顶部搜索框的值同步给资源区的 input */
      return dlAdopt(DL.cat);
    }
    dlRelease();
    if (host) host.classList.remove('on');
    if (listBox) listBox.style.display = '';
    dlLoad();
    return null;
  }

  /* 对外：进页面 / 装完 / 从主题切回来都刷一遍（幂等，数据没变时只是重绘） */
  function dlRefresh() {
    if (!document.getElementById('bdDlList')) return;
    if (DL.cat === 'java') { jvEnter(true); return; }
    if (DL_RES[DL.cat]) { dlPick(DL.cat); return; }
    dlRelease();
    dlLoad();
  }

  /* ---------------- Java（1.4.14 下载页里的独立分类） ----------------
   * 为什么要有这一页：普通模式里「换 Java / 下 Java」藏在启动器设置里，基岩版用户
   * 一旦点进去就掉回普通界面。这里把同样三件事（看 / 下 / 换）做成基岩版自己的一页，
   * 接口全走主进程现成的 java:list / java:detect / java:download —— 逻辑不复制，
   * 只是换一身皮；按钮一个都不许「点了没反应」或「跳去普通页」。 */
  const JV = { list: [], busy: 0, pct: 0, text: '', watched: false };
  const JV_MAJORS = [8, 17, 21, 25];
  const JV_NEED = { 8: '1.16.5 及更早', 17: '1.18 – 1.20.4', 21: '1.20.5 – 1.21.11', 25: '26.1 及以后' };
  const jvBox = () => document.getElementById('bdDlJava');
  const jvCur = () => String(cfg().javaPath || '');
  const jvSame = (a, b) => !!a && !!b && a.toLowerCase().replace(/\//g, '\\') === b.toLowerCase().replace(/\//g, '\\');

  function jvRow(j) {
    const cur = jvSame(jvCur(), j.path);
    return '<div class="bd-jv-row' + (cur ? ' cur' : '') + '" data-jpath="' + esc(j.path) + '">' +
      '<div class="bd-jv-main"><b>Java ' + (j.major || '?') +
        (j.major && j.major < 17 ? '<span class="bd-tag">低于推荐</span>' : '') +
        (cur ? '<span class="bd-tag inst">当前</span>' : '') +
      '</b><i title="' + esc(j.path) + '">' + esc(j.path) + (j.ver ? ' · ' + esc(j.ver) : '') + '</i></div>' +
      '<div class="bd-jv-acts">' +
        '<button type="button" class="bd-btn bd-mini" data-jact="use"' + (cur ? ' disabled' : '') + '>' + (cur ? '正在用' : '用这个') + '</button>' +
        '<button type="button" class="bd-btn bd-mini" data-jact="copy">复制路径</button>' +
      '</div></div>';
  }

  function jvPaint() {
    const box = jvBox();
    if (!box) return;
    const list = Array.isArray(JV.list) ? JV.list : [];
    const cur = jvCur();
    const rows = list.length ? list.map(jvRow).join('') :
      '<div class="bd-jv-empty">这台电脑上还没找到现成的 Java。<br>点下面的 <b>Java 21</b>（最通用）下一个就行，约 1–5 分钟。</div>';
    const pct = Math.max(0, Math.min(100, Math.round(JV.pct || 0)));
    box.innerHTML =
      '<div class="bd-jv-scroll' + (list.length ? '' : ' empty') + '">' +
        '<div class="bd-jv-hd"><b>' + (list.length ? '已检测到 ' + list.length + ' 个 Java' : '还没检测到 Java') + '</b>' +
          '<span class="bd-jv-cur" title="' + esc(cur) + '">' + (cur ? '当前：' + esc(cur) : '当前：未指定，启动时按版本自动挑') + '</span></div>' +
        rows +
        '<div class="bd-jv-hd" style="margin-top:6px"><b>下载 Java</b><span>游戏要哪个就下哪个，已装过直接复用</span></div>' +
        '<div class="bd-jv-dl">' + JV_MAJORS.map(m =>
          '<button type="button" class="bd-btn bd-green" data-jdl="' + m + '"' + (JV.busy ? ' disabled' : '') + '>' +
            'Java ' + m + '<span class="bd-jv-need">' + JV_NEED[m] + '</span></button>').join('') +
        '</div>' +
        '<div class="bd-jv-prog' + (JV.busy ? ' on' : '') + '">' +
          '<div class="bd-jv-prog-tx"><span id="bdJvTx">' + esc(JV.busy ? JV.text : '') + '</span>' +
            '<span id="bdJvPct">' + pct + '%</span></div>' +
          '<div class="bd-jv-prog-bar"><div class="bd-jv-prog-fill" id="bdJvFill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="bd-jv-note">Java 是跑 Minecraft 要的运行环境，系统里<b>已经装好的也能直接用</b>（上面列出来的就是）。' +
          '这里的下载走多源自动回退，装进游戏目录的 <b>runtime</b> 文件夹，不动系统 PATH、不需要管理员权限。</div>' +
      '</div>' +
      '<div class="bd-jv-foot">' +
        '<button type="button" class="bd-btn bd-mini" data-jact="detect">重新检测</button>' +
        '<button type="button" class="bd-btn bd-mini" data-jact="dir">打开运行时目录</button>' +
      '</div>';
  }
  /* 下载中的进度：只动那三个节点，不整块重绘（重绘会把按钮的禁用态闪一下） */
  function jvProgPaint() {
    const pct = Math.max(0, Math.min(100, Math.round(JV.pct || 0)));
    const wrap = document.querySelector('#bdDlJava .bd-jv-prog');
    if (wrap) wrap.classList.toggle('on', !!JV.busy);
    const tx = document.getElementById('bdJvTx');
    const pc = document.getElementById('bdJvPct');
    const fl = document.getElementById('bdJvFill');
    if (tx) tx.textContent = JV.text || '下载中';
    if (pc) pc.textContent = pct + '%';
    if (fl) fl.style.width = pct + '%';
  }
  async function jvLoad(quiet) {
    let list = [];
    try {
      const r = await window.lmc.javaList();
      list = (r && r.javas) || [];
    } catch (_) { list = []; }
    JV.list = list;
    jvPaint();
    return list;
  }
  /* 进这一页：第一次进来先静默扫一遍（java:list 不弹提示），之后每次进来重扫，
     用户可能刚在别处装了个 Java */
  function jvEnter(refresh) {
    jvWatch();
    jvPaint();
    jvLoad(!!refresh);
  }
  async function jvDetect(btn) {
    if (btn) btn.disabled = true;
    let list = [];
    try { list = await window.lmc.detectJava(); } catch (_) {}
    if (btn) btn.disabled = false;
    JV.list = Array.isArray(list) ? list : [];
    jvPaint();
    return JV.list;
  }
  async function jvSetDefault(p) {
    if (!p) return;
    try { S.config = await window.lmc.saveConfig({ javaPath: p }); } catch (_) {}
    /* 普通模式设置页那个输入框同步一份：不然回头在设置页点「保存」会把它覆盖回去 */
    const inp = document.getElementById('setJavaPath');
    if (inp) inp.value = p;
    const j = (JV.list || []).find(x => jvSame(x.path, p));
    toast(j ? ('默认 Java 已切成 Java ' + j.major) : '默认 Java 已切换');
    playSfx('click');
    jvPaint();
  }
  async function jvDownload(major) {
    if (JV.busy) { toast('Java ' + JV.busy + ' 还在下，等它装完再点', 'warn'); return; }
    const had = jvCur();
    JV.busy = major; JV.pct = 0; JV.text = '准备下载 Java ' + major;
    jvPaint();
    let r = null;
    try { r = await window.lmc.javaDownload(major); } catch (e) { r = { ok: false, error: e && e.message }; }
    JV.busy = 0; JV.pct = 0;
    if (!r || !r.ok) {
      jvPaint();
      toast('Java ' + major + ' 装失败：' + ((r && r.error) || '网络错误'), 'error');
      return;
    }
    await jvLoad(true);
    /* 原来没指定过 Java 的，装完直接当默认 —— 否则「下了还是用不上」，用户会以为没生效 */
    if (!had && r.javaw) await jvSetDefault(r.javaw);
    else { jvPaint(); toast('Java ' + major + ' 装好了'); }
  }
  async function jvAct(act, btn) {
    const row = btn && btn.closest('.bd-jv-row');
    if (act === 'use') { await jvSetDefault(row && row.dataset.jpath); return; }
    if (act === 'copy') {
      playSfx('click');
      const p = row && row.dataset.jpath;
      try { await window.lmc.copyText(p); toast('路径已复制'); } catch (_) { toast('复制失败', 'error'); }
      return;
    }
    if (act === 'detect') { playSfx('click'); await jvDetect(btn); return; }
    if (act === 'dir') {
      playSfx('click');
      let r = null;
      try { r = await window.lmc.javaOpenRuntime(); } catch (_) {}
      if (!r || !r.ok) toast('打不开运行时目录：' + ((r && r.error) || '还没下过 Java'), 'warn');
      return;
    }
  }
  function jvWatch() {
    if (JV.watched) return;
    JV.watched = true;
    try {
      window.lmc.on('install:progress', (d) => {
        if (!d || !JV.busy) return;
        if (typeof d.percent === 'number' && !isNaN(d.percent)) JV.pct = d.percent;
        if (d.text) JV.text = d.text;
        jvProgPaint();
      });
    } catch (_) {}
  }

  /* ---------------- 诊断（1.4.5 独立页，1.4.6 又成了设置里的页签） ----------------
     内容**整块借** #page-diag 的元素（跟下载页借资源区块同一个手法）：崩溃分析、
     实例完整性检查、AI 深度分析、启动器崩溃记录全是 renderer 原来那套，事件跟着节点走。
     页头（.page-head）一起借过来，CSS 里藏掉 —— 页签顶栏和诊断页顶栏各自有「记录目录」。
     两个宿主（设置页签 #bdDiagPane / 满屏诊断页 #bdDiagBody）共用一份节点，
     谁先占谁拿着，退出 / 换页签时按原位置还回 #page-diag。 */
  const DG = { nodes: [], host: null };
  function dgFill() {
    /* 这两件原来进诊断页时就做，现在进页签 / 进诊断页都要做一次 */
    try { if (typeof fillDiagInstances === 'function') fillDiagInstances(); } catch (_) {}
    try { if (typeof refreshDiagLauncher === 'function') refreshDiagLauncher(); } catch (_) {}
  }
  function dgMount(host) {
    if (!host) return;
    if (DG.host === host) { dgFill(); return; }
    dgRelease();                       /* 先把节点收回 #page-diag，再一次性搬过去 */
    const page = document.getElementById('page-diag');
    if (!page) return;
    DG.nodes = Array.from(page.children).map(el => ({ el, next: el.nextSibling }));
    DG.nodes.forEach(x => host.appendChild(x.el));
    DG.host = host;
    dgFill();
  }
  function dgAdopt() { dgMount(document.getElementById('bdDiagBody')); }
  function dgRelease() {
    if (!DG.nodes.length) { DG.host = null; return; }
    const page = document.getElementById('page-diag');
    DG.host = null;
    if (!page) { DG.nodes = []; return; }
    /* 倒着插回原位：最后一项的 next 已经是页面里现成的节点（或被搬走的兄弟已就位），
       这样能原样还原顺序，不会变成倒序 */
    for (let i = DG.nodes.length - 1; i >= 0; i--) {
      const x = DG.nodes[i];
      const nxt = x.next && x.next.parentNode === page ? x.next : null;
      page.insertBefore(x.el, nxt);
    }
    DG.nodes = [];
  }

  /* ---------------- 关于页：检查更新 ----------------
     跟普通界面「设置 → 版本更新」那张卡做的是同一件事（同一个 update:check 接口），
     只是结果自己渲染成基岩版样式 —— 不去动 #updResult / #updState 那些原生节点，
     免得两边互相覆盖。 */
  const UPB = { info: null, busy: false };
  const UPD_DEFAULT_PAGE = 'https://xlc-ce-launcher.app.workbuddy.host/download.html?sharecode=FTJRRJTHES';
  function updState(kind, text) {
    const st = document.getElementById('bdUpdState');
    if (st) st.className = 'bd-upd-state' + (kind ? ' ' + kind : '');
    const tx = document.getElementById('bdUpdStateTx');
    if (tx && text) tx.textContent = text;
  }
  function updTime(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString('zh-CN', { hour12: false }); } catch (_) { return '—'; }
  }
  function renderUpd(info) {
    const box = document.getElementById('bdUpdOut');
    if (!box) return;
    if (!info) {
      updState('', '尚未检测');
      box.innerHTML = '<div class="bd-empty">点「检查更新」从官方下载页读取最新版本。</div>';
      return;
    }
    if (info.ok === false) {
      updState('err', '检测失败');
      box.innerHTML = '<div class="bd-upd-box err"><b>检测更新失败</b><p>' + esc(info.error || '未知错误') + '</p>' +
        '<p>可以点「打开下载页」自己去官网看最新版本。</p></div>';
      return;
    }
    if (info.skippedPre) {
      updState('ok', '已跳过快照版 ' + info.latest);
      box.innerHTML = '<div class="bd-upd-box"><b>更新源上的 ' + esc(info.latest) + ' 是快照 / 预发布版，已按设置跳过</b>' +
        '<p>启动器设置里开着「跳过快照版更新」。想尝鲜就关掉它，再点一次「检查更新」。</p>' +
        '<p class="bd-upd-time">检测时间：' + updTime(info.checkedAt) + '</p></div>';
      return;
    }
    if (!info.hasUpdate) {
      updState('ok', '已是最新版本');
      box.innerHTML = '<div class="bd-upd-box"><b>已是最新版本 · ' + esc(info.current || (cfg().appVersion || '—')) + '</b>' +
        '<p>' + (info.newerThanRemote
          ? '当前版本比更新源上的还要新（本地开发版？）。'
          : '更新源上的最新版本是 ' + esc(info.latest || '—') + (info.preRelease ? '（快照 / 预发布版）' : '') + '，和当前版本一致。') + '</p>' +
        '<p class="bd-upd-time">检测时间：' + updTime(info.checkedAt) + '</p></div>';
      return;
    }
    updState('new', '发现新版本 ' + info.latest);
    box.innerHTML = '<div class="bd-upd-box new"><b>发现新版本 ' + esc(info.latest) + '（当前 ' + esc(info.current || '—') + '）</b>' +
      '<p>去官网下载页下新版本，装好就是新版了。</p>' +
      (info.notes ? '<div class="bd-upd-notes">' + esc(info.notes) + '</div>' : '') +
      '<div class="bd-upd-acts"><button type="button" class="bd-btn bd-green" data-act="opendl" data-sfx="click">前往下载页</button></div></div>';
  }
  async function checkUpdNow() {
    if (UPB.busy) return null;
    UPB.busy = true;
    updState('busy', '正在检测…');
    const box = document.getElementById('bdUpdOut');
    if (box) box.innerHTML = '<div class="bd-empty">正在检测更新…</div>';
    let info;
    try { info = await window.lmc.updateCheck({}); }
    catch (e) { info = { ok: false, error: e.message || String(e) }; }
    UPB.busy = false;
    UPB.info = info;
    /* 检测期间可能已经把弹层关了 —— renderUpd 自己会做空保护 */
    renderUpd(info);
    if (info && info.ok && info.hasUpdate) toast('发现新版本 ' + info.latest + '，可在「关于」里更新', 'warn');
    return info;
  }
  /* 进「关于」页签：有结果就重画，没有就先看主进程缓存的（不主动联网，免得每次开设置都打一次网络） */
  async function loadUpdPane() {
    if (!document.getElementById('bdUpdOut')) return;
    if (UPB.info) { renderUpd(UPB.info); return; }
    const cached = await window.lmc.updateCached().catch(() => null);
    if (cached && document.getElementById('bdUpdOut')) { UPB.info = cached; renderUpd(cached); }
  }
  function openDownloadPage() {
    const u = cfg().downloadPageUrl || UPD_DEFAULT_PAGE;
    window.lmc.openUrl(u).catch(() => toast('无法打开下载页', 'error'));
  }

  /* ---------------- 全景背景：长条横移（JS 逐帧驱动） ----------------
     为什么不用 CSS animation：styles.css 里有 @media (prefers-reduced-motion:reduce)
     把 animation-duration 压成 .001ms —— 系统开了「减少动画」的机器上背景会彻底不动
     （1.4.0 用户看到的「背景图不转」就是这个原因）。改用 rAF 逐帧改 transform，稳定生效。
     条带横移 25% 正好转过 90°，图是按 4 面拼的，循环回起点无缝。
     主菜单和下载页各有一条同样的长条（.bd-pano-strip），这里一起推，两边同步转。 */
  const PANO_LOOP_MS = 30000;         /* 30 秒转 90°（≈3°/s），肉眼能看出在转又不晕 */
  function spinPano() {
    const strips = Array.from(document.querySelectorAll('.bd-pano-strip'));
    if (!strips.length) return;
    let pos = 0;
    let last = performance.now();
    const step = (t) => {
      const dt = Math.min(t - last, 120);
      last = t;
      if (isOn()) {
        pos = (pos + (dt / PANO_LOOP_MS) * 25) % 25;
        const tf = 'translateX(' + (-pos).toFixed(3) + '%)';
        strips.forEach(s => { s.style.transform = tf; });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- 自定义控件（1.4.13）：主菜单每一块都能自己摆 ----------------
     数据：config.bdLayout = { bdGame: { x, y, s }, … }（x / y 像素偏移，s 缩放倍数）
     应用：给元素打 inline transform。必须 !important —— 标题图那条 bdFloat 上下浮动
           动画会盖掉普通 inline 样式；代价是「自己摆过位置的标题」不再浮动，能接受。
     调整：不直接拖元素本身，而是在上面铺一层命中框（#bdLeHits）：
           一个控件一个虚线框，拖框 = 移动，拖框右下角小方块 = 缩放。
           这样标题图（<img> 里塞不进手柄节点）、按钮自身的 click、canvas 拖拽视角
           都不会被搅乱；退出时整层一删，页面回到 0 改动。
     -------------------------------------------------------------------- */
  const LE_ITEMS = [
    ['bdLogo', '标题'],
    ['bdGame', '游戏按钮'],
    ['bdSettings', '设置按钮'],
    ['bdLan', '联机按钮'],
    ['bdDownload', '下载按钮'],
    ['bdSocial', '社交'],
    ['bdMode', '普通模式开关'],
    ['bdQuit', '退出启动器'],
    ['bdModel', '3D 角色'],
    ['bdTip', '提示文字'],
    ['bdFoot', '底部信息条']
  ];
  const LE = { on: false, sel: '', drag: null };

  function leStore() {
    const c = cfg();
    if (!c.bdLayout || typeof c.bdLayout !== 'object' || Array.isArray(c.bdLayout)) c.bdLayout = {};
    return c.bdLayout;
  }
  function leGet(id) {
    const v = leStore()[id];
    if (!v || typeof v !== 'object') return null;
    const x = Number(v.x) || 0, y = Number(v.y) || 0, s = Number(v.s) || 1;
    if (!x && !y && Math.abs(s - 1) < 0.001) return null;
    return { x, y, s };
  }
  function lePaintOne(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = leGet(id);
    if (!v) {
      el.style.removeProperty('transform');
      el.style.removeProperty('transform-origin');
      el.style.removeProperty('animation');
      el.classList.remove('bd-le-cus');
      return;
    }
    el.style.setProperty('transform-origin', '0 0', 'important');
    el.style.setProperty('transform',
      'translate(' + Math.round(v.x) + 'px,' + Math.round(v.y) + 'px) scale(' + v.s + ')', 'important');
    if (id === 'bdLogo') el.style.setProperty('animation', 'none', 'important');
    el.classList.add('bd-le-cus');
  }
  function leApply() { LE_ITEMS.forEach(it => lePaintOne(it[0])); }
  function leSyncHits() {
    const layer = document.getElementById('bdLeHits');
    if (!layer) return;
    LE_ITEMS.forEach(it => {
      const hit = layer.querySelector('.bd-le-hit[data-le="' + it[0] + '"]');
      const el = document.getElementById(it[0]);
      if (!hit) return;
      if (!el) { hit.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) { hit.style.display = 'none'; return; }
      hit.style.display = 'block';
      hit.style.left = Math.round(r.left) + 'px';
      hit.style.top = Math.round(r.top) + 'px';
      hit.style.width = Math.round(r.width) + 'px';
      hit.style.height = Math.round(r.height) + 'px';
      hit.classList.toggle('sel', LE.sel === it[0]);
    });
  }
  function leInfo() {
    const box = document.getElementById('bdLeInfo');
    if (!box) return;
    if (!LE.sel) { box.textContent = '点一个控件看数值'; return; }
    const it = LE_ITEMS.find(x => x[0] === LE.sel);
    const v = leGet(LE.sel) || { x: 0, y: 0, s: 1 };
    box.textContent = (it ? it[1] : LE.sel) + ' · X ' + Math.round(v.x) + ' / Y ' + Math.round(v.y) +
      ' · 大小 ' + Math.round(v.s * 100) + '%';
  }
  function leSet(id, v) {
    const st = leStore();
    if (!v || (!Math.round(v.x) && !Math.round(v.y) && Math.abs(v.s - 1) < 0.005)) delete st[id];
    else st[id] = { x: Math.round(v.x), y: Math.round(v.y), s: Math.round(v.s * 100) / 100 };
    lePaintOne(id);
    leSyncHits();
    leInfo();
  }
  function leKill() {
    ['bdLeBar', 'bdLeHits'].forEach(id => { const n = document.getElementById(id); if (n) n.remove(); });
  }
  function leBuild() {
    leKill();
    const bar = document.createElement('div');
    bar.className = 'bd-le-bar';
    bar.id = 'bdLeBar';
    bar.innerHTML =
      '<span class="bd-le-t">自定义控件</span>' +
      '<span class="bd-le-tip">拖虚线框移动 · 拖右下角小方块改大小</span>' +
      '<span class="bd-le-info" id="bdLeInfo">点一个控件看数值</span>' +
      '<button type="button" class="bd-btn bd-mini" data-le="resetsel">复位这块</button>' +
      '<button type="button" class="bd-btn bd-mini" data-le="resetall">全部复位</button>' +
      '<button type="button" class="bd-btn bd-green bd-mini" data-le="done">完成</button>';
    const layer = document.createElement('div');
    layer.className = 'bd-le-hits';
    layer.id = 'bdLeHits';
    layer.innerHTML = LE_ITEMS.map(it =>
      '<div class="bd-le-hit" data-le="' + it[0] + '" title="' + it[1] + '"><i class="bd-le-g" title="拖我改大小"></i></div>').join('');
    document.body.appendChild(bar);
    document.body.appendChild(layer);

    layer.addEventListener('pointerdown', (e) => {
      const hit = e.target.closest('.bd-le-hit');
      if (!hit) return;
      const id = hit.dataset.le;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      LE.sel = id;
      leSyncHits();
      leInfo();
      const v = leGet(id) || { x: 0, y: 0, s: 1 };
      const r = el.getBoundingClientRect();
      LE.drag = {
        id,
        mode: e.target.classList.contains('bd-le-g') ? 'size' : 'move',
        sx: e.clientX, sy: e.clientY,
        x0: v.x, y0: v.y, s0: v.s,
        w: Math.max(32, r.width), h: Math.max(32, r.height)
      };
      try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    });
    layer.addEventListener('pointermove', (e) => {
      const d = LE.drag;
      if (!d) return;
      e.preventDefault();
      if (d.mode === 'size') {
        /* 右下角那个把：横向拖多少按元素自身宽度折算成缩放，纵向给 0.6 的辅助分量，
           高一点的块（3D 角色、标题图）竖着拉也能放大 */
        const base = Math.max(40, d.w * d.s0);
        const dd = (e.clientX - d.sx) + (e.clientY - d.sy) * 0.6;
        let s = d.s0 + dd / base;
        s = Math.max(0.4, Math.min(3, s));
        leSet(d.id, { x: d.x0, y: d.y0, s });
      } else {
        leSet(d.id, { x: d.x0 + e.clientX - d.sx, y: d.y0 + e.clientY - d.sy, s: d.s0 });
      }
    });
    const stop = () => { LE.drag = null; };
    layer.addEventListener('pointerup', stop);
    layer.addEventListener('pointercancel', stop);
    layer.addEventListener('lostpointercapture', stop);

    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-le]');
      if (!b) return;
      playSfx('tick');
      const a = b.dataset.le;
      if (a === 'done') { leDone(true); return; }
      if (a === 'resetall') {
        const st = leStore();
        Object.keys(st).forEach(k => delete st[k]);
        leApply();
        leSyncHits();
        leInfo();
        toast('控件已全部回到默认位置');
        return;
      }
      if (a === 'resetsel') {
        if (!LE.sel) { toast('先点一下要复位的控件', 'warn'); return; }
        leSet(LE.sel, null);
        toast('这一块已复位');
      }
    });
    window.addEventListener('resize', leSyncHits);
  }
  function leStart() {
    if (!isOn()) return;
    const page = document.getElementById('page-bedrock');
    if (!page) return;
    if (BD.kind) closeSheet();
    if (!page.classList.contains('active')) {
      if (typeof gotoPage === 'function') gotoPage('bedrock', { full: true });
    }
    LE.on = true;
    LE.sel = '';
    LE.drag = null;
    document.body.classList.add('bd-le-edit');
    leBuild();
    leApply();
    leSyncHits();
    leInfo();
    playSfx('click');
    toast('拖动虚线框摆位置，拖右下角小方块改大小');
  }
  function leDone(save) {
    if (!LE.on) return;
    LE.on = false;
    LE.drag = null;
    window.removeEventListener('resize', leSyncHits);
    leKill();
    document.body.classList.remove('bd-le-edit');
    leApply();
    if (save !== false) {
      let snap = {};
      try { snap = JSON.parse(JSON.stringify(leStore())); } catch (_) {}
      saveCfg({ bdLayout: snap });
      toast('控件布局已保存');
    }
  }
  function leResetAll() {
    const st = leStore();
    Object.keys(st).forEach(k => delete st[k]);
    leApply();
    saveCfg({ bdLayout: {} });
  }

  /* ---------------- 对外钩子 ---------------- */
  /* 启动时把账户列表拉一次：右下角那个小人要按当前账户的皮肤显示，
     不能等用户点进账户页才正确。 */
  async function loadAccs() {
    try {
      const r = await window.lmc.accountList();
      if (r && r.ok) {
        S.accounts = r.accounts || [];
        S.accActive = r.active || S.accActive || '';
      }
    } catch (_) {}
    refreshSkin(true);
  }
  /* ============================================================
   * 1.4.14 主菜单三件套：黄色标语 / 实例角标 / 常驻下载进度
   * ============================================================ */

  /* ---------------- ① 黄色标语 ----------------
   * 照基岩版主菜单：标题图右下角一行黄字，自己一鼓一鼓地跳。
   * 句子来自内置表 + 当天节日表；点一下换下一句（游戏里点不动，这里方便挑）。 */
  const SPLASH_BASE = [
    '也试试陶瓦联机！', '四个插件开箱就用！', '由方块构成！', '两套界面！',
    '花一块钱都不花！', '现在支持基岩版界面了！', '按住标题往右拖！', '这个存档还能改名！',
    '联机不用端口映射！', '启动器也会全屏！', '没事别点「全部复位」！',
    '嘘…… 3D 角色是能拖的', '没有 NBT 就没有世界！', '别忘了备份存档！',
    'Java 8 也是 Java！', '基岩版也能改控件大小！', '按住 Shift 可以跑！',
    '这不是基岩版，是像基岩版！', '由 100% 纯启动器制成！', '下载页里有 Java！'
  ];
  /* 节日彩蛋：按「月-日」命中，命中时排在前面 */
  const SPLASH_FEST = {
    '1-1': ['新年快乐！', '今年也要多挖点矿！'],
    '2-14': ['今天适合开个双人生存！'],
    '4-1': ['别信标语！', '这个标语是假的！'],
    '6-1': ['今天也要好好玩！'],
    '10-1': ['国庆快乐！', '假期就该开个新存档！'],
    '10-2': ['国庆快乐！'],
    '10-3': ['国庆快乐！'],
    '12-24': ['平安夜快乐！'],
    '12-25': ['圣诞快乐！', '礼物在箱子里！'],
    '12-31': ['跨年快乐！'],
    '5-1': ['劳动节快乐！']
  };
  /* 定点彩蛋：命中当天**只挂这一句、整天不换**，第二天自己消失（回到上面的随机表）。
     点标语也改不动它 —— 说好挂一天就是一天。 */
  const SPLASH_LOCK = {
    '7-12': '洛天依NB',
    '10-7': '社会边NB'
  };
  let splashIdx = -1;
  let splashDay = '';
  /* 仅测试用：把「今天」钉成某个月-日，验收脚本不用改系统时间也能看彩蛋（'' = 还原真实日期） */
  let splashForce = '';
  function splashToday() {
    if (splashForce) return splashForce;
    const d = new Date();
    return (d.getMonth() + 1) + '-' + d.getDate();
  }
  function splashList() {
    const key = splashToday();
    return (SPLASH_FEST[key] || []).concat(SPLASH_BASE);
  }
  function paintSplash() {
    const el = document.getElementById('bdSplash');
    if (!el) return '';
    splashDay = splashToday();
    const lock = SPLASH_LOCK[splashDay];
    if (lock) {
      /* 锁定的标语：不走随机、点也不换 */
      el.classList.add('lock');
      el.textContent = lock;
      el.title = '今天的标语就这一句，明天见';
      return lock;
    }
    el.classList.remove('lock');
    el.removeAttribute('title');
    const list = splashList();
    let i = Math.floor(Math.random() * list.length);
    /* 别连着两句一样，点「换一句」才看得出变化 */
    if (list.length > 1 && i === splashIdx) i = (i + 1) % list.length;
    splashIdx = i;
    el.textContent = list[i];
    return list[i];
  }
  /* 点标语换一句；锁定日直接不理 */
  function splashNext() {
    if (SPLASH_LOCK[splashDay || splashToday()]) return;
    paintSplash();
  }
  /* 跨过零点（启动器开着没关）：把锁定的那句收掉，换回普通随机 */
  function splashTick() {
    if (splashDay && splashToday() !== splashDay) paintSplash();
  }
  /* 测试钩子：钉住日期 → 重画；传空串还原 */
  function splashTestDay(key) {
    splashForce = String(key || '');
    return paintSplash();
  }

  /* ---------------- ② 背景随时段 ----------------
   * 只有一张全景图，靠滤镜出三种光：白天原样 / 黄昏偏暖 / 夜晚压暗偏蓝。
   * 选「跟随时间」时按本机时钟算，并且每 5 分钟重算一次（开着启动器也会自己换）。 */
  function skyPref() { return cfg().bdSky || 'auto'; }
  function skyForNow() {
    const p = skyPref();
    if (p === 'day' || p === 'dusk' || p === 'night') return p;
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6 && h < 17) return 'day';
    if (h >= 17 && h < 19.5) return 'dusk';
    return 'night';
  }
  function applySky() {
    const v = skyForNow();
    const cl = document.body.classList;
    cl.remove('bd-sky-day', 'bd-sky-dusk', 'bd-sky-night');
    cl.add('bd-sky-' + v);
    BD.sky = v;
    return v;
  }

  /* ---------------- ③ 常驻下载进度 ----------------
   * 装版本 / 装模组资源包 / 下联机内核时左下角冒一条进度条，装完停留几秒自己收起。
   * 点它直接进基岩版下载页。数据来自主进程推的 install:* 与 mp:progress。 */
  const DLB = { text: '', pct: 0, on: false, err: false, hideT: 0 };
  function dlbRender() {
    const bar = document.getElementById('bdDlBar');
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, Math.round(DLB.pct || 0)));
    bar.hidden = !DLB.on;
    bar.classList.toggle('done', !DLB.err && pct >= 100);
    bar.classList.toggle('err', !!DLB.err);
    const tx = document.getElementById('bdDlBarTx');
    const pc = document.getElementById('bdDlBarPct');
    const fill = document.getElementById('bdDlBarFill');
    if (tx) tx.textContent = DLB.text || (DLB.err ? '下载失败' : '下载中');
    if (pc) pc.textContent = DLB.err ? '失败' : pct + '%';
    if (fill) fill.style.width = (DLB.err ? 100 : pct) + '%';
  }
  function dlbShow(text, pct, err) {
    clearTimeout(DLB.hideT);
    DLB.on = true;
    if (text) DLB.text = text;
    if (typeof pct === 'number' && !isNaN(pct)) DLB.pct = pct;
    DLB.err = !!err;
    dlbRender();
  }
  function dlbHideSoon(ms) {
    clearTimeout(DLB.hideT);
    DLB.hideT = setTimeout(() => { DLB.on = false; dlbRender(); }, ms || 6000);
  }
  function dlbWatch() {
    if (BD.dlBound) return;
    BD.dlBound = true;
    try {
      window.lmc.on('install:progress', (d) => {
        if (!d) return;
        dlbShow(d.text || '下载中', d.percent, false);
      });
      window.lmc.on('install:speed', (d) => {
        /* 速率暂时不显示（进度条只有阶段文字 + 百分比）；留着是为了以后加 ↓ KB/s 不用再改订阅 */
        if (!d || !DLB.on) return;
      });
      window.lmc.on('install:done', (d) => {
        if (d && d.cancelled) { dlbShow('已取消下载', 100, false); dlbHideSoon(4000); return; }
        if (d && d.ok === false) { dlbShow(d.error || '下载失败', 100, true); dlbHideSoon(9000); return; }
        dlbShow('下载完成', 100, false);
        dlbHideSoon(6000);
      });
      window.lmc.on('mp:progress', (d) => {
        if (!d) return;
        dlbShow('联机内核 · ' + (d.text || '下载中'), d.percent, false);
      });
    } catch (_) {}
  }

  /* ---------------- ④ 当前实例角标 ---------------- */
  function paintInst() {
    const el = document.getElementById('bdInstName');
    const btn = document.getElementById('bdInst');
    if (!el) return;
    const list = pickInsts(), cur = curVer();
    const v = list.find(x => x.id === cur);
    el.textContent = v
      ? (v.id + (v.loader && v.loader !== 'Vanilla' ? ' · ' + v.loader : ''))
      : (list.length ? '选择版本' : '未安装任何版本');
    if (btn) {
      btn.classList.toggle('empty', !v);
      btn.title = v ? ('当前实例：' + el.textContent + ' · 点一下换版本') : '还没有选版本 · 点一下看列表';
    }
  }
  function versBody() {
    const list = pickInsts(), cur = curVer();
    if (!list.length) {
      return '<div class="bd-empty">还没有安装任何版本。<br>去「下载」装一个，装好这里就能直接切。</div>';
    }
    return '<div class="bd-vlist">' + list.map(v =>
      '<button type="button" class="bd-vrow' + (v.id === cur ? ' cur' : '') + '" data-pickver="' + esc(v.id) + '">' +
        '<span class="bd-vname">' + esc(v.id) + '</span>' +
        (v.loader && v.loader !== 'Vanilla' ? '<span class="bd-vtag">' + esc(v.loader) + '</span>' : '') +
        (isBaseInst(v) ? '<span class="bd-vtag base">原版</span>' : '') +
        (v.id === cur ? '<span class="bd-vcur">当前</span>' : '') +
      '</button>').join('') + '</div>';
  }

  /* ---------------- ⑤ 存档改名 ----------------
   * 只改 level.dat 里的 LevelName（游戏里世界列表显示的就是它），不动文件夹；
   * 备份 / 回读校验 / 路径校验都在主进程 saves:rename 里做。 */
  function renameBody(r) {
    const nm = (r && r.name) || '';
    return '<div class="bd-rename-body">' +
        '<div class="bd-note">改完游戏里世界列表也显示这个名字。外面那层文件夹名不变，存档内容一个字节不碰。</div>' +
        '<input class="bd-inp" id="bdRenameInp" maxlength="64" value="' + esc(nm) + '" spellcheck="false" autocomplete="off" placeholder="给这个世界起个名">' +
        '<div class="bd-rename-old">原来的名字：<b>' + esc(nm || '（空）') + '</b></div>' +
      '</div>';
  }

  /* ---------------- ⑥ 实例页签（1.4.15）
   * 以前基岩版里只有一颗「管理实例 →」，点下去 gotoPage('instances') 落到普通模式的
   * 深色页 —— 侧栏冒出来、整页材质都变了，等于把人踢出了基岩版。现在把实例管理整块
   * 搬进「游戏」弹层做第三个页签，数据与 IPC 跟普通模式那一页完全同一套
   * （instanceRename / instanceDelete / openPath / selectVersion / startGame），
   * 只是版式换成石块灰 + 直角按钮。原版基座默认不列（见 pickInsts），
   * 底部留一行「另有 N 个已隐藏」，想管基座时点开。 */
  const BI = { showBase: false };
  function instRowHTML(v, cur) {
    const ld = (v.loader && v.loader !== 'Vanilla') ? v.loader : '原版';
    const kids = (v.children || []).length;
    return '<div class="bd-inst-row' + (v.id === cur ? ' cur' : '') + '" data-iid="' + esc(v.id) + '">' +
        '<div class="bd-inst-main">' +
          '<b title="' + esc(v.id) + '">' + esc(v.id) + '</b>' +
          '<div class="bd-inst-tags">' +
            '<span class="bd-vtag">' + esc(ld) + '</span>' +
            (isBaseInst(v) ? '<span class="bd-vtag base">基座</span>' : '') +
            (kids ? '<span class="bd-vtag">被 ' + kids + ' 个依赖</span>' : '') +
            (v.id === cur ? '<span class="bd-vcur">当前</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="bd-inst-acts">' +
          '<button type="button" class="bd-btn bd-mini" data-iact="pick" data-sfx="click"' +
            (v.id === cur ? ' disabled' : '') + '>' + (v.id === cur ? '已选中' : '设为当前') + '</button>' +
          '<button type="button" class="bd-btn bd-mini bd-green" data-iact="play" data-sfx="click">' +
            '<svg class="ic sm"><use href="#i-play"/></svg>启动</button>' +
          '<button type="button" class="bd-btn bd-mini" data-iact="rename" data-sfx="click">改名</button>' +
          '<button type="button" class="bd-btn bd-mini" data-iact="dir" data-sfx="click" title="打开实例目录">' +
            '<svg class="ic sm"><use href="#i-folder"/></svg></button>' +
          '<button type="button" class="bd-btn bd-mini bd-danger" data-iact="del" data-sfx="click">删除</button>' +
        '</div>' +
      '</div>';
  }
  function loadInstPane() {
    const box = document.getElementById('bdInstList');
    if (!box) return;
    const all = insts(), cur = curVer();
    const list = BI.showBase ? all : pickInsts();
    const hiddenN = all.filter(v => isBaseInst(v) && !list.some(x => x.id === v.id)).length;
    box.innerHTML = list.length
      ? list.map(v => instRowHTML(v, cur)).join('')
      : '<div class="bd-empty">还没有安装任何实例。<br>去「下载」装一个，装好这里就能管。</div>';
    /* 残留目录（装了一半 / 别的启动器留下的）：跟普通模式那一页一样列出来，能直接删 */
    const broken = Array.isArray(S.broken) ? S.broken : [];
    if (broken.length) {
      box.innerHTML += broken.map(b =>
        '<div class="bd-inst-row broken" data-bfolder="' + esc(b.folder) + '">' +
          '<div class="bd-inst-main"><b>' + esc(b.folder) + '</b>' +
            '<div class="bd-inst-tags"><span class="bd-vtag">残留</span>' +
              '<span class="bd-vtag">' + esc(b.reason || '不完整') + '</span></div></div>' +
          '<div class="bd-inst-acts">' +
            '<button type="button" class="bd-btn bd-mini" data-iact="bdir" data-sfx="click" title="打开目录">' +
              '<svg class="ic sm"><use href="#i-folder"/></svg></button>' +
            '<button type="button" class="bd-btn bd-mini bd-danger" data-iact="bdel" data-sfx="click">删除</button>' +
          '</div>' +
        '</div>').join('');
    }
    const more = document.getElementById('bdInstMore');
    if (more) {
      more.innerHTML = BI.showBase
        ? (hiddenN ? '' : '<button type="button" class="bd-inst-showbase" data-iact="hidebase">收起原版基座</button>')
        : (hiddenN ? '<button type="button" class="bd-inst-showbase" data-iact="showbase">另有 ' + hiddenN +
            ' 个原版基座已隐藏（加载器实例靠它们启动）· 点这里看</button>' : '');
    }
    const st = document.getElementById('bdInstStat');
    if (st) st.textContent = '共 ' + all.length + ' 个实例' + (hiddenN ? '（藏了 ' + hiddenN + ' 个基座）' : '');
  }
  /* 改名：行内变输入框（跟普通模式那一页同一个手感），回车保存、Esc 取消 */
  function instInlineRename(rowEl, id) {
    const main = rowEl.querySelector('.bd-inst-main');
    if (!main) return;
    main.innerHTML = '<input class="bd-inp bd-inst-rn" maxlength="64" value="' + esc(id) + '" spellcheck="false" autocomplete="off">' +
      '<div class="bd-inst-tags"><span class="bd-vtag">回车保存 · Esc 取消</span></div>';
    const inp = main.querySelector('input');
    inp.focus(); try { inp.select(); } catch (_) {}
    let done = false;
    const commit = async () => {
      if (done) return; done = true;
      const nv = inp.value.trim();
      if (!nv || nv === id) { loadInstPane(); return; }
      const r = await window.lmc.instanceRename({ from: id, to: nv }).catch(() => null);
      if (!r || !r.ok) { toast('改名失败：' + ((r && r.error) || '未知错误'), 'error'); loadInstPane(); return; }
      toast('已改成「' + nv + '」');
      await scanDir();
      loadInstPane();
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { done = true; loadInstPane(); }
    });
    inp.addEventListener('blur', commit);
  }
  /* 删除：行内两段确认（不弹普通模式那个深色 askConfirm，避免在全景上又开一层不属于这里的框） */
  function instInlineDelete(rowEl, id) {
    const acts = rowEl.querySelector('.bd-inst-acts');
    if (!acts) return;
    const kids = ((insts().find(v => v.id === id) || {}).children || []);
    acts.innerHTML = '<span class="bd-inst-warn">' +
        (kids.length ? '会连带删除 ' + kids.length + ' 个依赖它的实例，' : '') + '删掉就没法恢复' +
      '</span>' +
      '<button type="button" class="bd-btn bd-mini bd-danger" data-iact="delok" data-sfx="back">确认删除</button>' +
      '<button type="button" class="bd-btn bd-mini" data-iact="delno" data-sfx="click">取消</button>';
  }
  /* 从任何地方喊「管理实例」都落到基岩版自己的实例页签（1.4.15） */
  function openInstPane() {
    openSheet('game');
    paintPlay('inst');
  }
  async function instAct(btn) {
    const act = btn.dataset.iact;
    if (act === 'showbase') { BI.showBase = true; return loadInstPane(); }
    if (act === 'hidebase') { BI.showBase = false; return loadInstPane(); }
    const rowEl = btn.closest('[data-iid]');
    const id = rowEl ? rowEl.dataset.iid : '';
    if (act === 'pick') {
      if (!id) return;
      selectVersion(id, true); loadInstPane(); toast('已切到「' + id + '」'); return;
    }
    if (act === 'play') {
      if (!id) return;
      selectVersion(id, true); startGame({ versionId: id }); return;
    }
    if (act === 'dir') {
      if (id) window.lmc.openPath((cfg().gameDir || '') + '\\versions\\' + id);
      return;
    }
    if (act === 'rename') { if (rowEl && id) instInlineRename(rowEl, id); return; }
    if (act === 'del') { if (rowEl && id) instInlineDelete(rowEl, id); return; }
    if (act === 'delno') { loadInstPane(); return; }
    if (act === 'delok') {
      if (!id) return;
      const kids = ((insts().find(v => v.id === id) || {}).children || []);
      const r = await window.lmc.instanceDelete({ id, cascade: kids.length > 0 }).catch(() => null);
      if (r && !r.ok && r.code === 'HAS_CHILDREN') {
        toast('「' + id + '」正被 ' + (r.children || []).join('、') + ' 继承，先删那些实例', 'warn');
        loadInstPane(); return;
      }
      if (!r || !r.ok) { toast('删除失败：' + ((r && r.error) || '未知错误'), 'error'); loadInstPane(); return; }
      const n = (r.removed || []).length;
      toast(n > 1 ? '已删除「' + id + '」及 ' + (n - 1) + ' 个依赖实例' : '实例「' + id + '」已删除');
      await scanDir();
      loadInstPane();
      return;
    }
    /* 残留目录 */
    const bEl = btn.closest('[data-bfolder]');
    const folder = bEl ? bEl.dataset.bfolder : '';
    if (act === 'bdir') {
      const info = (S.broken || []).find(b => b.folder === folder);
      if (info && info.path) window.lmc.openPath(info.path);
      return;
    }
    if (act === 'bdel') {
      if (!folder) return;
      const r = await window.lmc.instanceDelete({ id: folder }).catch(() => null);
      if (!r || !r.ok) { toast('删除失败：' + ((r && r.error) || '未知错误'), 'error'); return; }
      toast('残留目录已删除：' + folder);
      await scanDir();
      loadInstPane();
    }
  }

  window.bdBoot = function () {
    if (!document.getElementById('bdPlay')) return;
    const first = document.body.dataset.bdBound !== '1';
    if (first) { document.body.dataset.bdBound = '1'; bind(); }
    if (!BD.spin) { BD.spin = true; spinPano(); }
    cornerStage();
    if (first) markChips();
    /* 1.4.14：标语 / 背景 / 下载进度 —— 标语每次进主菜单换一句（跟游戏一样随机），
       背景按当前时间算，进度条先把订阅挂上，之后有任务自己冒出来 */
    paintSplash();
    applySky();
    dlbWatch();
    if (!BD.skyTimer) {
      BD.skyTimer = setInterval(() => {
        if (!isOn()) return;
        if (skyPref() === 'auto') applySky();
        splashTick();          /* 跨零点换标语（彩蛋只挂当天） */
      }, 5 * 60 * 1000);
    }
    sync();
    leApply();   /* 上次摆好的控件位置 */
    if (first || !S.accounts || !S.accounts.length) loadAccs();
  };
  window.bdOnTheme = function (theme) {
    if (theme === 'bedrock') {
      cornerStage(); markChips(); sync(); leApply();
      /* 1.4.14：切回基岩版时把标语与背景补上（进度条订阅在 bdBoot 里挂） */
      paintSplash(); applySky();
    }
    else {
      /* 正在调整控件时切走：先把当前摆位存下来，再把命中框那层拆掉 */
      if (LE.on) leDone(true);
      closeSheet(); destroyBig(); stopTaunt();
      document.body.classList.remove('bd-veil');
      /* 切回浅色 / 深色时人还停在基岩版下载页：那一页只属于基岩版主题，
         直接退回普通下载页，别留一个不能用的页面挂在屏幕上 */
      const dpage = document.getElementById('page-bedrock-dl');
      if (dpage && dpage.classList.contains('active')) gotoPage('download', { full: true });
      /* 诊断页同理：先把借走的内容还回 #page-diag，再落到原生诊断页 */
      const gpage = document.getElementById('page-bedrock-diag');
      if (gpage && gpage.classList.contains('active')) { dgRelease(); gotoPage('diag', { full: true }); }
    }
  };
  /* renderer 里改完账户（换皮肤 / 改名 / 删除 / 切账户）会喊一声，这里跟着刷新 */
  window.bdSync = function () {
    sync();
    if (BD.kind === 'accounts') loadAccPane();
    else if (BD.kind === 'dress') loadDressAcc();
  };
  window.BEDROCK = {
    sync,
    open: openSheet,
    close: closeSheet,
    playSfx,
    setOpt,
    setAct,
    invite: showInvite,      /* renderer 的 showInviteDialog 在基岩版主题下把收到的邀请交给这里 */
    inviteState: () => ({ cur: !!INV.cur, queue: INV.queue.length }),
    socPresence: () => socPres,
    dl: dlRefresh,           /* gotoPage 切到基岩版下载页时调一次 */
    dlCat: (c) => dlPick(c || 'release'),
    dlLeave: dlRelease,      /* 离开这一页：把借来的资源区块还回去（renderer 的 gotoPage 会喊） */
    dlSearch: dlMirrorSearch,
    diag: dgAdopt,           /* gotoPage 切到基岩版诊断页时调一次：借内容 + 刷实例 / 崩溃记录 */
    diagLeave: dgRelease,    /* 离开这一页：把 #page-diag 的内容还回去 */
    /* 1.4.14：标语 / 背景 / 下载进度 —— 自测脚本与主题切换共用 */
    splash: paintSplash,
    splashNext,
    splashTestDay,          /* 验收用：钉住「今天」看彩蛋（'' 还原） */
    sky: applySky,
    skyState: () => ({ pref: skyPref(), now: BD.sky || '' }),
    dlBar: dlbShow,
    /* 1.4.15：实例页签 —— 自测脚本要能刷一次列表、也能直接跳过去 */
    inst: loadInstPane,
    instOpen: openInstPane,
    instState: () => ({
      showBase: BI.showBase,
      rows: Array.from(document.querySelectorAll('#bdInstList [data-iid]')).map(x => x.dataset.iid),
      stat: (document.getElementById('bdInstStat') || {}).textContent || ''
    }),
    /* 自定义控件（1.4.13）：自测脚本与设置页共用这几颗 */
    layout: {
      start: leStart,
      done: leDone,
      apply: leApply,
      reset: leResetAll,
      state: () => ({
        on: LE.on,
        sel: LE.sel,
        items: LE_ITEMS.map(it => it[0]),
        data: (() => { try { return JSON.parse(JSON.stringify(leStore())); } catch (_) { return {}; } })()
      })
    },
    debug: () => ({
      theme: cfg().theme || '',
      mode: isOn(),
      page: (document.querySelector('.page.active') || {}).id || '',
      versions: insts().length,
      sound: sfxVol(),
      sheet: BD.kind || '',
      tab: BD.tab,
      act: SK.act,
      talking: SK.talkOn,
      slim: (() => { const st = SK.big || SK.corner; try { return st ? !!st.debug().slim : null; } catch (_) { return null; } })(),
      hasImage: (() => { const st = SK.big || SK.corner; try { return st ? !!st.debug().hasImage : null; } catch (_) { return null; } })(),
      frames: (() => { const st = SK.big || SK.corner; try { return st ? st.debug().frames : 0; } catch (_) { return 0; } })(),
      model: {
        mounted: !!SK.corner,
        talking: SK.talkOn,
        stage: (SK.big ? 'big' : (SK.corner ? 'corner' : '')),
        skin: SK.key
      },
      adopted: adopted.length,
      rail: (() => { const r = document.getElementById('rail'); return r ? getComputedStyle(r).display : ''; })()
    })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.bdBoot());
  else window.bdBoot();
})();
