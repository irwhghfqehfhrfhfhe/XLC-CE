/* 真机冒烟（页面脚本）：用真实主进程 + 真实网络验证「内核检查 / 强制重装 / 启动校验 / 加入房间接口」
 * 用法：LMC_SMOKE_DATA_DIR=/tmp/kerntest LMC_SMOKE_UI_JS=qa/mp-kernel-real.js electron .
 * 注意：会真的下载一次内核（约 8 MB，走国内镜像）并拉起 terracotta.exe。 */
const lines = [];
const log = (s) => { lines.push(s); console.log('[MPK] ' + s); };
let fail = 0;
const ok = (cond, name, extra) => {
  if (!cond) fail++;
  const s = (cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ← ' + String(extra).slice(0, 200) : '');
  lines.push(s); console.log('[MPK] ' + s);
};

const st0 = await window.lmc.mpStatus();
log('初始 status: ' + JSON.stringify(st0));
ok(st0 && st0.ok, '取到联机状态');
const before = st0.version || '';

const kc = await window.lmc.mpKernelCheck({ force: true });
log('检查更新: ' + JSON.stringify(kc));
ok(kc && kc.ok && /^\d+\.\d+\.\d+/.test(kc.latest || ''), '拿到上游最新版号', kc && kc.latest);

const dl = await window.lmc.mpDownload({ force: true });
log('强制重装: ' + JSON.stringify(dl));
ok(dl && dl.ok, '强制重装成功', dl && dl.error);
ok(dl && dl.version === kc.latest, '装到的版本 = 上游最新', (dl && dl.version) + ' vs ' + kc.latest);

const st1 = await window.lmc.mpStatus();
log('重装后 status: ' + JSON.stringify(st1));
ok(st1 && st1.version === (dl && dl.version), 'meta 里的版本已更新', st1 && st1.version);

const started = await window.lmc.mpStart();
log('启动内核: ' + JSON.stringify(started));
ok(started && started.ok, '内核能起来', started && started.error);
ok(String(started.version || '') === String(dl.version || '') || !started.version, '端口上跑的就是刚装的那颗', started.version);

const st2 = await window.lmc.mpStatus();
ok(st2 && !st2.mismatch, 'status 不再报「版本不符」', JSON.stringify({ live: st2.liveVersion, v: st2.version }));

/* 关键回归：这颗内核的 /state/guesting 必须真的存在（旧内核这里是 404） */
const act = await window.lmc.mpAct({ action: 'guesting', room: 'U/R4RT-WNRL-Y4KN-Y1PL', player: 'QA' });
log('guesting: ' + JSON.stringify(act));
ok(act && act.ok, '加入房间接口可用（不是 404）', 'HTTP ' + (act && act.status) + ' ' + (act && act.body));

await window.lmc.mpAct({ action: 'ide' }).catch(() => {});

return { ok: fail === 0, lines };
