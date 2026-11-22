/* 加入方侧：订阅房间频道等房主清单（真实 MQTT 往返，配合 qa/mpsync-pub.js）
   跑法：LMC_SMOKE_UI_JS=qa/mpsync-sub.js electron . */
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const t0 = Date.now();
const r = await window.lmc.mpRoomMods({ room: 'U/TEST-1234-5678-9999', waitMs: 15000 });
const took = Date.now() - t0;
log('SUB ' + JSON.stringify({ ok: r.ok, name: r.name, count: r.count, wire: r.wire ? r.wire.length : 0, ms: took }));
if (r.ok && r.wire) {
  const d = await window.lmc.mpModsDiff({ instance: 'mpsync-guest', manifest: r.wire });
  log('SUB-DIFF ' + JSON.stringify({ ok: d.ok, missing: d.missing.map(m => m.f), outdated: d.outdated.length }));
}
return { ok: !!(r.ok && r.count === 3), lines };
