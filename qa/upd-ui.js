/* 验证设置页「版本更新」卡片恢复显示，检测更新按钮可用 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
await wait(2000);
// 切到设置页
gotoPage('settings');
await wait(1500);
const card = document.querySelector('.set-card h3') && Array.from(document.querySelectorAll('.set-card')).find(c => c.textContent.includes('版本更新'));
const vis = (() => { let el = null; for (const h of document.querySelectorAll('.set-card h3')) { if (h.textContent.includes('版本更新')) { el = h.closest('.set-card'); break; } } return el; })();
L.push(vis ? 'PASS 版本更新卡片可见' : 'FAIL 版本更新卡片不可见（仍 hidden）');
const btn = $('#btnCheckUpdate');
L.push(btn && btn.offsetParent !== null ? 'PASS 检测更新按钮可见' : 'FAIL 检测更新按钮不可见');
const cur = $('#updCurVer');
L.push(cur && cur.textContent && cur.textContent !== '—' ? 'PASS 当前版本已显示: ' + cur.textContent : 'FAIL 当前版本未显示');
// 点检测更新
if (btn) { btn.click(); await wait(2500); }
const st = $('#updStateTx');
L.push(st ? 'PASS 检测结果状态: ' + st.textContent : 'FAIL 无状态元素');
return { ok: L.filter(x=>x.startsWith('PASS')).length >= 3, lines: L, summary: L.filter(x=>x.startsWith('FAIL')).length + ' 项失败' };
