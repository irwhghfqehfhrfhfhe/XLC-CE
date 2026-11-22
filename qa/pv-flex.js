/* 模拟「page 容器是 flex 布局」的恶劣环境，验证筛选栏不会被压扁 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const panel = $('#page-download');
panel.classList.add('active');
await wait(2500);
const bar0 = $('#pvBar');
L.push(bar0 ? 'PASS 筛选栏存在' : 'FAIL 筛选栏不存在');
const w0 = bar0 ? bar0.offsetWidth : 0;
L.push((w0 > 500 ? 'PASS' : 'FAIL') + ' 正常布局下筛选栏宽度=' + w0);
/* 强制父级变 flex-row-wrap（用户构建里的恶劣场景） */
panel.style.display = 'flex';
panel.style.flexWrap = 'wrap';
await wait(300);
const w1 = bar0.offsetWidth;
L.push((w1 > 500 ? 'PASS' : 'FAIL') + ' flex 父级下筛选栏宽度=' + w1);
const cw = bar0.querySelector('.pv-count').offsetWidth;
L.push((cw > 70 ? 'PASS' : 'FAIL') + ' 「共 N 个版本」未被压成竖排，宽度=' + cw);
const vl = $('#verList');
L.push((vl.offsetWidth > 500 ? 'PASS' : 'FAIL') + ' 版本列表宽度=' + vl.offsetWidth);
panel.style.display = ''; panel.style.flexWrap = '';
await wait(200);
L.push((bar0.offsetWidth > 500 ? 'PASS' : 'FAIL') + ' 恢复后宽度=' + bar0.offsetWidth);
return { ok: L.every(x => x.startsWith('PASS')), lines: L, summary: L.filter(x => x.startsWith('FAIL')).length + ' 项失败' };
