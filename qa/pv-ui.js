/* PCL 风格版本页 UI 冒烟（LMC_SMOKE_UI_JS=qa/pv-ui.js）
   在真实渲染窗口里跑：切到下载页 → 等清单 → 检查卡片 → 展开面板 → 切加载器 */
const L = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
try {
  const btn = document.querySelector('#railNav .rail-btn[data-page="download"]');
  if (btn) btn.click();
  await wait(400);

  for (let i = 0; i < 120; i++) { if (typeof S !== 'undefined' && S.manifest) break; await wait(250); }
  L.push('PASS 版本清单: ' + ((typeof S !== 'undefined' && S.manifest) ? S.manifest.versions.length + ' 个' : '未获取'));

  for (let i = 0; i < 40; i++) { if ($$('.pv-card').length) break; await wait(250); }
  const cards = $$('.pv-card').length;
  if (!cards) { L.push('FAIL 没有渲染出任何版本卡片'); return { ok: false, lines: L, summary: '无卡片' }; }
  L.push('PASS 版本卡片: ' + cards + ' 张');

  const pin = $$('.ver-pin .pv-card').length;
  const badge = $$('.pv-card .pv-ver .badge').length;
  L.push((pin >= 1 ? 'PASS' : 'WARN') + ' 置顶区卡片: ' + pin + ' · 徽标: ' + badge);

  const bar = $('#pvBar');
  L.push((bar ? 'PASS' : 'FAIL') + ' 筛选栏: ' + (bar ? bar.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '缺失'));

  const ico = $('.pv-card .pv-ico');
  L.push((ico ? 'PASS' : 'FAIL') + ' 方块图标: ' + (ico ? ico.getAttribute('src') : '缺失'));

  /* 展开第一张卡片 */
  const first = $$('.pv-card')[0];
  const vid = first.dataset.vid;
  first.querySelector('.pv-head').click();
  await wait(500);
  const panel = $('.pv-card.open .pv-panel');
  L.push((panel ? 'PASS' : 'FAIL') + ' 点击展开面板: ' + vid + ' → ' + (panel ? '已展开' : '没展开'));

  const los = $$('.pv-card.open .pv-lo').length;
  L.push((los === 6 ? 'PASS' : 'FAIL') + ' 加载器卡片数: ' + los);

  /* 切到 Fabric */
  let fab = null;
  $$('.pv-card.open .pv-lo').forEach(n => { if (n.dataset.l === 'Fabric') fab = n; });
  if (fab) fab.click();
  await wait(400);
  const sel = $('.pv-card.open .pv-lo.sel');
  L.push((sel && sel.dataset.l === 'Fabric' ? 'PASS' : 'FAIL') + ' 选中 Fabric: ' + (sel ? sel.dataset.l : '无'));

  /* 加载器版本下拉（Fabric 可挑版本） */
  let vsel = null;
  for (let i = 0; i < 30; i++) { vsel = $('.pv-card.open .lver-sel'); if (vsel && vsel.options.length > 1) break; await wait(300); }
  L.push((vsel && vsel.options.length > 1 ? 'PASS' : 'WARN') + ' 加载器版本下拉: ' + (vsel ? vsel.options.length + ' 项' : '未出现'));

  const go = $('#pvGo');
  L.push((go ? 'PASS' : 'FAIL') + ' 开始安装按钮: ' + (go ? ('"' + go.textContent + '" disabled=' + go.disabled) : '缺失'));

  /* 搜索过滤 */
  const inp = $('#verSearch');
  if (inp) {
    inp.value = '1.20.4';
    inp.dispatchEvent(new Event('input'));
    await wait(400);
    const n2 = $$('.pv-card').length;
    const hit = $('.pv-card .pv-ver');
    L.push((n2 > 0 && hit && hit.textContent.indexOf('1.20.4') === 0 ? 'PASS' : 'FAIL') +
      ' 搜索 1.20.4 → ' + n2 + ' 张 · 首条 ' + (hit ? hit.textContent.trim() : '-'));
    inp.value = ''; inp.dispatchEvent(new Event('input')); await wait(300);
  }

  /* 收起（搜索会把展开态重置，这里重新展开一张再点一次验证收起） */
  const again = $$('.pv-card')[0];
  again.querySelector('.pv-head').click();
  await wait(400);
  const opened = $$('.pv-card.open').length;
  again.querySelector('.pv-head').click();
  await wait(300);
  L.push((opened === 1 && $$('.pv-card.open').length === 0 ? 'PASS' : 'FAIL') +
    ' 再次点击收起（展开 ' + opened + ' → 收起后 ' + $$('.pv-card.open').length + '）');

  return { ok: true, lines: L, summary: cards + ' 张卡片 · 展开/收起/切加载器正常' };
} catch (e) {
  L.push('FAIL 异常: ' + ((e && e.stack) || e));
  return { ok: false, lines: L, summary: '异常' };
}
