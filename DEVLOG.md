## [2025-11-13] Inline image capture for Markdown export

- Context: ChatGPT responses now mix text with screenshots/figures; our export silently dropped every `<img>`.
- Root Cause: `ChatGPTAdapter.extractMarkdownContent` only gathered text nodes, never fetching inline assets, and the exporter ran synchronously so we couldn't await blob reads.
- Fix: Make the adapter scrape async, walk the rich content subtree only, fetch/canvas each image into a data URI, and embed `![alt](data:...)` markup while stashing metadata for future asset packs. (see `src/platforms/chatgpt.ts`, `src/core/types.ts`, `entrypoints/content.ts`)
- Docs: README + roadmap call out inline image support; DEVLOG documents the change.
- Result: Markdown exports now include assistant/user images inline, preserving visual context even when offline.

---

## [2025-11-12] Export button survives SPA header swaps

- Context: After navigating between ChatGPT conversations, the Export button vanished because the header DOM was re-created without triggering our single-target observer.
- Root Cause: entrypoints/content.ts relied on one observer tied to whichever header selector resolved first and re-injected immediately, so large DOM swaps removed the node before we noticed, leaving no further retries.
- Fix: observe every viable header target plus document.body, debounce reinjection (250 ms) to batch rapid mutations, and only re-run injection when the button id is missing. Change landed in entrypoints/content.ts lines 85-124.

---

## [2025-01-11] Dev Log: ChatGPT Markdown Exporter

- Context: Chrome MV3 extension (WXT v0.20.11 + TS v5.6.3)
- Why: Export ChatGPT conversations → structured markdown with metadata preservation
- What:
  - Content script injecting export button next to Share button @chatgpt.com
  - Recursive DOM traversal preserving code blocks, tables, lists, formatting
  - YAML frontmatter + emoji banners (👤/🤖) for unambiguous message boundaries
  - Bundle: 13.74 kB, build: ~270ms [PERF]

- How:
  - Commands:

    ```bash
    npm run dev      # Development with hot reload
    npm run build    # Production → dist/chrome-mv3/
    npm run zip      # Package for distribution
    ```

  - Key Implementation:

    ```typescript
    // DOM timing: Wait for Share button as ready signal
    const observer = new MutationObserver(() => {
      const shareButton = buttons.find(
        btn =>
          btn.textContent?.includes('Share') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('share')
      );
      if (mainContent && shareButton) {
        injectExportButton();
        observer.disconnect();
      }
    });

    // Positioning: Insert before Share in same container
    shareButton.parentElement.insertBefore(button, shareButton);

    // Styling: Inherit ChatGPT design tokens
    button.className = 'btn relative btn-ghost text-token-text-primary';

    // URL detection: Handle GPT/Project variants
    const gptMatch = url.match(/\/g\/(g-(?:p-)?[a-zA-Z0-9]+)/);
    const isProject = gptId?.startsWith('g-p-');
    ```

- Result:
  - Outcome: Button reliably injects, exports clean markdown
  - Metrics: bundle=>13.74kB, build_time=>~270ms [PERF]
  - Tests: Manual verification (standard chat, GPT, Project URLs)

- Decisions:
  - MutationObserver watching Share button | Alternatives: setTimeout polling, DOMContentLoaded | Rationale: React renders Share button late; watching it ensures full header ready | Timestamp: 2025-01-11T00:00:00Z
  - Emoji banners over `## User`/`## Assistant` | Alternatives: Plain headers, XML tags, JSON | Rationale: Unambiguous (AI won't generate 60-char unicode + emoji pattern), parseable, visually distinct | Timestamp: 2025-01-11T00:00:00Z
  - Custom DOM traversal over Turndown.js | Alternatives: markdown library, innerHTML parsing | Rationale: Full control for ChatGPT's structure (code language hints, table formatting), lightweight | Timestamp: 2025-01-11T00:00:00Z
  - WXT over raw MV3 | Alternatives: Plasmo, webpack/rollup | Rationale: Hot reload, TypeScript defaults, auto-manifest, minimal config | Timestamp: 2025-01-11T00:00:00Z

- Risks:
  - ChatGPT DOM changes | Mitigation: Cascading selectors (Share button → header → fixed position fallback) | Status: open
  - Share button removed | Mitigation: textContent + aria-label detection, timeout-based fallback | Status: open
  - React re-renders removing button | Mitigation: Idempotent injection checking button ID before re-injection | Status: mitigated

- Rollback:
  - Trigger: Button not appearing, export crashes, corrupted markdown
  - Procedure: Disable at chrome://extensions/, check console errors | Data impact: none (client-side only)

- Links:
  - Source: /Users/eric/wrk/src/github.com/lroolle/WIP/20251111-chatgpt-exporter/worktree/chat-exporter
  - Entry: /Users/eric/wrk/src/github.com/lroolle/WIP/20251111-chatgpt-exporter/worktree/chat-exporter/entrypoints/content.ts
  - Build: /Users/eric/wrk/src/github.com/lroolle/WIP/20251111-chatgpt-exporter/worktree/chat-exporter/.output/chrome-mv3

- Notes:
  - Assumptions: `data-message-author-role` attribute stable, Share button in header, URL patterns stable
  - Gotchas: MutationObserver fires frequently (disconnect after injection), code blocks may nest (use :scope > li), setTimeout fallback needed for already-loaded pages

---

## Critical Problems Solved

### 1. DOM Injection Timing

**Problem**: Export button not appearing
**Cause**: MutationObserver watched `main` element but Share button loads later in React render cycle

**Solution**: Wait specifically for Share button as signal

```typescript
// Failed: Too early
if (mainContent) injectExportButton(); // Share not ready

// Fixed: Wait for Share button
const observer = new MutationObserver(() => {
  const shareButton = buttons.find(btn => btn.textContent?.includes('Share'));
  if (mainContent && shareButton) {
    injectExportButton();
    observer.disconnect();
  }
});

// Backup: 1s delayed check for already-loaded pages
setTimeout(() => {
  if (!document.getElementById('chat-exporter-btn')) {
    const shareButton = buttons.find(btn => btn.textContent?.includes('Share'));
    if (shareButton) injectExportButton();
  }
}, 1000);
```

**Result**: Reliable injection on both page load and navigation

### 2. Button Positioning

**Problem**: Button in wrong location or using fallback fixed position
**Cause**: React-rendered header structure varies, no stable selector

**Solution**: Cascading strategies

```typescript
// Strategy 1: Next to Share button (BEST - 95%+ success)
const shareButton = buttons.find(btn => btn.textContent?.includes('Share'));
if (shareButton) {
  shareButton.parentElement.insertBefore(button, shareButton);
  return;
}

// Strategy 2: Page header by ID
const pageHeader = document.querySelector('#page-header');
if (pageHeader) {
  const headerButtons = pageHeader.querySelector('.flex.items-center');
  if (headerButtons) {
    headerButtons.appendChild(button);
    return;
  }
}

// Strategy 3: Fixed position fallback (LAST RESORT)
Object.assign(button.style, {
  position: 'fixed',
  top: '16px',
  right: '20px',
  zIndex: '9999',
});
document.body.appendChild(button);
```

### 3. Markdown Structure Ambiguity

**Problem**: Standard `## User` / `## Assistant` headers conflict if AI generates same text
**Alternatives Rejected**: Plain headers (ambiguous), XML tags (ugly), JSON (unreadable)

**Solution**: Emoji banner separators

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 USER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Why**: Unambiguous (AI won't generate 60-char unicode line + emoji + role label), parseable, visually distinct, markdown-compatible

### 4. Formatting Preservation

**Problem**: Code blocks losing language hints, tables collapsing, links breaking
**Cause**: ChatGPT renders markdown → DOM, naive textContent extraction loses structure

**Solution**: Recursive DOM traversal respecting element semantics

```typescript
// Code blocks: Extract language from class
if (el.tagName === 'PRE') {
  const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
  const lang = langClass ? langClass.replace('language-', '') : '';
  parts.push(`\`\`\`${lang}\n${codeEl.textContent}\n\`\`\``);
  return;
}

// Tables: Convert to markdown format
if (el.tagName === 'TABLE') {
  parts.push(convertTableToMarkdown(el));
  return;
}
```

**Result**: All formatting preserved (code with language hints, tables, bold/italic, links, lists, headings)

### 5. GPT/Project URL Detection

**URLs**:

- Standard: `chatgpt.com/c/{id}`
- GPT: `chatgpt.com/g/g-2DQzU5UZl/c/{id}` (short)
- GPT: `chatgpt.com/g/g-689ae2f1363881919fc41124c7dbc2fd/c/{id}` (long hex)
- Project: `chatgpt.com/g/g-p-{id}/c/{id}`

**Solution**: Regex with optional project prefix

```typescript
const gptMatch = url.match(/\/g\/(g-(?:p-)?[a-zA-Z0-9]+)/);
const gptId = gptMatch ? gptMatch[1] : undefined;
const isProject = gptId?.startsWith('g-p-');

const type = isProject ? 'project' : gptId ? 'gpt' : 'chat';
```

---

## Key Technical Insights

1. **MutationObserver timing**: React SPAs need watching for specific elements, not just container presence
2. **Cascading selectors**: Always have 2-3 fallback strategies for DOM injection in dynamic UIs
3. **Emoji as structure**: Unicode symbols serve as unambiguous delimiters in human-readable formats
4. **DOM traversal > libraries**: Custom traversal gives better control for ChatGPT's specific structure than generic markdown converters
5. **Design system inheritance**: Using platform CSS classes (ChatGPT's `btn-ghost text-token-text-primary`) beats custom styling for theme support + consistency
6. **Content script lifecycle**: Need both immediate check (already-loaded pages) and observer (loading pages)
