/**
 * Gemini platform adapter — DOM-based extraction
 *
 * Uses live DOM selectors (same as ai-chat-exporter reference) instead of
 * the fragile batchexecute RPC that Google keeps changing.
 */

import type { Conversation, Message, PlatformAdapter } from '../core/types';

const SELECTORS = {
  chatContainer: '[data-test-id="chat-history-container"]',
  conversationTurn: 'div.conversation-container',
  userQuery: 'user-query',
  userQueryText: '.query-text .query-text-line',
  modelResponse: 'model-response',
  modelResponseContent: 'message-content .markdown',
  conversationTitle: '.conversation-title',
  mathBlock: '.math-block[data-math]',
  mathInline: '.math-inline[data-math]',
};

const SCROLL_DELAY_MS = 2000;
const MAX_SCROLL_ATTEMPTS = 60;
const STABLE_THRESHOLD = 4;

export class GeminiAdapter implements PlatformAdapter {
  id = 'gemini';

  matches(url: string): boolean {
    return /gemini\.google\.com/.test(url);
  }

  async scrape(_doc: Document): Promise<Conversation | null> {
    try {
      await this.scrollToLoadAll();
    } catch {
      // If scroll fails (no container), we still try to extract what's visible
    }

    const turns = Array.from(document.querySelectorAll(SELECTORS.conversationTurn));
    if (!turns.length) {
      console.warn('[Gemini Exporter] No conversation turns found');
      return null;
    }

    const messages: Message[] = [];

    for (const turn of turns) {
      const userEl = turn.querySelector(SELECTORS.userQuery);
      if (userEl) {
        const text = this.extractUserQuery(userEl as HTMLElement);
        if (text) {
          messages.push({ role: 'user', content: text });
        }
      }

      const modelEl = turn.querySelector(SELECTORS.modelResponse);
      if (modelEl) {
        const text = this.extractModelResponse(modelEl as HTMLElement);
        if (text) {
          messages.push({ role: 'assistant', content: text });
        }
      }
    }

    if (!messages.length) {
      console.warn('[Gemini Exporter] Could not extract any messages from DOM');
      return null;
    }

    const title = this.getTitle();
    const chatId = this.getChatIdFromUrl();

    return {
      platform: 'gemini',
      title,
      messages,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      conversationId: chatId || undefined,
    };
  }

  // --- Scroll to load lazy messages ---

  private async scrollToLoadAll(): Promise<void> {
    const container = document.querySelector(SELECTORS.chatContainer);
    if (!container) return;

    let stableCount = 0;
    let attempts = 0;
    let lastTurnCount = 0;
    let lastScrollTop: number | null = null;

    while (stableCount < STABLE_THRESHOLD && attempts < MAX_SCROLL_ATTEMPTS) {
      const turnCount = document.querySelectorAll(SELECTORS.conversationTurn).length;
      container.scrollTop = 0;
      await this.sleep(SCROLL_DELAY_MS);

      const scrollTop = container.scrollTop;
      const newTurnCount = document.querySelectorAll(SELECTORS.conversationTurn).length;

      if (
        newTurnCount === turnCount &&
        newTurnCount === lastTurnCount &&
        (lastScrollTop === scrollTop || scrollTop === 0)
      ) {
        stableCount++;
      } else {
        stableCount = 0;
      }

      lastTurnCount = newTurnCount;
      lastScrollTop = scrollTop;
      attempts++;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- User query extraction ---

  private extractUserQuery(userEl: HTMLElement): string {
    const lines = userEl.querySelectorAll(SELECTORS.userQueryText);
    if (lines.length) {
      return Array.from(lines)
        .map(l => l.textContent?.trim() || '')
        .filter(Boolean)
        .join('\n');
    }

    // Fallback: try broader containers
    const fallback =
      userEl.querySelector('.query-text') || userEl.querySelector('.user-query-container');
    return fallback?.textContent?.trim() || '';
  }

  // --- Model response extraction (HTML -> Markdown) ---

  private extractModelResponse(modelEl: HTMLElement): string {
    const markdownContainer = modelEl.querySelector(SELECTORS.modelResponseContent) as HTMLElement;
    if (!markdownContainer) return '';

    const md = this.nodeToMarkdown(markdownContainer);
    return this.stripCitations(md).trim();
  }

  private nodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;

    // Math: block
    if (el.matches?.(SELECTORS.mathBlock)) {
      const latex = el.getAttribute('data-math') || '';
      return `$$${latex}$$\n\n`;
    }

    // Math: inline
    if (el.matches?.(SELECTORS.mathInline)) {
      const latex = el.getAttribute('data-math') || '';
      return `$${latex}$`;
    }

    const tag = el.tagName;

    if (tag === 'BR') return '\n';

    if (tag === 'STRONG' || tag === 'B') {
      const inner = this.childrenToMarkdown(el);
      return `**${inner}**`;
    }

    if (tag === 'EM' || tag === 'I') {
      const inner = this.childrenToMarkdown(el);
      return `*${inner}*`;
    }

    if (tag === 'CODE' && el.parentElement?.tagName !== 'PRE') {
      return `\`${el.textContent || ''}\``;
    }

    if (tag === 'PRE') {
      const codeEl = el.querySelector('code');
      if (codeEl) {
        const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
        const lang = langClass ? langClass.replace('language-', '') : '';
        return `\`\`\`${lang}\n${codeEl.textContent || ''}\n\`\`\`\n\n`;
      }
      return `\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
    }

    if (tag === 'A') {
      const href = el.getAttribute('href') || '';
      const text = el.textContent || '';
      return `[${text}](${href})`;
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]);
      return `${'#'.repeat(level)} ${this.childrenToMarkdown(el).trim()}\n\n`;
    }

    if (tag === 'P') {
      return `${this.childrenToMarkdown(el)}\n\n`;
    }

    if (tag === 'HR') return '---\n\n';

    if (tag === 'BLOCKQUOTE') {
      const inner = this.childrenToMarkdown(el).trim();
      const lines = inner.split('\n');
      return lines.map(line => (line ? `> ${line}` : '>')).join('\n') + '\n\n';
    }

    if (tag === 'UL') {
      const items = Array.from(el.querySelectorAll(':scope > li'));
      return items.map(li => `- ${this.childrenToMarkdown(li as HTMLElement).trim()}`).join('\n') + '\n\n';
    }

    if (tag === 'OL') {
      const items = Array.from(el.querySelectorAll(':scope > li'));
      return (
        items.map((li, i) => `${i + 1}. ${this.childrenToMarkdown(li as HTMLElement).trim()}`).join('\n') +
        '\n\n'
      );
    }

    if (tag === 'TABLE') {
      return this.tableToMarkdown(el) + '\n\n';
    }

    if (tag === 'IMG') {
      const alt = el.getAttribute('alt') || 'image';
      const src = (el as HTMLImageElement).src || '';
      return `![${alt}](${src})`;
    }

    // Default: recurse children
    return this.childrenToMarkdown(el);
  }

  private childrenToMarkdown(el: HTMLElement): string {
    return Array.from(el.childNodes)
      .map(n => this.nodeToMarkdown(n))
      .join('');
  }

  private tableToMarkdown(table: HTMLElement): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';

    const lines: string[] = [];
    rows.forEach((row, i) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const texts = cells.map(c => this.childrenToMarkdown(c as HTMLElement).replace(/\n/g, ' ').trim());
      lines.push(`| ${texts.join(' | ')} |`);
      if (i === 0) {
        lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
      }
    });
    return lines.join('\n');
  }

  // --- Citation stripping ---

  private stripCitations(text: string): string {
    return text
      .replace(/\[cite_start\]/g, '')
      .replace(/\[cite:[\d,\s]+\]/g, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  // --- Title ---

  private getTitle(): string {
    const titleEl = document.querySelector(SELECTORS.conversationTitle);
    if (titleEl?.textContent?.trim()) {
      return titleEl.textContent.trim();
    }

    let title = document.title?.trim() || 'Gemini Chat';
    if (title.includes(' - Gemini')) {
      title = title.split(' - Gemini')[0].trim();
    }
    if (title === 'Gemini' || title === 'Google Gemini') {
      title = 'Gemini Chat';
    }
    return title;
  }

  // --- URL parsing ---

  private getChatIdFromUrl(): string | null {
    const path = location.pathname.replace(/\/+$/, '');
    const segs = path.split('/').filter(Boolean);
    let i = 0;
    if (segs[0] === 'u' && /^\d+$/.test(segs[1] || '')) {
      i = 2;
    }
    // /app/:chatId
    if (segs[i] === 'app' && segs[i + 1]) return segs[i + 1];
    // /gem/:gemId/:chatId
    if (segs[i] === 'gem' && segs[i + 2]) return segs[i + 2];
    return null;
  }
}
