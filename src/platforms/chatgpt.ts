/**
 * ChatGPT platform adapter
 */

import type { Conversation, ImageAsset, Message, PlatformAdapter } from '../core/types';

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

  async scrape(doc: Document): Promise<Conversation | null> {
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

    const messages: Message[] = [];
    for (const el of messageElements) {
      const role = el.getAttribute('data-message-author-role') as 'user' | 'assistant' | 'system';
      const { content, images } = await this.extractMarkdownContent(el);
      const message: Message = {
        role,
        content,
      };
      if (images.length) {
        message.images = images;
      }
      messages.push(message);
    }

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
   * Extract markdown and inline image data from a message element
   */
  private async extractMarkdownContent(
    element: Element
  ): Promise<{ content: string; images: ImageAsset[] }> {
    const parts: string[] = [];
    const images: ImageAsset[] = [];
    const contentRoot = this.getContentRoot(element);

    const processNode = async (node: Node): Promise<void> => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (el.tagName === 'PRE') {
          const codeEl = el.querySelector('code');
          if (codeEl) {
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            const lang = langClass ? langClass.replace('language-', '') : '';
            const code = codeEl.textContent || '';
            parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
            return;
          }
        }

        if (el.tagName === 'CODE' && el.parentElement?.tagName !== 'PRE') {
          parts.push(`\`${el.textContent}\``);
          return;
        }

        if (el.tagName === 'STRONG' || el.tagName === 'B') {
          parts.push(`**${el.textContent}**`);
          return;
        }

        if (el.tagName === 'EM' || el.tagName === 'I') {
          parts.push(`*${el.textContent}*`);
          return;
        }

        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          const text = el.textContent || '';
          parts.push(`[${text}](${href})`);
          return;
        }

        if (el.tagName === 'UL' || el.tagName === 'OL') {
          const items = Array.from(el.querySelectorAll(':scope > li'));
          items.forEach((li, idx) => {
            const marker = el.tagName === 'UL' ? '-' : `${idx + 1}.`;
            parts.push(`${marker} ${li.textContent?.trim()}`);
          });
          return;
        }

        if (/^H[1-6]$/.test(el.tagName)) {
          const level = el.tagName[1];
          parts.push(`${'#'.repeat(parseInt(level))} ${el.textContent?.trim()}`);
          return;
        }

        if (el.tagName === 'BLOCKQUOTE') {
          const lines = (el.textContent || '').split('\n');
          parts.push(lines.map(line => `> ${line}`).join('\n'));
          return;
        }

        if (el.tagName === 'TABLE') {
          parts.push(this.convertTableToMarkdown(el));
          return;
        }

        if (el.tagName === 'IMG') {
          const markdown = await this.serializeImageElement(el as HTMLImageElement, images);
          if (markdown) {
            parts.push(markdown);
          }
          return;
        }

        if (
          el.tagName === 'BUTTON' ||
          el.classList.contains('copy-code') ||
          el.textContent?.trim() === 'Copy code'
        ) {
          return;
        }

        for (const child of Array.from(el.childNodes)) {
          await processNode(child);
        }
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) {
          parts.push(text);
        }
      }
    };

    for (const child of Array.from(contentRoot.childNodes)) {
      await processNode(child);
    }

    const content = parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^ChatGPT\s*/gm, '')
      .replace(/^You\s*/gm, '')
      .trim();

    return { content, images };
  }

  private getContentRoot(element: Element): Element {
    return (
      element.querySelector('[data-testid="conversation-turn-content"]') ||
      element.querySelector('.markdown') ||
      element.querySelector('article') ||
      element
    );
  }

  private async serializeImageElement(
    img: HTMLImageElement,
    images: ImageAsset[]
  ): Promise<string | null> {
    const src = img.currentSrc || img.src;
    if (!src) return null;

    const rawAlt = (img.getAttribute('alt') || img.getAttribute('aria-label') || 'Image').trim();
    const escapedAlt = this.escapeMarkdown(rawAlt);

    let dataUri: string | undefined;
    let mimeType: string | undefined;

    if (src.startsWith('data:')) {
      dataUri = src;
      const mimeMatch = /^data:([^;]+);/.exec(src);
      mimeType = mimeMatch?.[1];
    } else {
      try {
        const inlineData = await this.fetchImageDataUri(src);
        dataUri = inlineData.dataUri;
        mimeType = inlineData.mimeType;
      } catch (error) {
        console.warn('[Chat Exporter] Failed to fetch image data', error);
        try {
          const fallback = await this.convertImageToCanvasDataUri(img);
          dataUri = fallback.dataUri;
          mimeType = fallback.mimeType;
        } catch (canvasError) {
          console.warn('[Chat Exporter] Canvas fallback failed', canvasError);
        }
      }
    }

    const asset: ImageAsset = {
      alt: rawAlt,
      originalSrc: src,
      width: img.naturalWidth || img.width || undefined,
      height: img.naturalHeight || img.height || undefined,
    };

    if (dataUri) asset.dataUri = dataUri;
    if (mimeType) asset.mimeType = mimeType;

    images.push(asset);

    const target = dataUri || src;
    return `![${escapedAlt}](${target})`;
  }

  private async fetchImageDataUri(url: string): Promise<{ dataUri: string; mimeType: string }> {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const blob = await response.blob();

    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Invalid image data'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read image data'));
      reader.readAsDataURL(blob);
    });

    return { dataUri, mimeType: blob.type || 'application/octet-stream' };
  }

  private async convertImageToCanvasDataUri(
    img: HTMLImageElement
  ): Promise<{ dataUri: string; mimeType: string }> {
    if (!img.complete) {
      await img.decode?.().catch(() => undefined);
    }

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error('Image has no dimensions');

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.drawImage(img, 0, 0, width, height);
    const mimeType = 'image/png';
    const dataUri = canvas.toDataURL(mimeType);
    return { dataUri, mimeType };
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/([\\[\]])/g, '\\$1');
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
