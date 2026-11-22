/* 打包版验收：「实例管理」入口是否随包生效
 * 用法：LMC_SMOKE_UI_JS=<绝对路径> "dist/win-unpacked/...exe"
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const btn = document.querySelector('#railNav .rail-btn[data-page="instances"]');
ok(!!btn, '打包版侧边栏有「实例管理」按钮');

if (btn) {
  btn.click();
  await new Promise(r => setTimeout(r, 600));
  const page = document.querySelector('.page.active');
  ok(page && page.id === 'page-instances', '点一下就进实例管理页', page && page.id);
  ok(!!document.getElementById('btnInstBack'), '页内有「返回主页」按钮');
  ok(!!document.getElementById('btnManageInst'), '主页有「管理实例」文字入口');
}

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版实例管理入口', lines };
