# Chat Exporter

A browser extension that exports your AI chat conversations to clean Markdown files. One click. No server. No account. Just your conversation as a `.md` file.

Works on **ChatGPT**, **Claude**, **Gemini**, and **Grok**.

## Install

### The Easy Way (Pre-built)

Grab the latest `.zip` from [Releases](https://github.com/lroolle/chat-exporter/releases).

**Chrome / Edge / Brave / Arc:**

1. Unzip `chat-exporter-chrome-mv3-x.x.x.zip`
2. Go to `chrome://extensions/`
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** -> select the unzipped folder
5. Done. Go chat with an AI.

**Firefox:**

1. Unzip `chat-exporter-firefox-mv2-x.x.x.zip`
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** -> pick any file inside the unzipped folder
4. Done. (Temporary add-ons disappear when you restart Firefox. That's a Firefox thing, not our fault.)

### Build It Yourself

```bash
git clone https://github.com/lroolle/chat-exporter.git
cd chat-exporter
npm install
npm run build          # Chrome (MV3)
npm run build:firefox  # Firefox (MV2)
```

Output lands in `dist/chrome-mv3/` or `dist/firefox-mv2/`. Load it the same way as above.

## How It Works

1. Open a conversation on any supported platform
2. See the dark floating bubble in the bottom-right corner? Click it.
3. A `.md` file downloads. That's it. There is no step 4.

The bubble shows a spinner while exporting, a green checkmark on success, or a red X if something went wrong (check the browser console for details).

## Supported Platforms

| Platform | URL | How It Extracts |
|----------|-----|-----------------|
| **ChatGPT** | `chatgpt.com`, `chat.openai.com` | DOM scraping via `data-message-author-role` attributes. Handles GPTs, Projects, inline images (base64), KaTeX/MathJax math. |
| **Claude** | `claude.ai` | Hits Claude's internal API first (needs your active session). Falls back to DOM scraping if the API call fails. Preserves artifacts, thinking blocks, and conversation branches. |
| **Gemini** | `gemini.google.com` | DOM scraping. Auto-scrolls to load lazy-loaded messages. Handles math blocks, Gems, and strips Gemini's citation noise. |
| **Grok** | `grok.com`, `x.com/i/grok` | LCA-based turn segmentation -- walks up from action buttons (Like/Regenerate/Copy) to find the conversation root. Deterministic, no heuristics. Preserves inline links as markdown. |

## What You Get

The exported file looks like this:

```
20260410-chatgpt-how-to-mass-rename-files.md
```

Filename format: `YYYYMMDD-platform-title-slug.md` -- sorts chronologically in any file manager.

Inside:

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

The markdown preserves:
- **Code blocks** with language hints (` ```python `, etc.)
- **Tables** as proper markdown tables
- **Links** as `[text](url)` -- not flattened to plain text
- **Lists**, **headings**, **bold/italic** -- the usual suspects
- **Math** as `$inline$` and `$$block$$` (ChatGPT KaTeX/MathJax)
- **Images** as base64 data URIs (ChatGPT) -- viewable offline
- **Artifacts** from Claude -- formatted with language-tagged code fences
- **Thinking blocks** from Claude/Gemini wrapped in `<thinking>` tags

## Settings

Click the extension icon in your toolbar to open the popup. Three toggles:

| Setting | Default | What It Does |
|---------|---------|--------------|
| **Include thinking** | ON | Export `<thinking>` blocks from Claude's extended thinking and Gemini's reasoning. Turn off if you just want the final answers. |
| **Include metadata** | ON | Add YAML frontmatter (title, platform, model, timestamps, message count, source URL). Turn off for raw conversation text only. |
| **Include timestamps** | ON | Add `created` and `exported` timestamps to frontmatter. Turn off if you don't care when. |

Settings sync across devices via `chrome.storage.sync`.

## Permissions

The extension requests these and nothing else:

- `activeTab` -- access the current tab to scrape the conversation
- `scripting` -- inject the content script
- `downloads` -- trigger the `.md` file download
- `storage` -- save your three toggle settings
- Host permissions for the six supported domains only

No background network requests. No analytics. No telemetry. Everything runs client-side in your browser. Your conversations never leave your machine.

## Gotchas

- **Grok on x.com**: The extension auto-scrolls to load the full conversation. This takes a few seconds on long threads. The bubble spinner tells you it's working.
- **Claude API extraction**: Uses your active `claude.ai` session cookies to call the internal API. If you're logged out or your session expired, it falls back to DOM scraping (which loses some metadata like model name and timestamps).
- **Firefox is MV2**: Firefox still doesn't fully support Manifest V3 for extensions. The Firefox build uses MV2 automatically. Functionally identical; just a packaging difference.
- **Lazy-loaded messages**: Gemini and Grok lazy-load conversation history. The extension scrolls to trigger loading before scraping. If your conversation is absurdly long, it might not catch everything (Gemini caps at ~60 scroll attempts, Grok at ~30).
- **DOM changes break things**: These platforms update their HTML structure regularly. If the bubble shows a red X, the DOM selectors probably need updating. File an issue.

## Development

### Setup

```bash
npm install
npm run dev            # Chrome, hot-reload
npm run dev:firefox    # Firefox, hot-reload
```

Load the `dist/chrome-mv3/` or `dist/firefox-mv2/` directory as an unpacked extension. WXT handles hot-reload -- save a file and the extension reloads automatically.

### Project Structure

```
entrypoints/
  content.ts           # Content script: bubble UI + export orchestration
  popup/
    index.html         # Settings popup (3 toggles)
    main.ts            # Popup logic (load/save settings)
src/
  core/
    types.ts           # Conversation, Message, PlatformAdapter, Exporter interfaces
    registry.ts        # Platform + exporter registry (simple Map-based lookup)
    settings.ts        # chrome.storage.sync wrapper with schema versioning
  platforms/
    chatgpt.ts         # ChatGPT adapter (DOM, images, math, GPTs/Projects)
    claude.ts          # Claude adapter (API-first, DOM fallback, artifacts, thinking)
    gemini.ts          # Gemini adapter (DOM, auto-scroll, math, citation stripping)
    grok.ts            # Grok adapter (LCA turn segmentation, link preservation)
  exporters/
    markdown.ts        # Markdown exporter (frontmatter, role banners, formatting)
wxt.config.ts          # WXT framework config (manifest, permissions, icons)
```

### Architecture

The design is dead simple and that's on purpose:

1. **Registry** pattern -- platform adapters and exporters register themselves at startup
2. **Content script** matches on the six supported URLs, finds the right adapter, injects the bubble
3. **Click** -> adapter `.scrape()` reads the DOM (or API) -> exporter `.export()` renders markdown -> browser downloads the file
4. **Settings** are three booleans in `chrome.storage.sync`

Adding a new platform: implement `PlatformAdapter` (two methods: `matches()` and `scrape()`), register it in `content.ts`. That's it.

Adding a new export format: implement `Exporter`, register it. The plumbing doesn't care what format you output.

### Scripts

| Command | What |
|---------|------|
| `npm run dev` | Dev mode, Chrome, hot-reload |
| `npm run dev:firefox` | Dev mode, Firefox, hot-reload |
| `npm run build` | Production build, Chrome MV3 |
| `npm run build:firefox` | Production build, Firefox MV2 |
| `npm run zip` | Build + zip for Chrome distribution |
| `npm run zip:firefox` | Build + zip for Firefox distribution |
| `npm run fmt` | Format everything with Prettier |
| `npm run check` | Prettier check + TypeScript type check (no emit) |

### Tech

- [WXT](https://wxt.dev) -- browser extension framework (handles MV2/MV3, hot-reload, builds)
- TypeScript -- because life is too short for `undefined is not a function`
- Zero UI frameworks. The popup is plain HTML/CSS. The bubble is a `div` with inline styles. Sometimes simple is just better.

## Contributing

PRs welcome. The codebase is ~1500 lines of TypeScript total -- you can read the whole thing in an afternoon.

If a platform's DOM changed and broke extraction: update the selectors in the relevant `src/platforms/*.ts` file, test it on a real conversation, send a PR.

If you want to add a new platform: look at any existing adapter for the pattern. The Grok adapter is the most interesting one architecturally (LCA-based segmentation); the ChatGPT adapter is the most feature-complete (images, math, GPTs).

## License

MIT
