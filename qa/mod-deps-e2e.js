/* 端到端：往真装好的 Fabric 实例里装一个「有前置依赖」的 MOD（JEI），
 * 验证 ① MOD jar 下载后校验通过 ② required 前置（Fabric API）被自动装进同一个 mods 目录
 * 用法：LMC_SMOKE_UI_JS=qa/mod-deps-e2e.js LMC_SMOKE_GAME_DIR=<已有实例的目录> electron .
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const scan = await window.lmc.scan();
const inst = (scan.versions || []).map(v => v.id).find(id => /fabric/i.test(id));
ok(!!inst, '找到 Fabric 实例', inst);
if (!inst) return { ok: false, lines };

/* Iris：声明了 required 前置 sodium（1.21.4 Fabric 有构建），用来验「前置自动补齐」 */
const r = await window.lmc.modrinthInstallMod({ projectId: 'iris', versionId: inst, instance: inst });
ok(!!r && r.ok, '安装 Iris 成功', r && (r.file || r.error));
const deps = (r && r.deps) || [];
ok(deps.some(d => /sodium/i.test(d) && !/（/.test(d)), '自动装上了前置 Sodium', JSON.stringify(deps));

const list = await window.lmc.modsList({ instance: inst });
const names = ((list && (list.mods || list.items)) || []).map(m => m.name || m.file || '');
ok(names.some(n => /iris/i.test(n)), 'mods 目录里能看到 Iris', names.join(',').slice(0, 200));
ok(names.some(n => /sodium/i.test(n)), 'mods 目录里能看到 Sodium', names.join(',').slice(0, 200));

/* 再装一次同名 MOD：应该被重复安装拦截，而不是静默覆盖 */
const dup = await window.lmc.modrinthInstallMod({ projectId: 'iris', versionId: inst, instance: inst });
ok(dup && dup.ok === false && /已安装/.test(dup.error || ''), '重复安装被拦住', dup && dup.error);

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: 'MOD 前置自动补齐', lines };
