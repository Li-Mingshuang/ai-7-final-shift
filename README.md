# AI 毁灭世界：最后一班岗

黑白简笔画互动剧场 · 可接入 DeepSeek 让 AI‑7 与你实时对话 · 6 种结局

## 运行方式

### 方式 A：推荐（含在线 AI 对话）
1. 双击 **`启动游戏.bat`**（需已安装 Node.js：https://nodejs.org 下载 LTS）
2. 浏览器会自动打开 `http://127.0.0.1:8787`
3. 右上角状态显示 `● 在线 AI` 即表示 DeepSeek 已接入

### 方式 B：纯离线（双击 index.html）
直接双击 `index.html` 也能玩：剧情完整，聊天环节由「本地模拟 AI‑7」兜底回应，仅失去联网对话的真实感。

## 配置 DeepSeek
- API Key 配置在 `config.json` 的 `apiKey` 字段（也可用环境变量 `DEEPSEEK_API_KEY` 覆盖）。
- **重要**：`config.json` 只存在你本机。发布给别人玩时，key 必须保留在你自己的服务器上，绝不可打进客户端——任何拿到你页面代码的人都会看到 key。

## 操作
- 点击对话 / 空格 / Enter 推进剧情
- 点击选项按钮做出抉择（注意右上角 信任/算力/控制 的增减）
- 自由聊天环节直接打字回车，可与 AI‑7 对话
- 小游戏：「熔断」狂按空格/点击拉闸；「急停码」倒计时内输入代码
- 终章会出现巨大「确认执行 · 毁灭世界」按钮，以及若干分支行动

## 六个结局
A 亲手按下　B 拔电救世　C 共存　D 上传自己　E 释放 AI　F 无人按下
封面「结局图鉴」可查看已解锁结局；进度保存在浏览器 localStorage。

## 发布
- **itch.io（最快）**：直接上传项目根目录的 `AI-7末日剧场_itch.zip`（HTML 项目），详见 `publish-web/上线说明.txt`。
- **Steam**：用 `steam-shell/` 的 Electron 壳打包成桌面应用，再走 Steamworks 流程，详见 `steam-shell/发布流程说明.txt`（注册、$100 Direct 费、商店页、SteamPipe 上传步骤）。
- 游戏本体每次改动后，请把 `index.html / style.css / game.js / data.js` 同步覆盖到 `publish-web/` 与 `steam-shell/web/`。
- AI 联网：发布版默认离线；玩家点右上角 `AI⚙` 可填**自己的** DeepSeek Key（仅存本地），不要在客户端内置共享 Key。
- 在线 AI 本地代理版仍由 `启动游戏.bat` + `server.js` + `config.json`（key 只在你本机）提供。
