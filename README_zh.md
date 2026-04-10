[English](README.md) | **中文**

# Chat Exporter

[![Release](https://img.shields.io/github/v/release/lroolle/chat-exporter?style=flat-square)](https://github.com/lroolle/chat-exporter/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/chrome-MV3-brightgreen?style=flat-square&logo=googlechrome&logoColor=white)](https://github.com/lroolle/chat-exporter/releases)
[![Firefox MV2](https://img.shields.io/badge/firefox-MV2-orange?style=flat-square&logo=firefox&logoColor=white)](https://github.com/lroolle/chat-exporter/releases)

一个浏览器扩展，把你的 AI 对话导出为干净的 Markdown 文件。一键操作，无需服务器，无需注册账号。就是一个 `.md` 文件，到手了。

支持 **ChatGPT**、**Claude**、**Gemini** 和 **Grok**。

## 安装

### 简单方式（预构建包）

去 [Releases](https://github.com/lroolle/chat-exporter/releases) 下载最新的 `.zip`。

**Chrome / Edge / Brave / Arc：**

1. 解压 `chat-exporter-chrome-mv3-x.x.x.zip`
2. 打开 `chrome://extensions/`
3. 右上角打开 **开发者模式**
4. 点 **加载已解压的扩展程序** -> 选刚解压的文件夹
5. 搞定。去和 AI 聊天吧。

**Firefox：**

1. 解压 `chat-exporter-firefox-mv2-x.x.x.zip`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点 **临时载入附加组件** -> 选解压文件夹里的任意文件
4. 搞定。（临时附加组件在 Firefox 重启后会消失。这是 Firefox 的锅，不是我们的。）

### 自己构建

```bash
git clone https://github.com/lroolle/chat-exporter.git
cd chat-exporter
npm install
npm run build          # Chrome (MV3)
npm run build:firefox  # Firefox (MV2)
```

产物在 `dist/chrome-mv3/` 或 `dist/firefox-mv2/`。加载方式同上。

## 怎么用

1. 打开任意支持平台上的对话
2. 看到右下角那个深色浮动气泡没？点它。
3. 一个 `.md` 文件下载了。就这样。没有第 4 步。

气泡在导出时会转圈，成功显示绿色对勾，失败显示红叉（去浏览器控制台看详细信息）。

## 支持平台

| 平台 | URL | 提取方式 |
|------|-----|----------|
| **ChatGPT** | `chatgpt.com`、`chat.openai.com` | DOM 抓取，通过 `data-message-author-role` 属性定位。支持 GPTs、Projects、内联图片（base64）、KaTeX/MathJax 数学公式。 |
| **Claude** | `claude.ai` | 优先调用 Claude 内部 API（需要你的活跃会话）。API 挂了就回退到 DOM 抓取。保留 Artifacts、思维链和对话分支。 |
| **Gemini** | `gemini.google.com` | DOM 抓取。自动滚动加载懒加载消息。支持数学公式块、Gems，会过滤掉 Gemini 的引用噪音。 |
| **Grok** | `grok.com`、`x.com/i/grok` | 基于 LCA 的轮次分割——从操作按钮（赞/重新生成/复制）向上遍历找到对话根节点。确定性算法，无启发式猜测。保留内联链接为 Markdown 格式。 |

## 导出内容

导出文件长这样：

```
20260410-chatgpt-how-to-mass-rename-files.md
```

文件名格式：`YYYYMMDD-platform-title-slug.md`——在任何文件管理器里都能按时间排序。

文件内容：

```markdown
---
title: "How to mass rename files"
platform: chatgpt
conversation_id: abc123-def456
type: chat
model: gpt-4o
created: 2026-04-10T03:15:21.420Z
exported: 2026-04-10T03:15:22.100Z
messages: 6
source: "https://chatgpt.com/c/abc123-def456"
---

# How to mass rename files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

How do I rename 500 files at once on Linux?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ASSISTANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use `rename` or a `for` loop in bash...
```

Markdown 会保留：
- **代码块**，带语言标注（` ```python ` 等）
- **表格**，正经的 Markdown 表格
- **链接**，`[text](url)` 格式——不会被拍扁成纯文本
- **列表**、**标题**、**加粗/斜体**——该有的都有
- **数学公式**，`$行内$` 和 `$$块级$$`（ChatGPT KaTeX/MathJax）
- **图片**，base64 data URI（ChatGPT）——离线也能看
- Claude 的 **Artifacts**——用带语言标签的代码围栏格式化
- Claude/Gemini 的**思维链**——包裹在 `<thinking>` 标签里

## 设置

点工具栏的扩展图标打开弹窗。三个开关：

| 设置 | 默认值 | 说明 |
|------|--------|------|
| **包含思维链** | 开启 | 导出 Claude 扩展思考和 Gemini 推理的 `<thinking>` 块。如果你只要最终结果，关掉它。 |
| **包含元数据** | 开启 | 添加 YAML frontmatter（标题、平台、模型、时间戳、消息数、来源 URL）。只要纯对话文本的话就关掉。 |
| **包含时间戳** | 开启 | 在 frontmatter 里添加 `created` 和 `exported` 时间戳。不在乎时间的话就关掉。 |

设置通过 `chrome.storage.sync` 跨设备同步。

## 权限

扩展只请求这些权限，多一个都没有：

- `activeTab`——访问当前标签页来抓取对话
- `scripting`——注入内容脚本
- `downloads`——触发 `.md` 文件下载
- `storage`——保存那三个开关设置
- Host 权限仅限 6 个支持的域名

没有后台网络请求。没有分析。没有遥测。所有逻辑都在浏览器本地运行。你的对话永远不会离开你的电脑。

## 踩坑指南

- **x.com 上的 Grok**：扩展会自动滚动加载完整对话。长对话需要几秒钟。气泡转圈就是在干活。
- **Claude API 提取**：用你 `claude.ai` 的活跃会话 cookie 调内部 API。如果你退出登录或会话过期，会回退到 DOM 抓取（这时候会丢失模型名称和时间戳等元数据）。
- **Firefox 用的是 MV2**：Firefox 至今没有完全支持扩展的 Manifest V3。Firefox 构建版自动使用 MV2。功能完全一样，只是打包方式不同。
- **懒加载消息**：Gemini 和 Grok 会懒加载对话历史。扩展通过滚动来触发加载。如果你的对话超级长，可能抓不全（Gemini 最多滚 ~60 次，Grok 最多 ~30 次）。
- **DOM 变了就会挂**：这些平台经常更新 HTML 结构。气泡显示红叉的话，八成是 DOM 选择器需要更新了。提个 issue 吧。

## 开发

### 环境准备

```bash
npm install
npm run dev            # Chrome，热重载
npm run dev:firefox    # Firefox，热重载
```

把 `dist/chrome-mv3/` 或 `dist/firefox-mv2/` 目录作为未打包扩展加载。WXT 会处理热重载——保存文件后扩展自动刷新。

### 项目结构

```
entrypoints/
  content.ts           # 内容脚本：气泡 UI + 导出调度
  popup/
    index.html         # 设置弹窗（3 个开关）
    main.ts            # 弹窗逻辑（读写设置）
src/
  core/
    types.ts           # Conversation、Message、PlatformAdapter、Exporter 接口定义
    registry.ts        # 平台 + 导出器注册表（简单的 Map 查找）
    settings.ts        # chrome.storage.sync 封装，带 schema 版本控制
  platforms/
    chatgpt.ts         # ChatGPT 适配器（DOM、图片、数学、GPTs/Projects）
    claude.ts          # Claude 适配器（API 优先、DOM 回退、Artifacts、思维链）
    gemini.ts          # Gemini 适配器（DOM、自动滚动、数学、引用过滤）
    grok.ts            # Grok 适配器（LCA 轮次分割、链接保留）
  exporters/
    markdown.ts        # Markdown 导出器（frontmatter、角色横幅、格式化）
wxt.config.ts          # WXT 框架配置（manifest、权限、图标）
```

### 架构

设计很简单，而且这是故意的：

1. **注册表**模式——平台适配器和导出器在启动时自行注册
2. **内容脚本**在 6 个支持的 URL 上匹配，找到对应的适配器，注入气泡
3. **点击** -> 适配器 `.scrape()` 读取 DOM（或 API）-> 导出器 `.export()` 渲染 Markdown -> 浏览器下载文件
4. **设置**就是 `chrome.storage.sync` 里的三个布尔值

添加新平台：实现 `PlatformAdapter`（两个方法：`matches()` 和 `scrape()`），在 `content.ts` 里注册。完事。

添加新导出格式：实现 `Exporter`，注册。管道不关心你输出什么格式。

### 命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式，Chrome，热重载 |
| `npm run dev:firefox` | 开发模式，Firefox，热重载 |
| `npm run build` | 生产构建，Chrome MV3 |
| `npm run build:firefox` | 生产构建，Firefox MV2 |
| `npm run zip` | 构建 + 打包 Chrome 发布 zip |
| `npm run zip:firefox` | 构建 + 打包 Firefox 发布 zip |
| `npm run fmt` | 用 Prettier 格式化所有文件 |
| `npm run check` | Prettier 检查 + TypeScript 类型检查（不输出编译产物） |

### 技术栈

- [WXT](https://wxt.dev)——浏览器扩展框架（搞定 MV2/MV3、热重载、构建）
- TypeScript——因为人生苦短，谁受得了 `undefined is not a function`
- 零 UI 框架。弹窗是纯 HTML/CSS。气泡是一个带内联样式的 `div`。有时候简单就是好。

## 贡献

欢迎 PR。整个代码库加起来 ~1500 行 TypeScript——一下午就能读完。

如果某个平台改了 DOM 导致提取挂了：更新 `src/platforms/*.ts` 里对应的选择器，在真实对话上测一下，提个 PR。

如果你想加个新平台：看看现有的任意适配器照着写。Grok 适配器在架构上最有意思（LCA 分割）；ChatGPT 适配器功能最全（图片、数学、GPTs）。

## 许可证

MIT
