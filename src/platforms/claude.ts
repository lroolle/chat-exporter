/**
 * Claude.ai platform adapter
 *
 * Uses Claude's internal API for reliable extraction (based on socketteer/agoramachina implementations).
 * Falls back to DOM scraping if API fails.
 */

import type { Conversation, ImageAsset, Message, PlatformAdapter } from '../core/types';

interface ClaudeMessage {
  uuid: string;
  sender: 'human' | 'assistant';
  parent_message_uuid?: string;
  content?: ClaudeContent[];
  text?: string;
  created_at?: string;
}

interface ClaudeContent {
  type: 'text' | 'thinking' | 'tool_use';
  text?: string;
  thinking?: string;
  summaries?: Array<{ summary: string }>;
  display_content?: {
    type: string;
    code?: string;
    language?: string;
    filename?: string;
    json_block?: string;
  };
}

interface ClaudeConversation {
  uuid: string;
  name?: string;
  model?: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessage[];
  current_leaf_message_uuid?: string;
}

export class ClaudeAdapter implements PlatformAdapter {
  id = 'claude';

  matches(url: string): boolean {
    return /claude\.ai/.test(url);
  }

  async scrape(_doc: Document): Promise<Conversation | null> {
    const conversationId = this.getConversationIdFromUrl();
    if (!conversationId) {
      console.warn('[Claude Exporter] Not on a conversation page');
      return null;
    }

    try {
      const orgId = await this.detectOrgId();
      if (orgId) {
        console.log('[Claude Exporter] Using API method with orgId:', orgId);
        return await this.scrapeViaApi(orgId, conversationId);
      }
    } catch (err) {
      console.warn('[Claude Exporter] API method failed, falling back to DOM:', err);
    }

    return this.scrapeViaDom(_doc);
  }

  private getConversationIdFromUrl(): string | null {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  private async detectOrgId(): Promise<string | null> {
    // Strategy 1: Look for org ID in page's embedded JavaScript state
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const content = script.textContent || '';
      const orgMatch =
        content.match(/"organizationId"\s*:\s*"([a-f0-9-]{36})"/i) ||
        content.match(/organizations\/([a-f0-9-]{36})/i);
      if (orgMatch) return orgMatch[1];
    }

    // Strategy 2: Try to extract from API call by intercepting network
    // Check localStorage/sessionStorage for cached org data
    try {
      const storageKeys = ['organization', 'org', 'activeOrganization'];
      for (const key of storageKeys) {
        const local = localStorage.getItem(key);
        const session = sessionStorage.getItem(key);
        const value = local || session;
        if (value) {
          const parsed = JSON.parse(value);
          if (parsed?.uuid) return parsed.uuid;
          if (parsed?.id) return parsed.id;
          if (typeof parsed === 'string' && /^[a-f0-9-]{36}$/i.test(parsed)) return parsed;
        }
      }
    } catch {
      // Storage access might fail
    }

    // Strategy 3: Fetch organization list from API
    try {
      const resp = await fetch('https://claude.ai/api/organizations', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (resp.ok) {
        const orgs = await resp.json();
        if (Array.isArray(orgs) && orgs.length > 0) {
          return orgs[0].uuid || orgs[0].id;
        }
      }
    } catch {
      // API call failed
    }

    return null;
  }

  private async scrapeViaApi(orgId: string, conversationId: string): Promise<Conversation | null> {
    const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;

    const response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: ClaudeConversation = await response.json();
    if (!data.chat_messages || !Array.isArray(data.chat_messages)) {
      throw new Error('Invalid conversation data structure');
    }

    const branchMessages = this.getCurrentBranch(data);
    const messages = this.convertMessages(branchMessages);

    return {
      platform: 'claude',
      title: data.name || 'Untitled Conversation',
      messages,
      url: window.location.href,
      timestamp: data.created_at || new Date().toISOString(),
      conversationId: data.uuid || conversationId,
      model: data.model || this.inferModel(data.created_at),
    };
  }

  private getCurrentBranch(data: ClaudeConversation): ClaudeMessage[] {
    if (!data.chat_messages || !data.current_leaf_message_uuid) {
      return data.chat_messages || [];
    }

    const messageMap = new Map<string, ClaudeMessage>();
    data.chat_messages.forEach(msg => messageMap.set(msg.uuid, msg));

    const branch: ClaudeMessage[] = [];
    let currentUuid: string | undefined = data.current_leaf_message_uuid;

    while (currentUuid && messageMap.has(currentUuid)) {
      const msg = messageMap.get(currentUuid);
      if (!msg) break;
      branch.unshift(msg);
      currentUuid = msg.parent_message_uuid;
      if (!messageMap.has(currentUuid || '')) break;
    }

    return branch;
  }

  private convertMessages(claudeMessages: ClaudeMessage[]): Message[] {
    const messages: Message[] = [];

    for (const msg of claudeMessages) {
      const role: 'user' | 'assistant' = msg.sender === 'human' ? 'user' : 'assistant';
      const { content, images } = this.extractContent(msg);

      if (content.trim()) {
        const message: Message = {
          role,
          content,
          timestamp: msg.created_at,
        };
        if (images.length > 0) message.images = images;
        messages.push(message);
      }
    }

    return messages;
  }

  private extractContent(msg: ClaudeMessage): { content: string; images: ImageAsset[] } {
    const parts: string[] = [];
    const images: ImageAsset[] = [];

    if (msg.content && Array.isArray(msg.content)) {
      for (const content of msg.content) {
        if (content.type === 'thinking' && content.thinking) {
          const summary = content.summaries?.[content.summaries.length - 1]?.summary || '';
          parts.push(
            `<thinking>\n${summary ? `Summary: ${summary}\n\n` : ''}${content.thinking}\n</thinking>`
          );
        } else if (content.type === 'text' && content.text) {
          let text = content.text;
          const artifacts = this.extractArtifactsFromText(text);
          text = text.replace(/<antArtifact[^>]*>[\s\S]*?<\/antArtifact>/g, '').trim();
          if (text) parts.push(text);
          for (const artifact of artifacts) {
            parts.push(this.formatArtifact(artifact));
          }
        } else if (content.type === 'tool_use' && content.display_content) {
          const artifact = this.extractArtifactFromToolUse(content.display_content);
          if (artifact) parts.push(this.formatArtifact(artifact));
        }
      }
    } else if (msg.text) {
      let text = msg.text;
      const artifacts = this.extractArtifactsFromText(text);
      text = text.replace(/<antArtifact[^>]*>[\s\S]*?<\/antArtifact>/g, '').trim();
      if (text) parts.push(text);
      for (const artifact of artifacts) {
        parts.push(this.formatArtifact(artifact));
      }
    }

    return { content: parts.join('\n\n'), images };
  }

  private extractArtifactsFromText(
    text: string
  ): Array<{ title: string; language: string; type: string; content: string }> {
    const artifacts: Array<{ title: string; language: string; type: string; content: string }> = [];
    const regex = /<antArtifact[^>]*>([\s\S]*?)<\/antArtifact>/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const fullTag = match[0];
      const content = match[1];

      const titleMatch = fullTag.match(/title="([^"]*)"/);
      const typeMatch = fullTag.match(/type="([^"]*)"/);
      const languageMatch = fullTag.match(/language="([^"]*)"/);

      let language = 'txt';
      let artifactType = 'text';

      if (typeMatch) {
        const type = typeMatch[1];
        if (type === 'text/html') {
          language = 'html';
          artifactType = 'code';
        } else if (type === 'text/markdown') {
          language = 'markdown';
          artifactType = 'document';
        } else if (type === 'application/vnd.ant.code') {
          language = languageMatch?.[1] || 'txt';
          artifactType = 'code';
        } else if (type === 'text/css') {
          language = 'css';
          artifactType = 'code';
        } else if (type === 'application/vnd.ant.mermaid') {
          language = 'mermaid';
          artifactType = 'document';
        } else if (type === 'application/vnd.ant.react') {
          language = 'jsx';
          artifactType = 'code';
        } else if (type === 'image/svg+xml') {
          language = 'svg';
          artifactType = 'code';
        }
      } else if (languageMatch) {
        language = languageMatch[1];
        artifactType = 'code';
      }

      artifacts.push({
        title: titleMatch?.[1] || 'Untitled',
        language,
        type: artifactType,
        content: content.trim(),
      });
    }

    return artifacts;
  }

  private extractArtifactFromToolUse(
    displayContent: ClaudeContent['display_content']
  ): { title: string; language: string; type: string; content: string } | null {
    if (!displayContent) return null;

    if (displayContent.type === 'code_block' && displayContent.code) {
      const language = displayContent.language || 'txt';
      const filename = displayContent.filename || 'artifact';
      const title =
        filename
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') || 'Untitled';

      return {
        title,
        language,
        type: this.isProgrammingLanguage(language) ? 'code' : 'document',
        content: displayContent.code.trim(),
      };
    }

    if (displayContent.type === 'json_block' && displayContent.json_block) {
      try {
        const data = JSON.parse(displayContent.json_block);
        if (data.filename && data.code) {
          const language = data.language || 'txt';
          const title =
            data.filename
              .split('/')
              .pop()
              ?.replace(/\.[^.]+$/, '') || 'Untitled';
          return {
            title,
            language,
            type: this.isProgrammingLanguage(language) ? 'code' : 'document',
            content: data.code.trim(),
          };
        }
      } catch {
        // JSON parse failed
      }
    }

    return null;
  }

  private formatArtifact(artifact: {
    title: string;
    language: string;
    type: string;
    content: string;
  }): string {
    const header = `**Artifact: ${artifact.title}** (${artifact.language})`;
    if (artifact.type === 'code' || this.isProgrammingLanguage(artifact.language)) {
      return `${header}\n\`\`\`${artifact.language}\n${artifact.content}\n\`\`\``;
    }
    return `${header}\n${artifact.content}`;
  }

  private isProgrammingLanguage(lang: string): boolean {
    const codeLangs = [
      'javascript',
      'typescript',
      'python',
      'java',
      'c',
      'cpp',
      'c++',
      'ruby',
      'php',
      'swift',
      'go',
      'rust',
      'jsx',
      'tsx',
      'shell',
      'bash',
      'sql',
      'kotlin',
      'scala',
      'html',
      'css',
      'scss',
      'sass',
      'less',
      'json',
      'xml',
      'yaml',
      'toml',
    ];
    return codeLangs.includes(lang.toLowerCase());
  }

  private inferModel(createdAt?: string): string {
    if (!createdAt) return 'claude-3-5-sonnet';

    const timeline = [
      { date: new Date('2024-06-20'), model: 'claude-3-5-sonnet-20240620' },
      { date: new Date('2024-10-22'), model: 'claude-3-5-sonnet-20241022' },
      { date: new Date('2025-02-19'), model: 'claude-3-7-sonnet-20250219' },
      { date: new Date('2025-05-14'), model: 'claude-sonnet-4-20250514' },
    ];

    const convDate = new Date(createdAt);
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (convDate >= timeline[i].date) return timeline[i].model;
    }
    return 'claude-3-sonnet-20240229';
  }

  private async scrapeViaDom(doc: Document): Promise<Conversation | null> {
    const chatContainer =
      doc.querySelector('div.flex-1.flex.flex-col.gap-3.px-4') ||
      doc.querySelector('[class*="conversation"]') ||
      doc.querySelector('main');

    if (!chatContainer) {
      console.warn('[Claude Exporter] Could not find chat container');
      return null;
    }

    const titleEl =
      doc.querySelector('button[data-testid="chat-menu-trigger"]') ||
      doc.querySelector('[class*="conversation-title"]');
    const title =
      titleEl?.textContent?.trim() ||
      doc.title.replace(/\s*-\s*Claude.*$/, '').trim() ||
      'Claude Chat';

    const messageElements = chatContainer.querySelectorAll(
      'div.font-claude-message, div.font-user-message, [data-message-author-role]'
    );

    if (!messageElements.length) {
      console.warn('[Claude Exporter] No messages found via DOM');
      return null;
    }

    const messages: Message[] = [];
    for (const el of Array.from(messageElements)) {
      const isAssistant =
        el.classList.contains('font-claude-message') ||
        el.getAttribute('data-message-author-role') === 'assistant';
      const role: 'user' | 'assistant' = isAssistant ? 'assistant' : 'user';
      const content = this.extractTextFromElement(el);

      if (content.trim()) {
        messages.push({ role, content });
      }
    }

    const url = window.location.href;
    const conversationIdMatch = url.match(/\/chat\/([a-f0-9-]+)/);

    return {
      platform: 'claude',
      title,
      messages,
      url,
      timestamp: new Date().toISOString(),
      conversationId: conversationIdMatch?.[1],
    };
  }

  private extractTextFromElement(element: Element): string {
    const parts: string[] = [];

    const processNode = (node: Node): void => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (el.tagName === 'PRE') {
          const codeEl = el.querySelector('code');
          if (codeEl) {
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            const lang = langClass ? langClass.replace('language-', '') : '';
            parts.push(`\`\`\`${lang}\n${codeEl.textContent || ''}\n\`\`\``);
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
          parts.push(`[${el.textContent}](${href})`);
          return;
        }

        if (el.tagName === 'UL' || el.tagName === 'OL') {
          const items = el.querySelectorAll(':scope > li');
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

        if (el.tagName === 'BUTTON' || el.classList.contains('copy-code')) {
          return;
        }

        Array.from(el.childNodes).forEach(child => processNode(child));
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) parts.push(text);
      }
    };

    Array.from(element.childNodes).forEach(child => processNode(child));

    return parts
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
