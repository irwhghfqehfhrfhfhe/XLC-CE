# XLC CE Launcher

> Xero Lite Craft —— 免费、开源、绿色便携的现代化 Minecraft 启动器。当前版本 **1.4.15**。

官网：https://xlc-ce-launcher.app.workbuddy.host/?sharecode=FTJRRJTHES

## 它能做什么

- **两套界面**：经典深色 / 浅色主题，以及照 Minecraft 基岩版重做的全屏界面，左上角一键切换，数据共用。
- **版本管理**：正式版 / 快照 / 远古版本，Fabric / Forge / NeoForge 自动配对 Java；原版基座默认隐藏，不污染版本列表。
- **一站式下载**：Mod、整合包、资源包、光影、数据包，基岩版下载页还有独立的 Java 页。
- **存档与插件**：存档卡小铅笔改名（自动备份 `level.dat`）、四个内置插件开箱即用。
- **联机与账户**：内置陶瓦联机（建房 / 加入 / 模组核对）、离线与微软账户、多账户皮肤切换。
- **自由定制**：标题、按钮、存档卡、侧栏按钮的大小与位置可调；联机 / 账户 / 更衣室为满屏面板。
- **基岩版细节**：黄色标语与日期彩蛋、常驻下载进度、实例角标就地切版本、背景跟随时间、实例管理页签。

## 快速开始

需要 Node.js 18+（开发）与 Windows 10/11 x64（运行）。

```bash
npm install
npm start          # 直接启动 Electron 开发版
npm run dist       # 打包 Windows 便携版与绿色压缩包
```

产物位于 `dist/XLC-CE-Launcher-<版本>-portable.exe` 与 `-green.zip`。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `main.js` | 主进程：窗口、IPC、下载、实例与存档处理 |
| `preload.js` | 渲染进程安全桥接 |
| `src/` | 界面与渲染层（含 `bedrock.js` 基岩版界面） |
| `assets/` | 图标、全景图、音效等静态资源 |
| `data/` | 内置 Mod 中文名数据库 |
| `tools/` | 图标 / 音频 / 翻译库等构建与维护脚本 |
| `qa/` | 回归与冒烟测试脚本 |
| `docs/` | 插件 API 与示例 |
| `website/` | 官网源码（星号下载目录不入库） |

## 协议

基于 [MIT](LICENSE) 协议开源。第三方组件见 [THIRD-PARTY.md](THIRD-PARTY.md)。

Minecraft 是 Mojang Synergies AB 的商标；本项目与 Mojang / Microsoft 无隶属关系。
