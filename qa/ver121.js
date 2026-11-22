/* 1.2.1 出厂验收：版本号、公告条目、历史版本
 * 用法：LMC_SMOKE_UI_JS=<绝对路径> "dist/win-unpacked/Xero Lite Craft Launcher 1.2.1.exe"
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const cl = await window.lmc.updateChangelog();
ok(!!(cl && cl.ok), '公告 IPC 可用');
ok(cl.current === '1.2.1', '运行版本是 1.2.1', cl.current);
ok(cl.entry && cl.entry.version === '1.2.1', '当前公告条目是 1.2.1', cl.entry && cl.entry.version);
ok(cl.entry && cl.entry.tag === '修复版', '公告标注「修复版」', cl.entry && cl.entry.tag);

const titles = ((cl.entry && cl.entry.groups) || []).map(g => g.title);
ok(titles.length >= 4, '公告分组 ≥ 4', titles.join(' / '));
ok(titles.some(t => /闪退/.test(t)), '公告含「闪退」修复组', titles.join(' / '));
ok(titles.some(t => /基座/.test(t)), '公告含「原版基座」修复组');
ok(titles.some(t => /联机/.test(t)), '公告含「联机模组核对」组');
/* unseen 取决于这份配置之前有没有跑过 1.2.1（跑过就是 false），只校验字段存在 */
ok(typeof cl.unseen === 'boolean', '公告 unseen 字段正常', String(cl.unseen));

const v120 = (cl.list || []).find(x => x.version === '1.2.0');
ok(!!v120, '历史里能找到 1.2.0');
const t120 = ((v120 && v120.groups) || []).map(g => g.title);
ok(t120.length === 2 && t120.every(t => /主题|侧边栏/.test(t)), '1.2.0 条目回归原始内容', t120.join(' / '));

/* 公告面板真实渲染（含历史版本行） */
const shown = typeof renderChangelog === 'function' ? renderChangelog(cl, function () {}) : false;
ok(shown === true, '公告面板能渲染');
await new Promise(r => setTimeout(r, 200));
const rows = document.querySelectorAll('#modalBox .cl-row').length;
ok(rows >= 3, '公告里列出了历史版本（不再写死「无历史版本」）', rows + ' 行');
const hasHistTitle = /历史版本/.test((document.querySelector('#modalBox .cl-hist') || {}).textContent || '');
ok(hasHistTitle, '历史版本标题正确');

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '1.2.1 出厂验收', lines };
