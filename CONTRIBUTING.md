# Contributing

PRs welcome. The bar is low, the codebase is small (~1500 lines of TypeScript).

## Quick Start

```bash
git clone https://github.com/lroolle/chat-exporter.git
cd chat-exporter
npm install
npm run dev   # Chrome, hot-reload
```

Load `dist/chrome-mv3/` as an unpacked extension. Save a file, extension reloads.

## What to Work On

- **DOM broke?** Platform updated their HTML. Fix selectors in `src/platforms/*.ts`, test on a real conversation, send a PR.
- **New platform?** Implement `PlatformAdapter` (two methods: `matches()` + `scrape()`), register in `entrypoints/content.ts`.
- **New export format?** Implement `Exporter`, register it. JSON, HTML, PDF — the plumbing doesn't care.
- **Bug?** Reproduce it, fix it, include the platform URL pattern in your PR description.

## Guidelines

- Keep it simple. No frameworks for the sake of frameworks.
- Test on actual conversations, not mocked DOM. These platforms change constantly.
- One PR per concern. Don't bundle a bug fix with a refactor with a new feature.
- Commit messages: `type(scope): description`. Types: `feat`, `fix`, `docs`, `chore`.

## Reporting Issues

Include:
1. Platform + URL pattern (e.g., `x.com/i/grok?conversation=...`)
2. What you expected vs. what happened
3. Browser + version
4. Console errors (right-click -> Inspect -> Console)

Screenshots of the exported markdown help a lot.
