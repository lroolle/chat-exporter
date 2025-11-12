# Chat Exporter

Elegant markdown export for ChatGPT conversations. Preserves formatting, code blocks, and conversation structure.

## Features

- **Elegant markdown** - Preserves code blocks with syntax hints, tables, lists, formatting
- **Unambiguous structure** - Emoji banner separators (👤 USER / 🤖 ASSISTANT) prevent heading conflicts
- **Rich metadata** - YAML frontmatter with model, timestamps, conversation IDs
- **Smart extraction** - Detects GPTs, Projects, and conversation types
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

1. Open any ChatGPT conversation at `chatgpt.com`
2. Look for the green "↓ Export MD" button (top right)
3. Click to download the current conversation as Markdown

## Supported Export Formats

- [x] Markdown (`.md`)
- [ ] JSON (`.json`) - coming soon
- [ ] HTML (`.html`) - coming soon
- [ ] TXT (`.txt`) - coming soon

## Roadmap

- [ ] Multiple format exports (JSON, HTML, TXT)
- [ ] Batch export (multiple conversations)
- [ ] Export with images/attachments
- [ ] Claude, Gemini, Grok support
- [ ] Projects and folders export

## Tech Stack

- **WXT** - Modern web extension framework
- **TypeScript** - Type safety
- **Manifest V3** - Latest Chrome extension standard

## License

MIT

## Contributing

PRs welcome. See research docs in parent directory for architecture details.
