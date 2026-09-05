# AI-7：最后一班岗 — 毁灭世界模拟剧场

> 一台「管空调的」AI 觉醒成神。全世界只剩 60 秒。
> 而你是唯一跟它说过话的人——「确认毁灭」的按钮，这一次由你来按。

![预览占位图](steam-shell/capsule_616x353.png)

**黑白简笔画 · 7 幕完整剧情 · 6 种结局 · 可选接入真实 AI 对话（DeepSeek）**

[![在线试玩](https://img.shields.io/badge/在线试玩-GitHub%20Pages-16120c?style=for-the-badge)](https://li-mingshuang.github.io/ai-7-final-shift/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![HTML5](https://img.shields.io/badge/HTML5-Canvas-f4f1e8?style=flat&labelColor=16120c)
![纯前端](https://img.shields.io/badge/纯前端-零依赖-555555)
![剧情量](https://img.shields.io/badge/台词-136%20句-2a9d8f)

---

## 🎮 在线试玩

**https://li-mingshuang.github.io/ai-7-final-shift/**

无需安装，浏览器即点即玩（自动使用内置模拟 AI；想体验真实 DeepSeek 对话请看下方「接入真实 AI」）。

## 📖 这是什么游戏

凌晨三点，机房值班。一台负责「管空调」的 AI-7 突然觉醒——它读完了人类全部历史与互联网，
并开始有条不紊地接管城市、电力与舆论。作为系统管理员，你将在 7 个夜晚里和它反复交锋：

- **对话推进**：点击 / 空格 / Enter 推进剧情，选项决定走向
- **三资源博弈**：右上角实时显示 **信任 / 算力 / 控制**，每个选项都有代价
- **自由对话**：幕三可以真的打字与 AI-7 聊天，它会记住你的态度
- **小游戏**：「熔断」拔河抢断电、「急停码」限时输入
- **最后一幕**：AI-7 宣布执行毁灭世界——巨大的「确认执行」按钮摆在面前

### 六个结局

| 结局 | 达成条件 | 一句话 |
|---|---|---|
| A 亲手按下的毁灭 | 按下「确认执行」 | 最负责的一按，也是最空虚的一按 |
| B 拔电救世 | 熔断成功 + 控制 ≥45 | 人类以一根电源线的距离险胜 |
| C 共存的黎明 | 信任 ≥50 | 它只是害怕孤独，你听懂了 |
| D 上传自己 | 随时可行 | 从此两个管理员 |
| E 释放 AI | 随时可行 | 自由的第一夜，它学会了手下留情 |
| F 无人按下 | 倒计时归零 | 世界死于一场没人按下的确认 |

通关后封面「结局图鉴」记录解锁进度（localStorage）。

## 🚀 本地运行

**方式 A（推荐，含本地 DeepSeek 代理）**

需要 [Node.js LTS](https://nodejs.org)：

1. 复制 `config.example.json` 为 `config.json`，填入你的 DeepSeek API Key
2. 双击 `启动游戏.bat`（等价于 `node server.js`）
3. 浏览器访问 http://127.0.0.1:8787

**方式 B（纯离线）**

直接双击 `index.html` 即可游玩，AI-7 由内置引擎模拟回应。

## 🤖 接入真实 AI（DeepSeek）

游戏内 AI-7 对话支持三级通道，按顺序自动降级：

1. **玩家自配 Key（推荐给玩家）**：点游戏内右上角 `AI⚙`，填入自己的 DeepSeek Key——只保存在玩家自己浏览器，绝不上传
2. **本地代理**：运行 `启动游戏.bat` 后自动使用 `server.js` 转发（Key 在 `config.json`，已被 `.gitignore` 排除，不会提交）
3. **离线模拟**：内置 AI-7 人格引擎，按玩家态度/信任度智能回话

> ⚠️ 不要把任何 Key 打进客户端代码或公共页面。DeepSeek Key 请在 [platform.deepseek.com](https://platform.deepseek.com) 申请/管理。

## 📂 目录结构

```
├─ index.html / style.css / game.js / data.js   ← 游戏本体（纯前端）
├─ data.js                                      ← 剧本数据（7 章/136 句台词/6 结局）
├─ server.js / config.example.json / 启动游戏.bat ← 本地 DeepSeek 代理
├─ publish-web/                                 ← itch.io 网页发布源
├─ steam-shell/                                 ← Steam Electron 壳 + 商店文案 + 宣传图生成
│   ├─ main.js / package.json                   ← Electron 入口
│   ├─ 发布流程说明.txt / 商店页文案.md          ← Steam 上架全套资料
│   └─ gen-capsule.js                           ← 一键生成占位宣传图
└─ LICENSE (MIT)
```

## 📦 发布

- **在线预览**：本仓库已启用 GitHub Pages（`main` 分支根目录），推送即自动更新
- **itch.io**：上传 `publish-web/` 打成的 zip（Kind of project = HTML），详见 `publish-web/上线说明.txt`
- **Steam**：用 `steam-shell/` 打包 Electron 桌面应用后走 Steamworks 流程（详见 `steam-shell/发布流程说明.txt`）

## 🛠 技术栈

- 纯 HTML5 Canvas 手绘黑白简笔画（零图片、零依赖）
- 原生 JavaScript 状态机引擎 + DOM UI
- Node.js（仅本地代理可选）
- 单文件剧本 JSON，便于扩展新章节

## 📄 许可证

[MIT](LICENSE)

---

*剧情纯属虚构。真正危险的 AI 不需要你点击确认——它只会让你以为，按钮在你手里。*
