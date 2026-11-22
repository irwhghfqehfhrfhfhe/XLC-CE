/* 打包版验收（1.4.1 · 基岩版主题）：确认 bedrock.js、标题图、音效 wav 真的进了 asar，
 * 打包版里主题能切、主菜单能出来、右下角常驻 3D 角色会画、设置 / 切换账户 / 联机弹层能开。
 *
 * 用法：LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<本文件绝对路径> "dist/win-unpacked/XLC CE Launcher 1.4.1.exe"
 *
 * 注意：这里**不真启动游戏**（临时数据目录的 gameDir 可能指向真实 .minecraft），
 * 音效也只在关掉开关后调用，避免打包版在后台出声。
 * 另外冒烟窗口是隐藏的，rAF 被节流，3D 只能验「挂载了 + 画了几帧」，不能验转速。
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

ok(!!window.BEDROCK, 'bedrock.js 已随包加载');

/* ---- 主题入口（1.3.1：基岩版挪进「实验性功能」分区） ---- */
const opts = Array.from(document.querySelectorAll('#themeGrid .theme-opt')).map(b => b.dataset.theme);
ok(opts.length === 2 && !opts.includes('bedrock'), '界面主题只剩浅色 / 深色', opts.join(','));
ok(!!document.getElementById('btnBedrockTheme'), '「实验性功能」里有基岩版开关');

document.getElementById('btnBedrockTheme').click();
await sleep(1200);

const d = {
  theme: S.config.theme,
  mode: document.body.classList.contains('bedrock-mode'),
  home: document.body.classList.contains('bd-home'),
  page: (document.querySelector('.page.active') || {}).id,
  rail: getComputedStyle(document.getElementById('rail')).display,
  logo: (document.getElementById('bdLogo') || {}).naturalWidth || 0,
  tx: (document.getElementById('bdPlayTx') || {}).textContent,
  menu: Array.from(document.querySelectorAll('.bd-stack .bd-mbtn')).map(b => b.textContent.trim()),
  purple: ((document.querySelector('.bd-stack .bd-purple') || {}).textContent || '').trim(),
  social: ((document.getElementById('bdSocial') || {}).textContent || '').replace(/\s+/g, ''),
  navBtn: !!document.getElementById('bdNavBtn'),
  btns: ['bdGame', 'bdSettings', 'bdLan', 'bdDownload', 'bdPlay', 'bdDress', 'bdAccount', 'bdSocial']
    .filter(id => !!document.getElementById(id)).length
};
ok(d.theme === 'bedrock', '主题切到 bedrock', d.theme);
ok(d.mode && d.home && d.page === 'page-bedrock', '主菜单页已激活', d.page);
ok(d.rail === 'none', '主菜单收起侧栏', d.rail);
ok(d.logo > 100, '标题图进了 asar 并载入', d.logo + 'px');
ok(d.tx === '进入游戏', '启动按钮文案改成「进入游戏」', d.tx);
ok(d.btns === 8, '8 个入口都在（四颗菜单 + 社交 + 更衣室 / 切换账户 + 进入游戏）', d.btns);
ok(d.menu.join('/') === '游戏/设置/联机/下载', '主菜单：游戏 / 设置 / 联机 / 下载', d.menu.join('/'));
ok(d.purple === '联机', '第三颗（紫）是联机', d.purple);
ok(/^社交\(\d+\)$/.test(d.social), '右上角「社交 (n)」在', d.social);
ok(d.navBtn === false, '左上角「启动器」按钮已删除');

/* ---- 邀请联机：打包版里收到的邀请也用基岩版弹层（只看界面，不发真信令） ---- */
showInviteDialog({ type: 'invite', from: 'WXYZ-2345-6789', name: 'StarMantis2357', inviteId: 'pack1' });
await sleep(500);
const invPk = {
  kind: BEDROCK.debug().sheet,
  who: ((document.querySelector('#bdSheet .bd-inv-ttl') || {}).textContent || ''),
  yes: ((document.querySelector('#bdSheet [data-act="invok"]') || {}).textContent || ''),
  no: !!document.querySelector('#bdSheet [data-act="invno"]'),
  sm: document.getElementById('bdSheet').classList.contains('bd-sm')
};
ok(invPk.kind === 'invite' && /StarMantis2357/.test(invPk.who), '打包版：收到的邀请用基岩版弹层显示', invPk.who);
ok(/同意/.test(invPk.yes) && invPk.no && invPk.sm, '打包版：同意 / 拒绝两颗按钮 + 小号面板', JSON.stringify({ y: invPk.yes, no: invPk.no, sm: invPk.sm }));
document.querySelector('#bdSheet [data-close]').click();   /* ✕ 关掉 = 不回信，不会误发拒绝 */
await sleep(400);
ok(BEDROCK.debug().sheet === '', '打包版：关掉邀请弹层后状态清干净（不会误发 reject）', BEDROCK.debug().sheet);

/* ---- 全景背景（MC 最新版 4:1 长条，JS 逐帧横移） ---- */
const pano = await (async () => {
  const p = document.getElementById('bdPano');
  if (!p) return { has: false };
  const bg = getComputedStyle(p).backgroundImage || '';
  const url = (bg.match(/url\("?([^")]+)"?\)/) || [])[1] || '';
  const size = await new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r('ERR'); i.src = url; });
  const t1 = p.style.transform || '';
  await sleep(1800);
  const t2 = p.style.transform || '';
  return { has: true, url: url.split('/').slice(-1)[0], size, t1, t2, w: p.offsetWidth, h: p.offsetHeight };
})();
ok(pano.has && /panorama\.jpg$/.test(pano.url) && pano.size === '4096x1024', '全景图在 asar 里且能载入', pano.url + ' ' + pano.size);
ok(pano.w > pano.h * 3.5, '长条 4:1 等比铺开', pano.w + 'x' + pano.h);
ok(pano.t1 !== pano.t2, '背景在转（位移变了）', pano.t1 + ' → ' + pano.t2);

/* ---- 右下角常驻 3D 角色 ---- */
const model = {
  cv: !!document.getElementById('bdSkinCv'),
  mounted: BEDROCK.debug().model.mounted,
  frames: BEDROCK.debug().frames,
  has: BEDROCK.debug().hasImage,
  stage: BEDROCK.debug().model.stage
};
ok(model.cv && model.mounted && model.has, '右下角常驻角色已挂载并载入皮肤', JSON.stringify(model));
ok(model.frames > 0, '常驻角色真的在画（帧数 > 0）', String(model.frames));

/* ---- 音效资源（只验解码，不放声） ---- */
let wav = { ok: false, dur: 0 };
try {
  const a = new Audio('../assets/sfx/click.wav');
  a.muted = true;
  a.preload = 'auto';
  wav = await new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, dur: 0 }), 4000);
    a.addEventListener('loadedmetadata', () => { clearTimeout(t); resolve({ ok: a.duration > 0, dur: a.duration }); });
    a.addEventListener('error', () => { clearTimeout(t); resolve({ ok: false, dur: 0 }); });
  });
} catch (e) { wav = { ok: false, dur: 0 }; }
ok(wav.ok, '音效 wav 在 asar 里能解码', wav.dur.toFixed(2) + 's');

/* ---- 设置弹层：1.4.5 起 6 页签（功能板块移除、诊断独立），关于页只剩版本 / 检查更新 / 下载页 ---- */
document.getElementById('bdSettings').click();
await sleep(700);
const st = {
  on: document.getElementById('bdRoot').classList.contains('on'),
  tabs: document.querySelectorAll('#bdSheet .bd-tab').length,
  panes: document.querySelectorAll('#bdSheet .bd-pane').length,
  func: !!document.querySelector('#bdSheet .bd-tab[data-tab="func"]'),
  ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent
};
ok(st.on && st.ttl === '设置', '设置弹层能打开', st.ttl);
ok(st.tabs === 6 && st.panes === 6 && !st.func, '6 个页签 / 6 个面板（诊断独立、没有「功能」）', st.tabs + '/' + st.panes);

/* 音效开关真的写配置：关掉后 playSfx 必须拒绝（也顺便保证不发声） */
document.querySelector('#bdSheet .bd-tab[data-tab="sound"]').click();
await sleep(240);
document.querySelector('#bdSheet .bd-segbtn[data-set="uiSound"][data-val="0"]').click();
await sleep(500);
ok(S.config.uiSound === false, '音效开关写进配置', String(S.config.uiSound));
ok(BEDROCK.playSfx('click') === false, '关掉后不再播放');
document.querySelector('#bdSheet .bd-segbtn[data-set="uiSound"][data-val="1"]').click();
await sleep(400);
ok(S.config.uiSound === true, '再打开后恢复', String(S.config.uiSound));

/* 功能板块整个移除：页签、面板、入口网格都不该再出现 */
ok(!document.querySelector('#bdSheet .bd-tab[data-tab="func"]') &&
   !document.querySelector('#bdSheet .bd-pane[data-pane="func"]') &&
   document.querySelectorAll('#bdSheet .bd-navitem').length === 0,
  '打包版也没有「功能」页签 / 面板 / 入口');

/* 诊断页签：内容还是搬进来的 #page-diag（打包版里四条主进程通道都在） */
document.querySelector('#bdSheet .bd-tab[data-tab="diag"]').click();
await sleep(600);
ok(document.querySelectorAll('#bdDiagPane .set-card').length === 4 &&
   document.querySelectorAll('#page-diag > *').length === 0,
  '打包版诊断页签搬进四张卡', String(document.querySelectorAll('#bdDiagPane .set-card').length));
document.querySelector('#bdSheet .bd-tab[data-tab="about"]').click();
await sleep(400);
ok(document.querySelectorAll('#page-diag > *').length >= 5, '切走后又还回原生诊断页');

/* 关于页：只有版本号 + 检查更新 + 打开下载页 */
const abp = {
  ver: (document.getElementById('bdUpdCur') || {}).textContent || '',
  chk: !!document.querySelector('#bdSheet [data-act="chkupd"]'),
  dl: !!document.querySelector('#bdSheet [data-act="opendl"]'),
  old: document.querySelectorAll('#bdSheet .bd-pane.on [data-go], #bdSheet .bd-pane.on [data-act="openacc"]').length
};
ok(abp.ver.length >= 5 && abp.chk && abp.dl && abp.old === 0, '关于页只剩版本 / 检查更新 / 打开下载页', JSON.stringify(abp));
document.querySelector('#bdSheet [data-act="chkupd"]').click();
/* 真接口要看网络，轮询等结果（最多 12 秒） */
let upTx = '';
for (let i = 0; i < 60; i++) {
  await sleep(200);
  upTx = (document.getElementById('bdUpdStateTx') || {}).textContent || '';
  if (/最新|新版本|失败|跳过/.test(upTx) && !/正在检测/.test(upTx)) break;
}
ok(/最新|新版本|失败|跳过/.test(upTx), '打包版点「检查更新」有结果（不是一直转圈）', upTx);
document.querySelector('#bdSheet [data-close]').click();
await sleep(300);

/* 重新打开设置，接着验界面页 */
document.getElementById('bdSettings').click();
await sleep(600);

/* 界面页：1.4.4 起没有「切回深色 / 浅色」的按钮（以前手滑一下就会掉回普通启动器） */
document.querySelector('#bdSheet .bd-tab[data-tab="look"]').click();
await sleep(260);
ok(document.querySelectorAll('#bdSheet .bd-segbtn[data-set="theme"]').length === 0,
  '打包版界面页也没有主题切换按钮');
ok(!!document.getElementById('bdStartPage') && /实验性功能/.test(document.getElementById('bdSheet').textContent),
  '只显示当前外观 + 启动页，并指明回普通模式去「实验性功能」');

/* 唯一出口仍然在启动器设置里（普通模式那一侧没被动过） */
const exitBtn = String((document.getElementById('btnBedrockThemeTx') || {}).textContent || '');
ok(/关闭基岩版主题/.test(exitBtn), '启动器设置里的「关闭基岩版主题」还在', exitBtn.trim());

document.querySelector('#bdSheet [data-close]').click();
await sleep(350);
ok(!document.getElementById('bdRoot').classList.contains('on'), '设置弹层能关掉');

/* ---- 切换账户弹层：列表 + 3D 模型 ---- */
document.getElementById('bdAccount').click();
await sleep(900);
const ac = {
  on: document.getElementById('bdRoot').classList.contains('on'),
  rows: document.querySelectorAll('#bdAccList .bd-item').length,
  empty: !!document.querySelector('#bdAccList .bd-empty'),
  cv: !!document.getElementById('bdAccCv'),
  stage: BEDROCK.debug().model.stage,
  jumps: document.querySelectorAll('#bdAccList [data-go]').length
};
/* 冒烟用的是全新数据目录，默认没有账户 —— 这时弹层要给出「添加账户」引导，而不是空白 */
ok(ac.on && (ac.rows >= 1 || ac.empty), '切换账户弹层打开（有账户列账户，没账户给引导）', 'rows=' + ac.rows + ' empty=' + ac.empty);
ok(ac.cv && ac.stage === 'big', '切换账户弹层里有 3D 模型', ac.stage);
ok(ac.jumps === 0, '没有跳旧账户页的按钮', String(ac.jumps));
document.querySelector('#bdSheet [data-close]').click();
await sleep(400);

/* ---- 更衣室弹层 ---- */
document.getElementById('bdDress').click();
await sleep(900);
const dr = {
  ttl: (document.querySelector('#bdSheet .bd-ttl') || {}).textContent,
  page: (document.querySelector('.page.active') || {}).id,
  cv: !!document.getElementById('bdDressCv'),
  acts: document.querySelectorAll('#bdSheet .bd-chip[data-bdact]').length
};
ok(dr.ttl === '更衣室' && dr.page === 'page-bedrock' && dr.cv && dr.acts === 5, '更衣室在弹层里打开（大模型 + 5 动作）', JSON.stringify(dr));
document.querySelector('#bdSheet [data-close]').click();
await sleep(400);

/* ---- 联机弹层：陶瓦控件借进来，关掉后回到联机页 ---- */
document.getElementById('bdLan').click();
await sleep(1200);
const lan = {
  on: document.getElementById('bdRoot').classList.contains('on'),
  inSheet: !!document.querySelector('#bdSheet #mpBtnHost'),
  setup: !!document.querySelector('#bdSheet #mpSetup'),
  page: (document.querySelector('.page.active') || {}).id
};
ok(lan.on && lan.page === 'page-bedrock' && lan.inSheet && lan.setup, '联机在弹层里打开，建房 / 进房控件都在', JSON.stringify(lan));
document.querySelector('#bdSheet [data-close]').click();
await sleep(500);
ok(!!document.querySelector('#page-mp #mpBtnHost'), '关掉弹层后联机控件回到联机页');

/* ---- 基岩版下载页（1.4.2）：主菜单「下载」不再落回普通下载页 ---- */
document.getElementById('bdDownload').click();
await sleep(1200);
const dlp = {
  page: (document.querySelector('.page.active') || {}).id,
  has: !!document.getElementById('page-bedrock-dl'),
  rail: getComputedStyle(document.getElementById('rail')).display,
  back: !!document.getElementById('bdDlBack'),
  tabs: Array.from(document.querySelectorAll('#bdDlTabs .bd-segbtn')).map(b => b.textContent),
  strip: (() => {
    const s = document.querySelector('#page-bedrock-dl .bd-pano-strip');
    if (!s) return null;
    const bg = getComputedStyle(s).backgroundImage || '';
    return { url: ((bg.match(/url\("?([^")]+)"?\)/) || [])[1] || '').split('/').slice(-1)[0], w: s.offsetWidth, h: s.offsetHeight, tf: s.style.transform };
  })(),
  rows: document.querySelectorAll('#bdDlList .bd-item').length,
  listTx: (document.getElementById('bdDlList') || {}).textContent || ''
};
ok(dlp.has && dlp.page === 'page-bedrock-dl', '主菜单「下载」进基岩版下载页', dlp.page);
ok(dlp.rail === 'none', '下载页收起侧栏（满屏）', dlp.rail);
ok(dlp.back && dlp.tabs.join('/') === '正式版/快照版/远古版本/全部/MOD/整合包/资源包/光影/数据包/Java',
  '返回按钮 + 十个页签（版本 4 + 资源 5 + Java）', dlp.tabs.join('/'));
ok(!!dlp.strip && /^panorama\.jpg$/.test(dlp.strip.url) && dlp.strip.w > dlp.strip.h * 3.5,
  '下载页的背景是同一张全景长条（进 asar 了）', dlp.strip && dlp.strip.url);
/* 冒烟用全新数据目录 + 可能没网：有版本就验行，没版本至少要给出「加载 / 失败」的提示，不能是一块空白 */
const dlOk = dlp.rows > 0
  ? /个版本/.test((document.getElementById('bdDlCount') || {}).textContent || '')
  : /正在获取|清单获取失败/.test(dlp.listTx);
ok(dlOk, '版本清单要么列出条目，要么给出加载/失败提示（不留空白）', 'rows=' + dlp.rows);

/* 资源类页签（1.4.3）：MOD / 整合包 / 资源包 / 光影 / 数据包 都搬进这一页，不再跳走 */
document.querySelector('#bdDlTabs .bd-segbtn[data-cat="shader"]').click();
await sleep(1600);
const dlr = {
  on: document.getElementById('bdDlRes').classList.contains('on'),
  inHost: !!document.querySelector('#bdDlRes #spArea'),
  listHidden: getComputedStyle(document.getElementById('bdDlList')).display,
  ttl: (document.getElementById('bdDlTtl') || {}).textContent,
  ph: (document.getElementById('bdDlSearch') || {}).placeholder,
  txt: (document.getElementById('spList') || {}).textContent || ''
};
ok(dlr.on && dlr.inHost && dlr.listHidden === 'none', '「光影」页签把完整下载页那一块搬进基岩版这一页', JSON.stringify({ on: dlr.on, inHost: dlr.inHost }));
ok(dlr.ttl === '光影' && /光影/.test(dlr.ph), '标题与搜索框跟着换成光影的', dlr.ttl + ' / ' + dlr.ph);
/* 冒烟可能没网：有结果列出条目，没结果也必须给出「正在搜索 / 源不可达 / 没有匹配」之一 */
ok(/正在搜索|源不可达|没有匹配|暂无适配|个/.test(dlr.txt), '光影列表给出结果或明确的失败提示', (dlr.txt || '').trim().slice(0, 28));
document.querySelector('#bdDlTabs .bd-segbtn[data-cat="release"]').click();
await sleep(700);
const dlr2 = {
  on: document.getElementById('bdDlRes').classList.contains('on'),
  backHome: ['resArea', 'mpArea', 'rpArea', 'dpArea', 'spArea'].every(id => {
    const n = document.getElementById(id);
    return n && n.parentNode && n.parentNode.id === 'page-download';
  }),
  rows: document.querySelectorAll('#bdDlList .bd-item').length
};
ok(!dlr2.on && dlr2.backHome, '切回「正式版」五块资源区都还回完整下载页', JSON.stringify({ on: dlr2.on, home: dlr2.backHome }));
const dlBack = await (async () => {
  document.getElementById('bdDlBack').click();
  await sleep(600);
  return (document.querySelector('.page.active') || {}).id;
})();
ok(dlBack === 'page-bedrock', '「返回」回主菜单', dlBack);

/* ---- 切回深色 ----
   setOpt 里要 await 落盘配置，慢机器上 900ms 有时不够（历史偶发 FAIL）→ 轮询等它真的切完 */
BEDROCK.setOpt('theme', 'dark');
let switched = false;
for (let i = 0; i < 40; i++) {
  await sleep(100);
  const pid = (document.querySelector('.page.active') || {}).id;
  if (!document.body.classList.contains('bedrock-mode') && pid === 'page-home') { switched = true; break; }
}
ok(!document.body.classList.contains('bedrock-mode'), '切回深色后类名清干净');
ok(switched, '回到启动器主页', (document.querySelector('.page.active') || {}).id || '（无 active 页）');

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版验收（基岩版主题）', lines };
