/**
 * ChatGPT platform adapter
 */

import type { Conversation, Message, PlatformAdapter } from '../core/types';

// Selectors from chatgpt.js for robustness
const SELECTORS = {
  main: 'main',
  messageContainer: 'div[class*=thread]',
  message: 'div[data-message-author-role]',
  replyDiv: 'div[data-message-author-role=assistant]',
  codeBlock: 'pre',
  modelPicker: 'button:has(svg) span:first-child',
  pageHeader: '#page-header',
  headerActions: '.flex.items-center',
};

export class ChatGPTAdapter implements PlatformAdapter {
  id = 'chatgpt';

  matches(url: string): boolean {
    return /chatgpt\.com|chat\.openai\.com/.test(url);
  }

  scrape(doc: Document): Conversation | null {
    // ChatGPT's main conversation container
    const mainElement = doc.querySelector(SELECTORS.main);
    if (!mainElement) return null;

    // Extract title - try multiple sources
    let title = 'Untitled Conversation';

    // 1. Try document title first (most reliable)
    const docTitle = doc.title;
    if (docTitle && docTitle !== 'ChatGPT' && !docTitle.includes('New chat')) {
      title = docTitle.replace(/\s*\|\s*ChatGPT.*$/, '').trim();
    } else {
      // 2. Try page h1 or conversation header
      const titleEl =
        doc.querySelector('h1') ||
        doc.querySelector('[class*="text-2xl"]') ||
        doc.querySelector('nav a[aria-current]');
      if (titleEl?.textContent?.trim()) {
        title = titleEl.textContent.trim();
      }
    }

    // Try to detect model name from UI
    let model: string | undefined;
    const modelButton = doc.querySelector('button[aria-haspopup="menu"]');
    if (modelButton) {
      const modelText = modelButton.textContent?.trim();
      if (modelText && !modelText.includes('ChatGPT')) {
        model = modelText;
      }
    }

    // Find all message divs
    const messageElements = Array.from(mainElement.querySelectorAll(SELECTORS.message));

    if (!messageElements.length) return null;

    const messages: Message[] = messageElements.map(el => {
      const role = el.getAttribute('data-message-author-role') as 'user' | 'assistant' | 'system';

      // Extract markdown content elegantly
      let content = this.extractMarkdownContent(el);

      return {
        role,
        content,
      };
    });

    // Parse URL for metadata
    const url = window.location.href;
    const conversationIdMatch = url.match(/\/c\/([a-f0-9-]+)/);
    const conversationId = conversationIdMatch ? conversationIdMatch[1] : undefined;

    // Check if it's a GPT or Project chat
    const gptMatch = url.match(/\/g\/(g-(?:p-)?[a-zA-Z0-9]+)/);
    const gptId = gptMatch ? gptMatch[1] : undefined;
    const isProject = gptId?.startsWith('g-p-');

    // Extract GPT/Project name from URL
    let gptName: string | undefined;
    if (gptId) {
      const nameMatch = url.match(/\/g\/g-(?:p-)?[a-zA-Z0-9]+-([^/]+)/);
      gptName = nameMatch ? nameMatch[1].replace(/-/g, ' ') : undefined;
    }

    return {
      platform: 'chatgpt',
      title,
      messages,
      url,
      timestamp: new Date().toISOString(),
      conversationId,
      gptId,
      gptName,
      isProject,
      model,
    };
  }

  getInjectionPoint(doc: Document): Element | null {
    // Strategy 1: Look for Share button by text content
    const buttons = Array.from(doc.querySelectorAll('button'));
    const shareButton = buttons.find(
      btn =>
        btn.textContent?.includes('Share') ||
        btn.getAttribute('aria-label')?.includes('Share') ||
        btn.getAttribute('aria-label')?.includes('share')
    );

    if (shareButton && shareButton.parentElement) {
      return shareButton.parentElement;
    }

    // Strategy 2: Look in page header
    const pageHeader = doc.querySelector(SELECTORS.pageHeader);
    if (pageHeader) {
      const headerButtons = pageHeader.querySelector('.flex.items-center');
      if (headerButtons) {
        return headerButtons as Element;
      }
    }

    return null;
  }

  /**
   * Extract markdown from message element
   * Note: return after each element type prevents recursive double-processing
   */
  private extractMarkdownContent(element: Element): string {
    const parts: string[] = [];

    const processNode = (node: Node): void => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        // Pre/code blocks
        if (el.tagName === 'PRE') {
          const codeEl = el.querySelector('code');
          if (codeEl) {
            // Try to detect language from class
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            const lang = langClass ? langClass.replace('language-', '') : '';
            const code = codeEl.textContent || '';
            parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
            return;
          }
        }

        // Inline code
        if (el.tagName === 'CODE' && el.parentElement?.tagName !== 'PRE') {
          parts.push(`\`${el.textContent}\``);
          return;
        }

        // Bold (textContent flattens nested formatting - acceptable for MVP)
        if (el.tagName === 'STRONG' || el.tagName === 'B') {
          parts.push(`**${el.textContent}**`);
          return;
        }

        // Italic
        if (el.tagName === 'EM' || el.tagName === 'I') {
          parts.push(`*${el.textContent}*`);
          return;
        }

        // Links
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          const text = el.textContent || '';
          parts.push(`[${text}](${href})`);
          return;
        }

        // Lists - preserve structure
        if (el.tagName === 'UL' || el.tagName === 'OL') {
          const items = Array.from(el.querySelectorAll(':scope > li'));
          items.forEach((li, idx) => {
            const marker = el.tagName === 'UL' ? '-' : `${idx + 1}.`;
            parts.push(`${marker} ${li.textContent?.trim()}`);
          });
          return;
        }

        // Headings
        if (/^H[1-6]$/.test(el.tagName)) {
          const level = el.tagName[1];
          parts.push(`${'#'.repeat(parseInt(level))} ${el.textContent?.trim()}`);
          return;
        }

        // Block quotes
        if (el.tagName === 'BLOCKQUOTE') {
          const lines = (el.textContent || '').split('\n');
          parts.push(lines.map(line => `> ${line}`).join('\n'));
          return;
        }

        // Tables
        if (el.tagName === 'TABLE') {
          parts.push(this.convertTableToMarkdown(el));
          return;
        }

        // Skip buttons and UI elements
        if (
          el.tagName === 'BUTTON' ||
          el.classList.contains('copy-code') ||
          el.textContent?.trim() === 'Copy code'
        ) {
          return;
        }

        // Recurse into other elements
        Array.from(el.childNodes).forEach(processNode);
      }

      // Text nodes
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) {
          parts.push(text);
        }
      }
    };

    Array.from(element.childNodes).forEach(processNode);

    return parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/^ChatGPT\s*/gm, '') // Strip sender labels
      .replace(/^You\s*/gm, '')
      .trim();
  }

  /**
   * Convert HTML table to markdown table
   */
  private convertTableToMarkdown(table: Element): string {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';

    const lines: string[] = [];

    rows.forEach((row, rowIdx) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const cellTexts = cells.map(cell => cell.textContent?.trim() || '');
      lines.push(`| ${cellTexts.join(' | ')} |`);

      // Add header separator after first row
      if (rowIdx === 0) {
        lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
      }
    });

    return lines.join('\n');
  }
}
