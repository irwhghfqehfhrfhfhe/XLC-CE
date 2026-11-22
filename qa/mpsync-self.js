/* 单进程自问自答：先订阅房间频道，再自己发布（公共 broker 会把消息回投给订阅者），
   用来验证 topic 派生 / 编解码 / 订阅重试这一整条链路（不依赖第二台机器）。 */
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const room = 'U/SELF-TEST-0001-AAAA';
const p = window.lmc.mpRoomMods({ room, waitMs: 15000 });
await new Promise(r => setTimeout(r, 2500));
const pub = await window.lmc.mpPublishMods({ room, instance: 'mpsync-host' });
log('PUB ' + JSON.stringify(pub));
const r = await p;
log('SELF ' + JSON.stringify({ ok: r.ok, count: r.count, name: r.name, wire: r.wire ? r.wire.length : 0 }));
return { ok: !!(r.ok && r.count === 3), lines };
