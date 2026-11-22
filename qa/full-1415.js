/* 1.4.15 真机冒烟（真主进程 / 真目录扫描 / 真 isBase 判定）：
 *   ① 原版基座强制隐藏：主页下拉、切换版本弹层、设置里的默认启动实例、资源目标版本都不列它
 *   ② 基岩版「游戏」弹层的第三个页签「实例」：列表 / 底部展开基座 / 行内改名 / 行内删除确认
 *   ③ 点「管理实例」不再跳普通页（#page-instances 不能 active）
 *   ④ 普通模式实例管理页：只列非基座 + 底部「已隐藏 N 个原版基座 · 看看」
 * 数据准备：临时 gameDir 里造两个版本 —— 26.3（纯原版，会被判成基座）与 26.3-fabric（inheritsFrom 26.3）
 * 用法：LMC_SMOKE_UI_JS=<绝对路径>/qa/full-1415.js LMC_SMOKE_DATA_DIR=<临时数据目录> electron .
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e === undefined ? '' : ' · ' + e));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const txt = (el) => (el ? (el.textContent || '').trim() : '');
const j = (o) => JSON.stringify(o);
const fails = () => lines.filter(l => l.startsWith('FAIL')).length;
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(120); }
  return false;
};
const BASE = '26.3';
const LD = '26.3-fabric';

try {
  await waitFor(() => !document.getElementById('bootMask') || document.getElementById('bootMask').classList.contains('hide'), 20000);
  const onBl = () => document.body.classList.contains('bedrock-mode');
  if (!onBl()) {
    await window.lmc.saveConfig({ theme: 'bedrock', startPage: 'bedrock' }).catch(() => null);
    await sleep(1500);
  }
  await waitFor(() => onBl() && document.getElementById('bdGame'), 12000);
  ok(onBl(), '启动器在基岩版主题下', document.body.className.slice(0, 60));

  /* ---------- ① 扫描结果：主进程确实把 26.3 判成基座 ---------- */
  const sc = await window.lmc.scan().catch(() => null);
  const vs = (sc && sc.versions) || [];
  const b = vs.find(v => v.id === BASE), f = vs.find(v => v.id === LD);
  ok(vs.length === 2, '扫到 2 个实例（原版 + 加载器）', vs.map(v => v.id).join(', '));
  ok(!!b && b.isBase === true, '26.3 被判定为原版基座', b ? j({ isBase: b.isBase, children: b.children }) : 'none');
  ok(!!f && f.isBase !== true && f.loader === 'Fabric', '26.3-fabric 是加载器实例、不是基座', f ? f.loader : 'none');

  /* ---------- ② 主页版本下拉：只留加载器那条 ---------- */
  await waitFor(() => $$('#selVersion option').length > 0, 8000);
  const homeOpts = $$('#selVersion option').map(o => o.value).filter(Boolean);
  ok(homeOpts.length === 1 && homeOpts[0] === LD, '主页版本下拉只列加载器实例', homeOpts.join(', '));
  ok($('#selVersion').value === LD, '当前选中落在加载器实例上', $('#selVersion').value);

  /* ---------- ③ 左下角「切换版本」弹层：也只留一条 ---------- */
  const badge = document.getElementById('bdInst');
  badge.click();
  await sleep(700);
  ok(!!$('#bdSheet [data-pickver]'), '切换版本弹层打开了', txt($('#bdSheet .bd-ttl')));
  const pickIds = $$('#bdSheet [data-pickver]').map(x => x.dataset.pickver);
  ok(pickIds.length === 1 && pickIds[0] === LD, '弹层里只有加载器实例（基座被藏）', pickIds.join(', '));
  ok(pickIds.indexOf(BASE) < 0, '基座 26.3 没出现在切版本列表里', pickIds.join(', '));

  /* ---------- ④ 点「管理实例 →」不跳普通页，落到实例页签 ---------- */
  const goBtn = $('#bdSheet [data-go="instances"]');
  ok(!!goBtn, '切版本弹层底下有「管理实例 →」', txt(goBtn));
  if (goBtn) {
    goBtn.click();
    await sleep(900);
    ok(!document.getElementById('page-instances').classList.contains('active'),
      '没跳到普通模式实例管理页', 'instances.active=' + document.getElementById('page-instances').classList.contains('active'));
    ok(document.getElementById('page-bedrock').classList.contains('active'), '仍停在基岩版主菜单页', '');
    ok(document.getElementById('bdRoot').classList.contains('on'), '游戏弹层是开着的', '');
    const instTab = $('#bdSheet .bd-ptab[data-ptab="inst"]');
    ok(!!instTab && instTab.classList.contains('on'), '页签停在「实例」', instTab ? instTab.className : 'missing');
    ok(!!$('#bdSheet .bd-play-pane[data-pane="inst"].on'), '实例页签的内容是显示状态', '');
  }

  /* ---------- ⑤ 实例页签的内容 ---------- */
  const rowIds = () => $$('#bdInstList [data-iid]').map(x => x.dataset.iid);
  await waitFor(() => rowIds().length > 0, 6000);
  ok(rowIds().length === 1 && rowIds()[0] === LD, '实例页默认只列加载器实例', rowIds().join(', '));
  const row = $('#bdInstList [data-iid="' + LD + '"]');
  ok(!!row, '这一行带着实例 id', row ? row.dataset.iid : 'missing');
  const acts = row ? Array.from(row.querySelectorAll('[data-iact]')).map(x => x.dataset.iact) : [];
  ok(['pick', 'play', 'rename', 'dir', 'del'].every(a => acts.includes(a)), '五个动作都在（设为当前 / 启动 / 改名 / 目录 / 删除）', acts.join(','));
  ok(!!row.querySelector('.bd-vcur'), '当前实例带「当前」标记', txt(row.querySelector('.bd-vcur')));

  const stat = txt(document.getElementById('bdInstStat'));
  ok(stat.indexOf('共 2 个实例') >= 0 && stat.indexOf('藏了 1 个基座') >= 0, '统计写清了总数与藏了几个基座', stat);

  const more = $('#bdInstMore [data-iact="showbase"]');
  ok(!!more && txt(more).indexOf('另有 1 个原版基座已隐藏') >= 0, '底部有「已隐藏 N 个基座」的入口', txt(more));
  if (more) {
    more.click();
    await sleep(400);
    const ids2 = rowIds();
    ok(ids2.length === 2 && ids2.indexOf(BASE) >= 0, '点开以后基座出现了', ids2.join(', '));
    const baseRow = $('#bdInstList [data-iid="' + BASE + '"]');
    ok(!!baseRow && !!baseRow.querySelector('.bd-vtag.base'), '基座那一行标着「基座」', baseRow ? txt(baseRow.querySelector('.bd-vtag.base')) : 'missing');
    ok(txt($('#bdInstMore [data-iact="hidebase"]')).indexOf('收起原版基座') >= 0, '给了收起按钮', '');
    $('#bdInstMore [data-iact="hidebase"]').click();
    await sleep(300);
    ok(rowIds().length === 1, '收起后又只剩加载器实例', rowIds().join(', '));
  }

  /* ---------- ⑥ 行内改名（真改目录名，改完再改回去） ---------- */
  {
    const r0 = $('#bdInstList [data-iid="' + LD + '"]');
    const rn = r0 && r0.querySelector('[data-iact="rename"]');
    ok(!!rn, '有「改名」按钮', txt(rn));
    if (rn) {
      rn.click();
      await sleep(250);
      const inp = $('#bdInstList .bd-inst-rn');
      ok(!!inp && inp.value === LD, '行内变输入框且预填原名', inp ? inp.value : 'missing');
      const NEW = '26.3-fabric-renamed';
      if (inp) {
        inp.value = NEW;
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await sleep(2200);
        const sc2 = await window.lmc.scan().catch(() => null);
        const ids3 = ((sc2 && sc2.versions) || []).map(v => v.id);
        ok(ids3.indexOf(NEW) >= 0 && ids3.indexOf(LD) < 0, '版本目录真的改名了', ids3.join(', '));
        ok(!!$('#bdInstList [data-iid="' + NEW + '"]'), '实例页跟着刷新成新名字', '');
        /* 改回去，别把 fixture 弄脏 */
        await window.lmc.instanceRename({ from: NEW, to: LD }).catch(() => null);
        await scanDir();
        window.BEDROCK.sync();
        await sleep(400);
        window.BEDROCK.inst();
        ok(rowIds().indexOf(LD) >= 0, '改回来以后列表恢复', rowIds().join(', '));
      }
    }
  }

  /* ---------- ⑦ 行内删除确认（只验 UI，不真删） ---------- */
  {
    const r0 = $('#bdInstList [data-iid="' + LD + '"]');
    const del = r0 && r0.querySelector('[data-iact="del"]');
    ok(!!del, '有「删除」按钮', '');
    if (del) {
      del.click();
      await sleep(250);
      const okb = $('#bdInstList [data-iact="delok"]');
      const nob = $('#bdInstList [data-iact="delno"]');
      ok(!!okb && !!nob, '删除先进行内两段确认', (okb ? txt(okb) : '-') + ' / ' + (nob ? txt(nob) : '-'));
      ok(!!$('#bdInstList .bd-inst-warn'), '确认行写了后果（不可恢复）', txt($('#bdInstList .bd-inst-warn')).slice(0, 40));
      const mm = $$('.modal-mask:not([hidden])')
        .filter(m => !m.classList.contains('closing'))
        .filter(m => !/更新公告/.test(txt(m)));   /* 新版首启的更新公告不算「借了普通弹窗」 */
      ok(mm.length === 0, '没有借普通模式那个弹窗（还在基岩版里）', mm.map(m => txt(m).slice(0, 40)).join(' | ') || 'none');
      if (nob) {
        nob.click();
        await sleep(400);
        ok(!!$('#bdInstList [data-iid="' + LD + '"]'), '点取消恢复正常行', '');
      }
    }
  }

  /* ---------- ⑧ 刷新按钮 ---------- */
  ok(!!document.getElementById('bdInstRef') && !document.getElementById('bdInstRef').hidden, '实例页签有「刷新实例」绿按钮', txt(document.getElementById('bdInstRef')));
  ok(!document.getElementById('bdAddonRef') || document.getElementById('bdAddonRef').hidden, '插件那颗刷新按钮在实例页是收起的', '');
  ok(!document.getElementById('bdPlayVer') || document.getElementById('bdPlayVer').hidden, '版本下拉在实例页收起（这页本身就在挑实例）', '');

  /* 收掉弹层，回到主菜单 */
  const back = $('#bdSheet [data-close]');
  if (back) back.click();
  await sleep(600);

  /* ---------- ⑨ 设置页「默认启动实例」不带基座 ---------- */
  window.BEDROCK.open('settings');
  await sleep(900);
  const setTabs = $$('#bdSheet .bd-set-nav [data-tab]').map(x => x.dataset.tab);
  ok(setTabs.indexOf('game') >= 0, '设置页有「游戏」分组', setTabs.join(','));
  const navGame = $('#bdSheet .bd-set-nav [data-tab="game"]');
  if (navGame) { navGame.click(); await sleep(400); }
  const defSel = document.getElementById('bdDefVer');
  ok(!!defSel, '默认启动实例下拉在', '');
  if (defSel) {
    const opts = Array.from(defSel.options).map(o => o.value).filter(Boolean);
    ok(opts.indexOf(BASE) < 0, '下拉里没有原版基座', opts.join(', '));
    ok(opts.indexOf(LD) >= 0, '加载器实例在', opts.join(', '));
  }
  window.BEDROCK.close();
  await sleep(400);

  /* ---------- ⑩ 普通模式实例管理页：藏基座 + 底部提示 ---------- */
  await window.lmc.saveConfig({ theme: 'dark' }).catch(() => null);
  await sleep(1200);
  gotoPage('instances');
  await sleep(700);
  if (window.BEDROCK && window.BEDROCK.sync) window.BEDROCK.sync();
  renderInstances();
  await sleep(300);
  const plainRows = $$('#instList .ver-row .v-name').map(txt);
  ok(plainRows.length === 1 && plainRows[0].indexOf(LD) === 0, '普通页实例管理也只列加载器实例', plainRows.join(' | '));
  const note = $('#instList .inst-base-note');
  ok(!!note, '底部有「已隐藏 N 个原版基座」提示', note ? txt(note).slice(0, 40) : 'missing');
  const look = note && note.querySelector('.link-btn');
  ok(!!look, '提示里带「看看」按钮', txt(look));
  if (look) {
    look.click();
    await sleep(400);
    const rows2 = $$('#instList .ver-row .v-name').map(txt);
    ok(rows2.length === 2, '点开后基座行出现', rows2.join(' | '));
    ok(rows2.some(t => t.indexOf(BASE) === 0 && t.indexOf('基座') >= 0), '基座行带「基座」角标', rows2.join(' | '));
    const hide = $('#instList .inst-base-note .link-btn');
    if (hide) { hide.click(); await sleep(300); }
    ok($$('#instList .ver-row').length === 1, '再点收起又只剩一条', '');
  }

  const err = window.__qaErr || [];
  ok(err.length === 0, '整个过程无未捕获异常', j(err).slice(0, 160));
} catch (e) {
  ok(false, '脚本异常', (e && e.message) || String(e));
}

return { ok: fails() === 0, lines, summary: (fails() ? 'FAIL' : 'PASS') + ' · ' + lines.length + ' 项 · 失败 ' + fails() };
