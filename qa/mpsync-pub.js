/* 房主侧：把清单发布到房间频道（配合 qa/mpsync-sub.js 做真实 MQTT 往返）
   跑法：LMC_SMOKE_UI_JS=qa/mpsync-pub.js LMC_SMOKE_GAME_DIR=... electron . */
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const r = await window.lmc.mpPublishMods({ room: 'U/TEST-1234-5678-9999', instance: 'mpsync-host' });
log('PUB ' + JSON.stringify(r));
await new Promise(res => setTimeout(res, 45000));
log('PUB done');
return { ok: !!(r && r.ok), lines };
