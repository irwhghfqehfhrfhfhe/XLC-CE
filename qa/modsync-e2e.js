/* 联机模组同步：真实 IPC 端到端（房主清单 → 加入方比对 → 自动安装 → 复查）
   跑法：
     LMC_SMOKE_UI_JS=qa/modsync-e2e.js LMC_SMOKE_GAME_DIR=qa/tmpgame-mpsync \
     LMC_SMOKE_DATA_DIR=qa/tmpdata-mpsync electron .
   ⚠ 本文件会被主进程包在 `(async () => { ... })()` 里执行，所以顶层直接写语句 + return，
     不要自己再包一层 IIFE（包了的话外层拿到的是 undefined，测试永远 FAIL）。
   房主实例 mpsync-host：真实 lithium（Modrinth 上有，sha1 可反查）、testmod-a 1.0、testmod-b 2.0
   加入方实例 mpsync-guest：只有 testmod-a 0.9（同一 modid 的不同版本）
   ⚠ 会往 mpsync-guest/mods 里装东西：重跑前先把 guest 的 mods 恢复成「只有 testmod-a-0.9.jar」，
     否则第一项断言（lithium 判为缺）会因为上一轮已经装好了而失败 */
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const t0 = Date.now();
try {
  const man = await window.lmc.mpModManifest({ instance: 'mpsync-host' });
  log('MANIFEST ok=' + man.ok + ' count=' + man.count + ' wire=' + (man.wire ? man.wire.length + 'B' : '-'));
  if (!man.ok) return { ok: false, lines };

  const d1 = await window.lmc.mpModsDiff({ instance: 'mpsync-guest', manifest: man.wire });
  if (!d1.ok) { log('DIFF FAIL ' + d1.error); return { ok: false, lines }; }
  log('DIFF missing=' + JSON.stringify(d1.missing.map(m => m.f)));
  log('DIFF outdated=' + JSON.stringify(d1.outdated.map(o => o.host.f + ' → 本地 ' + o.local.name)));
  log('DIFF same=' + d1.same + ' hostTotal=' + d1.host.count);

  const r = await window.lmc.mpModsInstall({ instance: 'mpsync-guest', mods: d1.missing });
  log('INSTALL ' + JSON.stringify(r));

  const d2 = await window.lmc.mpModsDiff({ instance: 'mpsync-guest', manifest: man.wire });
  log('DIFF2 missing=' + JSON.stringify(d2.missing.map(m => m.f)) + ' same=' + d2.same + ' outdated=' + d2.outdated.length);

  const checks = [
    ['房主清单含 3 个模组', man.count === 3],
    ['缺的只有 2 个（真缺的才算）', d1.missing.length === 2],
    ['lithium 判为缺（加入方没有）', d1.missing.some(m => /^lithium-/.test(m.f))],
    ['testmod-b 判为缺', d1.missing.some(m => m.f === 'testmod-b-2.0.jar')],
    ['testmod-a 判为「已装但版本不同」而不是缺', d1.outdated.length === 1 && d1.outdated[0].host.f === 'testmod-a-1.0.jar'],
    ['lithium 从 Modrinth 装成功', (r.failed || []).every(x => !/^lithium-/.test(x.file))],
    ['testmod-b 查不到源 → 标为需手动', (r.manual || []).some(x => x.file === 'testmod-b-2.0.jar')],
    ['复查：lithium 已不再缺', !d2.missing.some(m => /^lithium-/.test(m.f))],
    ['复查：只剩 testmod-b 缺', d2.missing.length === 1]
  ];
  for (const [name, ok] of checks) log((ok ? 'PASS ' : 'FAIL ') + name);
  log('耗时 ' + Math.round((Date.now() - t0) / 1000) + 's');
  return { ok: checks.every(c => c[1]), lines };
} catch (e) {
  log('ERR ' + (e && e.message));
  return { ok: false, lines };
}
