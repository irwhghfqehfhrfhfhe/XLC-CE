/* 端到端：真装一个 Fabric 实例（真下载），然后体检它是否「能启动」（不缺加载器本体）
 * 用法：LMC_SMOKE_UI_JS=qa/fabric-install-e2e.js LMC_SMOKE_GAME_DIR=<临时目录> \
 *        LMC_SMOKE_DATA_DIR=<临时目录> electron .
 * 由主进程包进 (async () => { ... })() 执行，返回 { ok, lines }
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MC = '1.21.4';

/* noAssets：只跳过 ~400MB 资源文件（自测不玩，装完只为验证 classpath 完整） */
const r0 = await window.lmc.install({ id: MC, loader: 'Fabric', noAssets: true });
ok(!!r0 && r0.started, '发起 Fabric ' + MC + ' 安装', JSON.stringify(r0));

/* 等实例出现（版本 JSON 是安装最后一步写的，出现即装完） */
let vid = null;
for (let i = 0; i < 400; i++) {
  await sleep(3000);
  const s = await window.lmc.scan();
  const hit = (s.versions || []).find(v => /fabric/i.test(v.id) && String(v.id).indexOf(MC) === 0);
  if (hit) { vid = hit.id; break; }
}
ok(!!vid, '安装产出实例', vid);
if (!vid) return { ok: false, lines: lines.concat('== 安装未完成，后面的检查跳过 ==') };

const ic = await window.lmc.diagIntegrity({ instance: vid, deep: true });
const probs = (ic.integrity && ic.integrity.problems) || [];
ok(ic.ok && ic.integrity && ic.integrity.ok, '装完的实例文件完整（缺加载器本体就会在这里失败）',
  JSON.stringify({ total: ic.integrity && ic.integrity.total, problems: probs.map(p => p.rel + ':' + p.reason).slice(0, 5) }));

ok(/fabric-loader/.test(ic.integrity && ic.integrity.loaderLib), '实例 classpath 里有加载器本体 fabric-loader', ic.integrity && ic.integrity.loaderLib);
ok(/KnotClient/.test(ic.integrity && ic.integrity.mainClass), '主类是加载器本体的 KnotClient', ic.integrity && ic.integrity.mainClass);

const vi = await window.lmc.versionInfo({ id: vid });
ok(vi.ok && /fabric/i.test(vi.loader || ''), '版本识别为 Fabric', vi.loader + ' ' + (vi.loaderVer || ''));

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: 'Fabric 装完即完整（含加载器本体）', lines };
