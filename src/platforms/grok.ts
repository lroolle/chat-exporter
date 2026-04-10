/**
 * Grok platform adapter (grok.com and x.com/i/grok)
 *
 * Turn segmentation: walk up from the action buttons (Like/Regenerate/Copy text)
 * to their lowest common ancestor, then up again until an ancestor has >= 2
 * text-bearing DIV children. Each such child is one turn. This is stable
 * because Grok always renders Like/Regenerate/Copy on every assistant message
 * and never on user messages.
 *
 * Role detection: button presence on the turn element itself. Deterministic,
 * no scoring heuristics needed.
 *
 * Text extraction: a DOM walker that converts <a href> anchors to markdown
 * `[label](href)` so inline citation chips survive the export. Plain
 * textContent would flatten every URL.
 */

import type { Conversation, Message, PlatformAdapter } from '../core/types';

export class GrokAdapter implements PlatformAdapter {
  id = 'grok';

  matches(url: string): boolean {
    return /grok\.com|x\.com\/i\/grok/.test(url);
  }

  async scrape(doc: Document): Promise<Conversation | null> {
    await this.loadFullConversation();

    const messages = this.extractMessages(doc);
    if (messages.length === 0) {
      console.warn('[Grok] No messages extracted. DOM structure may have changed.');
      return null;
    }

    const url = window.location.href;
    const conversationId = this.extractConversationId(url);
    const title = this.extractTitle(doc, messages);

    return {
      platform: 'grok',
      title,
      messages,
      url,
      timestamp: new Date().toISOString(),
      conversationId,
    };
  }

  private extractConversationId(url: string): string | undefined {
    // x.com/i/grok?conversation=<digits>
    const xMatch = url.match(/[?&]conversation=([a-zA-Z0-9_-]+)/);
    if (xMatch) return xMatch[1];
    // grok.com/c/<id>, /chat/<id>, /share/<id>
    const grokMatch = url.match(/\/(?:c|chat|share)\/([a-zA-Z0-9_-]+)/);
    return grokMatch?.[1];
  }

  private extractTitle(doc: Document, messages: Message[]): string {
    const docTitle = doc.title;
    const generic = /^(Grok|Grok\s*\/\s*X)$/i;
    if (docTitle && !generic.test(docTitle) && !docTitle.toLowerCase().includes('grok.com')) {
      const cleaned = docTitle.replace(/\s*[-|–]\s*Grok.*$/i, '').trim();
      if (cleaned && !generic.test(cleaned)) return cleaned;
    }

    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const preview = firstUserMsg.content.slice(0, 80).replace(/\n/g, ' ').trim();
      return firstUserMsg.content.length > 80 ? preview + '...' : preview;
    }

    return 'Grok Conversation';
  }

  private async loadFullConversation(): Promise<void> {
    const MAX_ATTEMPTS = 30;
    const SCROLL_DELAY = 600;

    return new Promise(resolve => {
      let attempts = 0;
      let lastScrollHeight = 0;
      let unchangedCount = 0;

      const scrollInterval = setInterval(() => {
        window.scrollTo(0, 0);
        const currentScrollHeight = document.body.scrollHeight;

        if (currentScrollHeight === lastScrollHeight) {
          unchangedCount++;
        } else {
          unchangedCount = 0;
          lastScrollHeight = currentScrollHeight;
        }

        attempts++;

        if (attempts >= MAX_ATTEMPTS || unchangedCount >= 3) {
          clearInterval(scrollInterval);
          setTimeout(() => {
            window.scrollTo(0, 0);
            setTimeout(() => {
              window.scrollTo(0, document.body.scrollHeight);
              setTimeout(resolve, 300);
            }, 200);
          }, 200);
        }
      }, SCROLL_DELAY);
    });
  }

  private extractMessages(doc: Document): Message[] {
    const root = this.findConversationRoot(doc);
    if (!root) {
      console.warn('[Grok] Could not locate conversation root.');
      return [];
    }

    // Low threshold: "Yes", "No", "ok" are real user turns.
    // isNavigationOrUI catches UI chrome; don't duplicate that logic here.
    const turns = Array.from(root.children).filter(
      el => el.tagName === 'DIV' && (el.textContent?.trim().length || 0) > 0
    );

    console.log(`[Grok] LCA root found; ${turns.length} turn elements`);

    const messages: Message[] = [];
    for (const el of turns) {
      const content = this.extractTextWithLinks(el);
      if (!content) continue;
      if (this.isNavigationOrUI(content)) continue;

      const role: 'user' | 'assistant' = this.hasAssistantButtons(el) ? 'assistant' : 'user';
      messages.push({ role, content });
    }

    console.log(`[Grok] Extracted ${messages.length} messages`);
    return messages;
  }

  /**
   * Find the conversation root: the lowest ancestor of all action buttons
   * (Like/Regenerate/Copy text) that has at least 2 text-bearing DIV children.
   * That ancestor's direct DIV children are the conversation turns.
   */
  private findConversationRoot(doc: Document): Element | null {
    const anchors: Element[] = [
      ...Array.from(doc.querySelectorAll('button[aria-label="Like"]')),
      ...Array.from(doc.querySelectorAll('button[aria-label="Regenerate"]')),
      ...Array.from(doc.querySelectorAll('button[aria-label="Copy text"]')),
    ];

    if (anchors.length === 0) return null;

    // Lowest common ancestor of all anchors
    let lca: Element | null = anchors[0];
    while (lca) {
      if (anchors.every(a => lca!.contains(a))) break;
      lca = lca.parentElement;
    }
    if (!lca) return null;

    // Walk up until we have an ancestor whose direct children are the turns
    let cur: Element | null = lca;
    let depth = 0;
    while (cur && depth < 15) {
      const textChildren = Array.from(cur.children).filter(
        el => el.tagName === 'DIV' && (el.textContent?.length || 0) > 30
      );
      if (textChildren.length >= 2) return cur;
      cur = cur.parentElement;
      depth++;
    }
    return null;
  }

  private hasAssistantButtons(el: Element): boolean {
    return !!(
      el.querySelector('button[aria-label="Like"]') ||
      el.querySelector('button[aria-label="Dislike"]') ||
      el.querySelector('button[aria-label="Regenerate"]') ||
      el.querySelector('button[aria-label="Copy text"]')
    );
  }

  /**
   * Walk the element's subtree and return text with <a> anchors converted
   * to markdown links `[text](href)`. Skips BUTTON/NAV/etc so reasoning
   * toggles ("Thoughts"), action buttons ("Copy text"), and SVG noise
   * never leak into message prose.
   *
   * Block-level elements get newline separators so sibling paragraphs don't
   * fuse ("wiki" + "then" -> "wikithen"). Lists get "- " prefixes. Table
   * rows/cells get newline + " | " separators for pseudo-markdown tables.
   */
  private extractTextWithLinks(root: Element): string {
    const parts: string[] = [];
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'BUTTON', 'NAV', 'HEADER', 'FOOTER']);
    const BLOCK_TAGS = new Set([
      'DIV', 'P', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'SECTION', 'ARTICLE', 'HR', 'DL', 'DT', 'DD', 'FIGURE', 'ADDRESS',
      'DETAILS', 'SUMMARY', 'PRE',
    ]);

    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || '');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.getAttribute('aria-hidden') === 'true') return;

      if (el.tagName === 'BR') {
        parts.push('\n');
        return;
      }

      if (el.tagName === 'A') {
        const href = (el as HTMLAnchorElement).href;
        if (href && /^https?:/i.test(href)) {
          parts.push(' ' + this.markdownLink(el as HTMLAnchorElement) + ' ');
          return;
        }
      }

      // Fenced code blocks: <pre><code class="language-X">
      if (el.tagName === 'PRE') {
        const codeEl = el.querySelector('code');
        if (codeEl) {
          const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
          const lang = langClass ? langClass.replace('language-', '') : '';
          parts.push(`\n\`\`\`${lang}\n${codeEl.textContent || ''}\n\`\`\`\n`);
          return;
        }
      }

      if (el.tagName === 'LI') {
        parts.push('\n- ');
        el.childNodes.forEach(walk);
        parts.push('\n');
        return;
      }

      if (el.tagName === 'TABLE') {
        parts.push('\n' + this.renderTable(el) + '\n');
        return;
      }

      const isBlock = BLOCK_TAGS.has(el.tagName);
      // Block -> newline; inline -> space. Inline spaces matter because
      // Grok's contenteditable splits user input "line1\nline2" into
      // sibling SPANs with no separator — we must insert one.
      parts.push(isBlock ? '\n' : ' ');
      el.childNodes.forEach(walk);
      if (isBlock) parts.push('\n');
    };

    walk(root);
    return parts
      .join('')
      .replace(/[ \t]+/g, ' ')          // collapse inline spaces
      .replace(/ *\n */g, '\n')          // trim spaces around newlines
      .replace(/\n{3,}/g, '\n\n')        // cap blank lines
      .trim();
  }

  /**
   * Render a <table> as a markdown table. Flattens each cell's content to
   * a single inline line so DIV wrappers inside TDs don't split the row.
   */
  private renderTable(table: Element): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const rendered = rows.map(tr => {
      const cells = Array.from(tr.children).filter(
        c => c.tagName === 'TD' || c.tagName === 'TH'
      );
      return cells.map(cell => this.extractInlineWithLinks(cell) || ' ').join(' | ');
    });

    if (rendered.length === 0) return '';

    const firstRowCells = rendered[0].split(' | ').length;
    const separator = Array(firstRowCells).fill('---').join(' | ');

    const lines = ['| ' + rendered[0] + ' |', '| ' + separator + ' |'];
    for (let i = 1; i < rendered.length; i++) {
      lines.push('| ' + rendered[i] + ' |');
    }
    return lines.join('\n');
  }

  /**
   * Inline variant of extractTextWithLinks — no newlines, used inside
   * table cells where block structure would break the row layout.
   */
  private extractInlineWithLinks(root: Element): string {
    const parts: string[] = [];
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'BUTTON', 'NAV', 'HEADER', 'FOOTER']);

    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || '');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.getAttribute('aria-hidden') === 'true') return;

      if (el.tagName === 'BR') {
        parts.push(' ');
        return;
      }

      if (el.tagName === 'A') {
        const href = (el as HTMLAnchorElement).href;
        if (href && /^https?:/i.test(href)) {
          parts.push(' ' + this.markdownLink(el as HTMLAnchorElement) + ' ');
          return;
        }
      }

      parts.push(' ');
      el.childNodes.forEach(walk);
    };

    walk(root);
    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  private markdownLink(el: HTMLAnchorElement): string {
    const label = (el.textContent || '').trim();
    if (!label) return el.href;
    const safeLabel = label.replace(/[\[\]\\]/g, '\\$&');
    const safeHref = el.href.replace(/[()\\]/g, '\\$&');
    return `[${safeLabel}](${safeHref})`;
  }

  /**
   * Safety net: reject text that is obviously a nav/UI chrome leak.
   * The LCA walker + BUTTON skipping should prevent this, but keep it
   * to fail closed if Grok changes their DOM.
   */
  private isNavigationOrUI(text: string): boolean {
    const trimmed = text.trim();
    const uiExact = [
      /^Home$/i,
      /^Explore$/i,
      /^Notifications?$/i,
      /^Messages?$/i,
      /^Grok$/i,
      /^Profile$/i,
      /^\d+\s*web pages?$/i,
      /^\d+\s*posts?$/i,
      /^Thoughts$/i,
      /^Thinking$/i,
      /^Deep[Ss]earch$/,
      /^Expert$/i,
      /^See new posts$/i,
      /^To view keyboard shortcuts/i,
      /^Skip to/i,
    ];
    return uiExact.some(re => re.test(trimmed));
  }
}
