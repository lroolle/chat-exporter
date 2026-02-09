# Chat Exporter

Elegant markdown export for ChatGPT, Claude, Gemini, and Grok conversations. Preserves formatting, code blocks, and conversation structure with consistent output across all platforms.

## Supported Platforms

| Platform    | Export Method      | Features                             |
| ----------- | ------------------ | ------------------------------------ |
| **ChatGPT** | DOM scraping       | GPTs, Projects, images               |
| **Claude**  | API + DOM fallback | Artifacts, thinking blocks, branches |
| **Gemini**  | batchexecute RPC   | Thoughts/reasoning, Gems             |
| **Grok**    | DOM heuristics     | X.com integration                    |

## Features

- **Multi-platform** - One extension for ChatGPT, Claude, Gemini, and Grok
- **Elegant markdown** - Preserves code blocks with syntax hints, tables, lists, formatting
- **Unambiguous structure** - Emoji banner separators (👤 USER / 🤖 ASSISTANT) prevent heading conflicts
- **Rich metadata** - YAML frontmatter with model, timestamps, conversation IDs
- **Smart extraction** - Detects GPTs, Projects, Artifacts, and conversation types
- **Thinking/Reasoning** - Preserves Claude extended thinking and Gemini reasoning
- **Image capture** - Inlines assistant/user images as base64 data URIs for offline viewing
- **Loading states** - Visual feedback during export
- **Unicode-friendly** - Preserves international characters in filenames
- **Privacy-first** - Client-side only, no server

## Installation

### Development Mode

```bash
npm install
npm run dev
```

Then:

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `dist/chrome-mv3` directory

### Build for Production

```bash
npm run build
npm run zip
```

The packaged extension will be in `dist/`.

## Usage

1. Open any conversation on:
   - `chatgpt.com` / `chat.openai.com`
   - `claude.ai`
   - `gemini.google.com`
   - `grok.com` / `x.com/i/grok`
2. Click the floating bubble (bottom-right corner)
3. Download starts automatically as Markdown

## Supported Export Formats

- [x] Markdown (`.md`)
- [ ] JSON (`.json`) - coming soon
- [ ] HTML (`.html`) - coming soon
- [ ] TXT (`.txt`) - coming soon

## Roadmap

- [x] Inline image capture (data URIs)
- [x] Claude, Gemini, Grok support
- [ ] Multiple format exports (JSON, HTML, TXT)
- [ ] Binary asset bundles (download images as discrete files)
- [ ] Batch export (multiple conversations)
- [ ] Projects and folders export

## Tech Stack

- **WXT** - Modern web extension framework
- **TypeScript** - Type safety
- **Manifest V3** - Latest Chrome extension standard

## License

MIT

## Contributing

PRs welcome. See research docs in parent directory for architecture details.
