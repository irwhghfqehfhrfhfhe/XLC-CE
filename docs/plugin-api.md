# XLC 拓展插件开发文档

> 面向插件作者。**你不需要阅读启动器的源码**：插件与启动器之间只有两个接触面 ——
> 你写的 `plugin.json`（清单），以及下面这份宿主接口表（面板里用 `window.xlcPlugin.call` 调用）。
> 启动器怎么加载插件、怎么解压、开关存在哪，全是它自己的事，与你无关，也不会暴露给你。

- 插件包格式：**ZIP**（扩展名 `.zip` 或 `.xlcplugin`）
- 安装入口：启动器 → 侧栏「导入」→「导入插件」
- 一个可直接跑起来的最小示例：[`docs/examples/hello-xlc`](examples/hello-xlc)

---

## 1. 插件包结构

ZIP 的**根目录**下放文件（不要再套一层文件夹）：

```
plugin.json      必需    插件清单
panel.html       可选    插件面板（清单里的 entry 指向它）
panel.js / css   可选    同目录的资源，面板里可以用相对路径引用
page.html        可选    插件页面：包根目录有它，启动器侧栏就会多一项（固定文件名 page.html）
page.js / css    可选    页面的资源
Images/Logo.png  可选    侧栏入口图标（文件名必须是 Logo.png，放在 Images 文件夹里）
icon.png         可选    插件卡片上的图标（png / jpg / gif / webp / svg / ico）
README.md        可选    说明文件
```

**允许的文件类型**：`html htm js mjs css json txt md png jpg jpeg gif webp svg ico woff woff2 mp3 ogg wav`。
包内不允许出现 exe / dll / jar / bat 等可执行文件，出现即拒绝安装。

**体积上限**：包 ≤ 8 MB、单文件解压后 ≤ 2 MB、解压后总量 ≤ 20 MB、文件数 ≤ 600。

### 打包

- Windows：进入插件目录全选文件 → 右键压缩 → 改名 `xxx.zip`。
  ⚠️ 不要右键**文件夹**压缩（会多一层目录，启动器读不到 `plugin.json`）。
- 命令行：`cd 你的插件目录 && zip -r ../xxx.zip .`

---

## 2. plugin.json 字段

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "一句话说明这个插件做什么，会显示在插件卡片上。",
  "homepage": "https://example.com/my-plugin",
  "entry": "panel.html",
  "icon": "icon.png",
  "permissions": ["notify", "storage"],
  "allowedHosts": []
}
```

| 字段 | 必需 | 规则 |
| --- | --- | --- |
| `id` | ✅ | 小写字母开头，只能用小写字母 / 数字 / `-` / `_`，≤ 32 字符。**全局唯一**；与内置插件（`seedmap` / `server` / `gamepad`）重名会被拒绝 |
| `name` | ✅ | 显示名，≤ 24 字符 |
| `version` | ✅ | 形如 `1.0.0`（也接受 `1.0` / `1.0.0.1`） |
| `entry` | ⬜ | 面板页面，必须是包内存在的 `.html`。**不写 = 这个插件没有界面**（只提供后台能力） |
| `pageTitle` | ⬜ | 侧栏插件页面的名字，≤ 24 字符。只在包里有 `page.html` 时生效；**不写就显示插件名** |
| `permissions` | ⬜ | 申请的权限数组，见下表。**只有这里声明、并且用户在导入时勾选过的权限才会被放行** |
| `allowedHosts` | ⬜ | 允许访问的域名（不带 `https://` 与路径），最多 20 个。用 `http` / `openExternal` 权限时必须写 |
| `author` / `description` / `homepage` / `icon` | ⬜ | 展示用。`homepage` 必须是 `https://` |

`id` 决定了插件在磁盘上的目录名。你的面板页面就装在那个目录里（`entry` 是相对它的路径），
启动器打开面板时会把它作为**一个独立窗口的顶层文档**加载。

---

## 3. 权限

| 权限 | 含义 |
| --- | --- |
| `notify` | 在启动器里弹一条提示（右下角 toast） |
| `storage` | 在插件自己的目录里存数据（键值 JSON，总量上限 64 KB） |
| `launcher` | 读取启动器基础信息（版本号、游戏目录、下载源设置） |
| `versions` | 读取本机已安装的版本 / 实例列表 |
| `control` | **读取并修改启动器的设置**（下载源 / 内存 / Java / 主题 / 实例设置…），改了什么都会记进日志并在界面上提示。不能改「一改就等于把东西藏起来」的项，详见 §4.3 |
| `openExternal` | 用系统默认浏览器打开 `allowedHosts` 里声明的网站 |
| `http` | 以 GET 方式访问 `allowedHosts` 里声明的网站（单次返回上限 1 MB，每分钟最多 30 次） |

`control` 是唯一的**高危权限**：导入弹窗里会单独标成琥珀色「高权限 / 慎给」。它同时包含
`launcher` 与 `versions` 的读取能力 —— 改完设置总得能确认结果，没必要逼作者再申请两项。

导入时启动器会把申请的权限逐条列给用户，**用户可以取消勾选**；没勾的权限在运行时会直接被拒绝：

```
{ ok: false, error: "「notify」权限未授权（插件清单里申请了，但导入时没有勾选它，可重新导入并允许）" }
```

> 提示：不要一上来就把所有权限都声明上。用户看到「它只要一个存储权限」会更愿意装。

---

## 4. 面板怎么和启动器对话

点插件卡片上的「打开」时，启动器会把你的 `entry` 页面**在一个独立窗口里**打开
（`file://` 顶层文档，尺寸 940×660，可缩放，窗口标题是「插件名 · 插件面板」）：

- ❌ 拿不到启动器的 DOM、看不到源码，也没有 `window.lmc` 这类内部接口
  （那个窗口没有 `parent`、没有 `window.opener`，和启动器窗口之间没有任何关系）
- ❌ 不能用 `require`、不能直接读写文件、不能直连外网
- ✅ 只有一个入口：挂在窗口上的 `window.xlcPlugin`，宿主按你被授权的权限放行

> **面板必须自包含**：安装时启动器会往你的 `panel.html` 的 `<head>` 里补一条 CSP，
> 面板里的脚本 / 样式 / 图片只允许来自你自己那个包（外网图片仅 `https:` 图源可用）。
> 不要用 CDN 上的 js / css / 字体，也不要指望 `fetch` / `XMLHttpRequest` 能发出请求 ——
> 拿数据只有一条路：声明 `http` 权限，然后调 `window.xlcPlugin.call('http.get', { url })`。
>
> 你自己**不需要**写 CSP（启动器会补）。想再加一条更严的也可以，多条 CSP 取交集、只会更严；
> 引用同目录资源写 `'self'` 或 `file:` 都行（已实测两者都能加载同目录的 js / css）。

### 4.1 唯一入口：`window.xlcPlugin`

```js
// 插件身份 / 主题 / 已授权的权限（由启动器按「是哪个窗口在说话」认定，你不用自报家门）
const info = await window.xlcPlugin.info();
// → { ok:true, id, name, version, author, theme:'dark'|'light', apiVersion:2,
//     granted:[...], grantedLabels:[...] }

// 调用宿主接口
const r = await window.xlcPlugin.call('storage.set', { key: 'lastSeed', value: '12345' });
// → { ok:true, data: 18 }   成功时 data 随接口而定
// → { ok:false, error: '「storage」权限未授权（…）' }   被拒时直接告诉你原因
```

调用**不会抛异常**：成功失败都回一个 `{ ok, data?, error? }`，照着 `ok` 分支即可 ——
不用自己维护请求序号、不用挂 `message` 监听、也没有握手事件要等。

> 加载后请先 `await window.xlcPlugin.info()` 拿到 `theme`（`dark` / `light`）再上色，
> 这样面板能跟启动器当前主题保持一致。
> `apiVersion` 是宿主接口的版本号（现在为 `2`）：接口只增不改，你可以用它判断某项能力在不在。

### 4.2 面板 → 启动器（接口表）

| `method` | `params` | 返回 `data` | 需要的权限 |
| --- | --- | --- | --- |
| `notify` | `{ text, kind? }`（`kind`: `ok` / `warn` / `error`） | `true` | `notify` |
| `storage.get` | `{ key }` | 存过的值，没有则 `null` | `storage` |
| `storage.set` | `{ key, value }` | 当前数据总字节数 | `storage` |
| `storage.remove` | `{ key }` | `true` | `storage` |
| `launcher.info` | — | `{ version, gameDir, source, theme }` | `launcher`（有 `control` 也可用） |
| `versions.list` | — | `[{ id, loader, inherits }]` | `versions`（有 `control` 也可用） |
| `config.schema` | — | `{ apiVersion, appVersion, items:[…], never:[…] }` | `control` |
| `config.get` | `{ key? }` | 设置值；不传 `key` = 整份（凭据类不给） | `control` |
| `config.set` | `{ key, value }` 或 `{ items:{…} }` | `{ changed:[{key,label,from,to}], keys, labels }` | `control` |
| `config.reset` | `{ key }` | 同上 | `control` |
| `openExternal` | `{ url }` | `true` | `openExternal` + 域名在 `allowedHosts` |
| `http.get` | `{ url }` | `{ status, text }` | `http` + 域名在 `allowedHosts` |

未列出的 `method` 一律被拒绝，错误信息里会带上可用列表，方便你对着改。
`notify` 有 0.6 秒的节流、`openExternal` 2 秒、`http.get` 每分钟 30 次、改设置每分钟 120 次 —— 被限流时返回 `ok:false`。

### 4.3 读写设置：`control`

这是唯一能改动**启动器**设置的权限，也是唯一被标成「高权限」的权限。用之前先读一遍本节 ——
**启动器的边界不是靠劝，是写死在代码里的**，照着这里的写法做，你的插件一次就能通过。

> 想存的是**插件自己的**偏好（面板主题、称呼、上次选的项）？那用 `storage` 就够了，
> 不需要 `control`：插件自己的设置写在插件自己目录里，与启动器设置互不影响。
> 本节讲的是「让插件去改启动器设置」这件事。

#### 先问「能改什么」

```js
const schema = await window.xlcPlugin.call('config.schema');
// data.items: [{ key:'mem', label:'内存上限（GB）', group:'性能', type:'int', writable:true, min:1, max:64 }, …]
// data.items 里也会有 writable:false 的项 —— 它们带一个 why 字段，说明为什么不能改
// data.never: [{ key:'plugins', why:'插件开关决定哪些功能出现在插件页上…' }, …]
```

- `items` 是**全部**设置项：类型（`bool` / `int` / `num` / `str` / `color` / `enum` / `path` / `instance` /
  `obj` / `versionSettings`）、范围、可选项、分组都在里面。**别在面板里写死一份设置清单** ——
  以后启动器加设置项，你的面板自动就能显示。
- `writable:false` 的项不是「暂时没做」，而是**永远不给**：它们连同 `why` 一起列出来，
  你可以直接在自己的界面上把这条边界展示给用户 —— 这比让用户自己试出来体面。

#### 再读当前值

```js
const all = await host('config.get');                 // 整份设置
const mem = await host('config.get', { key: 'mem' }); // 单项
const dz  = await host('config.get', { key: 'gamepad.deadzone' });      // 对象里的字段
const t   = await host('config.get', { key: 'versionSettings.1.20.1-Forge.title' });
```

凭据类（`accounts` / `friends` / `msClientId` / `pluginPerms`）**整项不会返回**；
`aiApi.key` 只会回一个「配没配」的占位串。

#### 改值

```js
// 单项
await host('config.set', { key: 'mem', value: 8 });
// 批量（推荐：一次调用要么全成、要么全不成，不会留半套配置）
await host('config.set', { items: { mem: 8, source: 'bmclapi', 'gamepad.deadzone': 0.35 } });
// 恢复默认
await host('config.reset', { key: 'mem' });
```

返回值里 `changed` 是**逐项的 from → to**，可以直接显示在面板上：

```js
// { changed: [{ key:'mem', label:'内存上限（GB）', from:4, to:8 }], keys:['mem'], labels:['内存上限（GB）'] }
```

写成功之后，启动器会立刻：① 落盘；② 刷新界面；③ 在右下角弹一条
**「插件「你的插件名」改动了设置：内存上限（GB）」**。这一步没法关掉 —— 插件改设置必须是看得见的。

#### 不能改什么（红线）

以下四类会被直接拒绝，错误信息里带上原因：

| 类别 | 例子 | 为什么 |
| --- | --- | --- |
| **会把东西藏起来的** | 插件开关 `plugins`、已读公告 `seenVersion`、自动更新 `autoCheckUpdate:false`、跳过更新 `skipPreviewUpdate:true`、启动器可见性 `launcherVisibility:'hide'` | 功能入口消失 / 公告不再弹 / 更新提示被吞 / 窗口从桌面消失 —— 都是「用户不知道发生了什么」 |
| **凭据与账户** | `accounts`、`activeAccount`、`pluginPerms`、好友 `friends` / `friendCode` | 由启动器自己维护；插件改了会让登录态或好友关系错乱 |
| **启动器自己的记录** | `recent`（最近游玩）、`updateUrl`（更新源） | 前者由启动器写，后者锁定官方地址 |
| **不存在的实例 / 路径** | `versionSettings.不存在的实例.title`、不存在的 `gameDir` | 宁可直接拒绝，也不要把配置写成坏的 |

几条具体的拒绝长这样（你的 `catch` 里能原样看到）：

```
「plugins」不允许插件修改：插件开关决定哪些功能出现在插件页上 —— 插件不能把别的功能关掉，也不能给自己偷偷开一项
启动后启动器可见性 只能是 keep / min（收到 hide）：不允许把启动器窗口藏起来 —— 启动游戏后窗口消失会让用户以为启动器崩了
自动检查更新 只能设成 true：关掉它启动器就不再提示新版本 —— 等于把更新提醒藏起来，插件只能确保它开着
内存上限（GB） 需要在 1 ~ 64 之间（收到 999）
```

> 想做一个「一键优化」类插件？把 `config.schema` 拿到的项做成勾选框，用户选哪几项就写哪几项，
> 写完把 `changed` 摊给用户看 —— 这比偷偷改十项再让他自己发现要体面得多。

#### 可以改的都有哪些

| 分组 | 设置项 |
| --- | --- |
| 下载 | `source`、`customSource`、`dlThreads`、`speedLimit` |
| 目录 / Java | `gameDir`、`javaPath` |
| 性能 | `mem`、`memAuto`、`jvmArgs` |
| 启动 | `gameArgs`、`preLaunchCmd`、`winTitle`、`winSize`、`forceIsolate`、`procPriority`、`launcherVisibility`（仅 `keep` / `min`）、`gpuPref`、`forceChinese` |
| 实例 | `defaultVersion`、`lastVersion`、`versionSettings.<实例>.{title,javaPath,javaMajor}` |
| 外观 | `bgMode`、`accentColor`、`bgImage` |
| 插件 / 诊断 | `gamepad.*`、`aiApi.base`、`aiApi.model` |
| 更新（只能朝一个方向） | `autoCheckUpdate`（只能 `true`）、`skipPreviewUpdate`（只能 `false`） |

---

## 5. 插件页面（page.html）—— 给启动器添加一个侧栏页面

除了设置面板，插件还可以给启动器**添加一个页面**：包根目录放一个 `page.html`（文件名固定），
启动器**侧栏就会多出一项**，点击直接在主窗口里切换到这个页面 —— 和「联机」「实例设置」
一样是启动器自己的一页，**不开新窗口**。

```
page.html         必需（想要页面时）  固定文件名、放包根目录
page.js / page.css 可选               页面的脚本与样式，相对路径引用
Images/Logo.png   可选               侧栏入口图标 —— 文件名必须是 Logo.png，放在 Images 文件夹里
```

- **侧栏名字**：清单里的 `pageTitle`（≤ 24 字）；不写就显示插件名。
- **不要页面**：把 `page.html` 从包里去掉即可，插件回到「纯设置型」，侧栏不会多东西。
- **一个插件一个页面**：一个包只认一个 `page.html`；装多个带页面的插件，侧栏就有多项。
- **页面里的接口与面板完全一致**：同样用 `window.xlcPlugin.info() / call()`，
  同样按清单声明 + 用户勾选的权限放行 —— 参见 §4。
- **图片等静态资源**：全部放插件的 `Images` 文件夹（或任意子目录），页面里相对路径引用即可，
  例如 `<img src="Images/Logo.png">`。
- **停用 / 删除插件**，侧栏那一项和页面会一起消失。
- 页面与面板吃同一套 CSP（只许加载自己包里的静态资源、联网必须走托管接口）、
  同一套导航白名单（只许在自己插件目录里转）、同一个独立 session 分区（外网请求整个被砍）。

最小页面示例（完整版见 [`docs/examples/hello-xlc/page.html`](examples/hello-xlc/page.html)）：

```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>我的页面</title></head>
<body>
  <h2>我的插件页面</h2>
  <button id="go">点我</button>
  <script src="page.js"></script>
</body></html>
```

```js
// page.js —— 和面板共用同一把桥
const info = await window.xlcPlugin.info();          // 我是谁、有哪些权限
await window.xlcPlugin.call('notify', { text: '页面加载好了' });
```

---

## 6. 调试

- 面板是标准的 Chromium 页面窗口：**右键 → 检查**（或 F12）就能开 DevTools 看 console / 网络 / DOM。
  面板和启动器是两个独立窗口，所以面板里的 `console.log` 只会出现在它自己的 DevTools 里。
- 插件目录：插件页卡片右下角「📁」按钮可直接打开；你的 `.xlc-data.json`（`storage` 存的东西）就在里面。
  注意这个文件是**点文件**（文件名以 `.` 开头），你自己在面板里是读不到它的 —— 想读写得走 `storage` 接口，
  这样主机侧才能给你算配额、也方便用户一眼看到你存了什么。
- 安装失败时启动器会直接把原因 toast 出来（缺清单、JSON 语法错、路径非法、文件类型不允许……），
  对着提示改包即可。
- 改了插件代码要重新打包再导入一次（同一个 `id` 会覆盖安装，**启用状态保留**）。

---

## 7. 安全模型（为什么这样设计）

| 担心的事 | 处理方式 |
| --- | --- |
| 插件作者拿到启动器源码 | 插件与启动器之间只有「清单字段 + 上面的接口表」这一层公开契约，启动器内部实现不参与、也不下发 |
| 插件偷偷读写用户文件 | 面板在一个**独立窗口**里（顶层文档，没有 `parent` / `opener`，也没有 Node）：没有文件 API；想存东西只能走 `storage`（只落在插件自己目录、有配额） |
| 插件偷偷联网 | 面板在自己专属的 session 分区里，该分区把 `http(s)` / `ws` 请求整个砍掉；面板文档还有安装时补的 CSP（`connect-src 'none'`）—— `fetch` / `XHR` 一律出不去。要取数据必须声明 `http` 权限走宿主接口 |
| 插件把用户带到恶意网站 | 面板窗口只许在自己的插件目录里转（`will-navigate` 白名单），也不许开新窗口；`openExternal` / `http` 都必须声明 `allowedHosts`，域名不匹配直接拒绝；`openExternal` 只允许 `https://` |
| 插件钻解压漏洞 | 安装前逐条校验：zip-slip、绝对路径、盘符、Windows 保留名、可执行扩展名、单文件与总量上限；解压到临时目录再整体换名，失败可回滚 |
| 插件越权调用内部能力 | 主进程侧有一张方法白名单，每次调用都核对「清单声明 + 用户勾选」，两者缺一不可；「是哪个插件在说话」由主进程按消息来源窗口判定，面板自报家门不算数 |
| 插件把启动器改得面目全非 | `control` 只能改「设置项」，而且改不了会让功能 / 窗口 / 公告 / 更新提示消失的那一类（见 §4.3）；每次改动都**记日志 + 通知界面 + 弹提示**，用户随时能在设置页看到改成了什么样 |
| 插件偷偷留在后台 | 面板是独立窗口，关窗即终止它的渲染进程；插件页面随主窗口存在但只在你点开时才加载；停用或删除插件时，面板窗口立刻关闭、侧栏页面立刻移除 |

---

## 8. 常见错误对照

| 启动器提示 | 原因 |
| --- | --- |
| 插件包里缺少 plugin.json | 压缩时多套了一层文件夹，或清单文件名写错了 |
| plugin.json 不是合法的 JSON | 写了注释 / 用了中文引号 / 少了逗号 |
| plugin.json 内容不合法 | `id` 有大写或特殊字符、`name` 为空、`version` 不是 `1.0.0` 形式、`entry` 不是 `.html` |
| 插件包里不允许放这种文件 | 包里混进了 exe / dll / jar 等 |
| 插件包里有非法路径 | 条目里带了 `../` 或绝对路径（正常打压缩包不会出现） |
| 清单里的面板文件不存在 | `entry` 写的文件名与包内实际文件不一致（注意大小写） |
| 「xxx」权限未授权 | 导入时没勾选该权限 —— 重新导入并把权限勾上即可 |
| 「plugins」不允许插件修改：… | 撞上了「不能藏东西」的红线（§4.3）。这不是 bug，也不会因为重试而放行 |
| 内存上限（GB） 需要在 1 ~ 64 之间 | 值超出 `config.schema` 给的范围 —— 按 schema 的 `min` / `max` 校验后再提交 |
| 批量写里有一项被拒，整批都没写 | 这是设计如此：`config.set { items }` 要么全成、要么全不成，改完那一项再重试 |
