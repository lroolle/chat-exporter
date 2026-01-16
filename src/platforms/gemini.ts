/**
 * Gemini platform adapter
 * Uses batchexecute RPC for reliable extraction (based on NoahTheGinger's userscript)
 */

import type { Conversation, Message, PlatformAdapter } from '../core/types';

interface GeminiRoute {
  kind: 'app' | 'gem';
  chatId: string;
  gemId?: string;
  userIndex?: string;
  basePrefix: string;
  sourcePath: string;
}

interface MessageBlock {
  userText: string;
  assistantText: string;
  thoughtsText: string | null;
  tsPair: [number, number] | null;
}

export class GeminiAdapter implements PlatformAdapter {
  id = 'gemini';

  matches(url: string): boolean {
    return /gemini\.google\.com/.test(url);
  }

  async scrape(_doc: Document): Promise<Conversation | null> {
    const route = this.getRouteFromUrl();
    if (!route || !route.chatId) {
      console.warn('[Gemini Exporter] Not on a conversation page');
      return null;
    }

    try {
      const raw = await this.fetchConversationPayload(route);
      const payloads = this.parseBatchExecute(raw, 'hNvQHb');
      if (!payloads.length) {
        throw new Error('No conversation payloads found in batchexecute response');
      }

      const blocks = this.extractAllBlocks(payloads);
      if (!blocks.length) {
        throw new Error('Could not extract any User/Assistant message pairs');
      }

      let title = await this.fetchConversationTitle(route);
      if (!title) {
        title = this.getTitleFallback();
      }

      const messages = this.blocksToMessages(blocks);

      return {
        platform: 'gemini',
        title,
        messages,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        conversationId: route.chatId,
        model: route.kind === 'gem' ? `Gem: ${route.gemId}` : undefined,
      };
    } catch (err) {
      console.error('[Gemini Exporter] scrape failed:', err);
      return null;
    }
  }

  getInjectionPoint(doc: Document): Element | null {
    // Primary: top-bar-actions right section (where other buttons live)
    const rightSection = doc.querySelector('top-bar-actions .right-section');
    if (rightSection) return rightSection;

    // Fallback: top-bar-actions container
    const topBarActions = doc.querySelector('top-bar-actions .top-bar-actions');
    if (topBarActions) return topBarActions;

    // Fallback: any top-bar-actions
    const topBar = doc.querySelector('top-bar-actions');
    if (topBar) return topBar;

    return null;
  }

  // --- Route Parsing ---

  private getRouteFromUrl(): GeminiRoute | null {
    const path = location.pathname.replace(/\/+$/, '');
    const segs = path.split('/').filter(Boolean);

    if (segs.length === 0) return null;

    let basePrefix = '';
    let userIndex: string | undefined;
    let i = 0;

    // Optional "/u/:index" prefix for multi-account
    if (segs[0] === 'u' && /^\d+$/.test(segs[1] || '')) {
      userIndex = segs[1];
      basePrefix = `/u/${userIndex}`;
      i = 2;
    }

    // /app/:chatId
    if (segs[i] === 'app' && segs[i + 1]) {
      const chatId = segs[i + 1];
      return {
        kind: 'app',
        chatId,
        userIndex,
        basePrefix,
        sourcePath: `${basePrefix}/app/${chatId}`,
      };
    }

    // /gem/:gemId/:chatId
    if (segs[i] === 'gem' && segs[i + 1] && segs[i + 2]) {
      const gemId = segs[i + 1];
      const chatId = segs[i + 2];
      return {
        kind: 'gem',
        gemId,
        chatId,
        userIndex,
        basePrefix,
        sourcePath: `${basePrefix}/gem/${gemId}/${chatId}`,
      };
    }

    return null;
  }

  // --- Token & API Helpers ---

  private getAtToken(): string {
    // Strategy 1: Hidden input field
    const input = document.querySelector('input[name="at"]') as HTMLInputElement | null;
    if (input?.value) return input.value;

    // Strategy 2: Embedded in page HTML
    const html = document.documentElement.innerHTML;
    const m = html.match(/"SNlM0e":"([^"]+)"/);
    if (m) return m[1];

    // Strategy 3: Global WIZ data
    try {
      const wizData = (window as unknown as { WIZ_global_data?: { SNlM0e?: string } }).WIZ_global_data;
      if (wizData?.SNlM0e) return wizData.SNlM0e;
    } catch (e) {
      console.error('[Gemini] Failed to access WIZ_global_data:', e);
    }

    throw new Error('Anti-CSRF token not found - Gemini may have changed authentication flow');
  }

  private getLang(): string {
    return document.documentElement.lang || 'en';
  }

  private getBatchUrl(route: GeminiRoute): string {
    const prefix = route.basePrefix || '';
    return `${prefix}/_/BardChatUi/data/batchexecute`;
  }

  // --- Fetch Conversation Data ---

  private async fetchConversationPayload(route: GeminiRoute): Promise<string> {
    const at = this.getAtToken(); // throws if not found

    const chatId = route.chatId;
    const convKey = chatId.startsWith('c_') ? chatId : `c_${chatId}`;

    const innerArgs = JSON.stringify([convKey, 1000, null, 1, [1], [4], null, 1]);
    const fReq = [[['hNvQHb', innerArgs, null, 'generic']]];
    const params = new URLSearchParams({
      rpcids: 'hNvQHb',
      'source-path': route.sourcePath,
      hl: this.getLang(),
      rt: 'c',
    });
    const body = new URLSearchParams({ 'f.req': JSON.stringify(fReq), at });

    const res = await fetch(`${this.getBatchUrl(route)}?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-same-domain': '1',
        accept: '*/*',
      },
      body: body.toString() + '&',
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`batchexecute failed: ${res.status} ${res.statusText}${t ? `\n${t.slice(0, 300)}` : ''}`);
    }
    return res.text();
  }

  private async fetchConversationTitle(route: GeminiRoute): Promise<string | null> {
    let at: string;
    try {
      at = this.getAtToken();
    } catch {
      return null; // Title fetch is optional, fail gracefully
    }

    const fullChatId = route.chatId.startsWith('c_') ? route.chatId : `c_${route.chatId}`;

    const tryArgsList = [
      JSON.stringify([13, null, [0, null, 1]]),
      JSON.stringify([200, null, [0, null, 1]]),
      null,
    ];

    for (const innerArgs of tryArgsList) {
      try {
        const fReq = [[['MaZiqc', innerArgs, null, 'generic']]];
        const params = new URLSearchParams({
          rpcids: 'MaZiqc',
          'source-path': route.sourcePath,
          hl: this.getLang(),
          rt: 'c',
        });
        const body = new URLSearchParams({ 'f.req': JSON.stringify(fReq), at });

        const res = await fetch(`${this.getBatchUrl(route)}?${params.toString()}`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'x-same-domain': '1',
            accept: '*/*',
          },
          body: body.toString() + '&',
        });

        if (!res.ok) continue;

        const text = await res.text();
        const payloads = this.parseBatchExecute(text, 'MaZiqc');

        for (const payload of payloads) {
          const title = this.findTitleInPayload(payload, fullChatId);
          if (title) return title;
        }
      } catch {
        // Try next argument pattern
      }
    }
    return null;
  }

  private findTitleInPayload(root: unknown, fullChatId: string): string | null {
    let found: string | null = null;
    const walk = (node: unknown): void => {
      if (found) return;
      if (Array.isArray(node)) {
        if (
          node.length >= 2 &&
          typeof node[0] === 'string' &&
          node[0] === fullChatId &&
          typeof node[1] === 'string' &&
          node[1].trim()
        ) {
          found = node[1].trim();
          return;
        }
        for (const child of node) walk(child);
      }
    };
    walk(root);
    return found;
  }

  private getTitleFallback(): string {
    let title = document.title?.trim() || 'Gemini Chat';
    if (title.includes(' - Gemini')) {
      title = title.split(' - Gemini')[0].trim();
    }
    if (title === 'Gemini' || title === 'Google Gemini') {
      title = 'Gemini Chat';
    }
    return title;
  }

  // --- Parse batchexecute response ---

  private parseBatchExecute(text: string, targetRpcId: string): unknown[] {
    if (text.startsWith(")]}'\\n") || text.startsWith(")]}'")) {
      const nl = text.indexOf('\n');
      text = nl >= 0 ? text.slice(nl + 1) : '';
    }
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const payloads: unknown[] = [];

    for (let i = 0; i < lines.length; ) {
      const lenStr = lines[i++];
      const len = parseInt(lenStr, 10);
      if (!isFinite(len)) break;
      const jsonLine = lines[i++] || '';
      let segment: unknown;
      try {
        segment = JSON.parse(jsonLine);
      } catch {
        continue;
      }
      if (Array.isArray(segment)) {
        for (const entry of segment) {
          if (Array.isArray(entry) && entry[0] === 'wrb.fr' && entry[1] === targetRpcId) {
            const s = entry[2];
            if (typeof s === 'string') {
              try {
                const inner = JSON.parse(s);
                payloads.push(inner);
              } catch {
                // ignore
              }
            }
          }
        }
      }
    }
    return payloads;
  }

  // --- Block Extraction ---

  private isUserMessageNode(node: unknown): node is [string[], number, ...unknown[]] {
    return (
      Array.isArray(node) &&
      node.length >= 2 &&
      Array.isArray(node[0]) &&
      node[0].length >= 1 &&
      node[0].every((p: unknown) => typeof p === 'string') &&
      (node[1] === 2 || node[1] === 1)
    );
  }

  private getUserTextFromNode(userNode: [string[], ...unknown[]]): string {
    try {
      return userNode[0].join('\n');
    } catch {
      return '';
    }
  }

  private isAssistantNode(node: unknown): node is [string, [string, ...unknown[]], ...unknown[]] {
    return (
      Array.isArray(node) &&
      node.length >= 2 &&
      typeof node[0] === 'string' &&
      node[0].startsWith('rc_') &&
      Array.isArray(node[1]) &&
      typeof node[1][0] === 'string'
    );
  }

  private isAssistantContainer(node: unknown): boolean {
    return (
      Array.isArray(node) &&
      node.length >= 1 &&
      Array.isArray(node[0]) &&
      node[0].length >= 1 &&
      this.isAssistantNode(node[0][0])
    );
  }

  private getAssistantNodeFromContainer(container: unknown[]): unknown {
    try {
      return (container[0] as unknown[])[0];
    } catch {
      return null;
    }
  }

  private getAssistantTextFromNode(assistantNode: unknown): string {
    try {
      return ((assistantNode as unknown[])[1] as string[])[0] || '';
    } catch {
      return '';
    }
  }

  private extractReasoningFromAssistantNode(assistantNode: unknown): string | null {
    if (!Array.isArray(assistantNode)) return null;
    for (let k = assistantNode.length - 1; k >= 0; k--) {
      const child = assistantNode[k];
      if (Array.isArray(child)) {
        if (
          child.length >= 2 &&
          Array.isArray(child[1]) &&
          child[1].length >= 1 &&
          Array.isArray(child[1][0]) &&
          child[1][0].length >= 1 &&
          child[1][0].every((x: unknown) => typeof x === 'string')
        ) {
          const txt = child[1][0].join('\n\n').trim();
          if (txt) return txt;
        }
        if (Array.isArray(child[0]) && child[0].length >= 1 && child[0].every((x: unknown) => typeof x === 'string')) {
          const txt = child[0].join('\n\n').trim();
          if (txt) return txt;
        }
      }
    }
    return null;
  }

  private isTimestampPair(arr: unknown): arr is [number, number] {
    return (
      Array.isArray(arr) &&
      arr.length === 2 &&
      typeof arr[0] === 'number' &&
      typeof arr[1] === 'number' &&
      arr[0] > 1_600_000_000
    );
  }

  private detectBlock(node: unknown): MessageBlock | null {
    if (!Array.isArray(node)) return null;
    let userNode: [string[], number, ...unknown[]] | null = null;
    let assistantContainer: unknown[] | null = null;
    let tsCandidate: [number, number] | null = null;

    for (const child of node) {
      if (this.isUserMessageNode(child) && !userNode) userNode = child;
      if (this.isAssistantContainer(child) && !assistantContainer) assistantContainer = child as unknown[];
      if (this.isTimestampPair(child)) {
        if (!tsCandidate || child[0] > tsCandidate[0] || (child[0] === tsCandidate[0] && child[1] > tsCandidate[1])) {
          tsCandidate = child;
        }
      }
    }

    if (userNode && assistantContainer) {
      const assistantNode = this.getAssistantNodeFromContainer(assistantContainer);
      if (!assistantNode) return null;
      const userText = this.getUserTextFromNode(userNode);
      const assistantText = this.getAssistantTextFromNode(assistantNode);
      const thoughtsText = this.extractReasoningFromAssistantNode(assistantNode);
      return {
        userText,
        assistantText,
        thoughtsText: thoughtsText || null,
        tsPair: tsCandidate || null,
      };
    }
    return null;
  }

  private static readonly MAX_RECURSION_DEPTH = 30;

  private extractBlocksFromPayloadRoot(root: unknown): MessageBlock[] {
    const blocks: MessageBlock[] = [];
    const seenHashes = new Set<string>();

    const scan = (node: unknown, depth: number): void => {
      if (depth > GeminiAdapter.MAX_RECURSION_DEPTH) {
        console.warn('[Gemini] Max recursion depth reached, truncating scan');
        return;
      }
      if (!Array.isArray(node)) return;

      const block = this.detectBlock(node);
      if (block) {
        const hash = this.hashBlock(block);
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          blocks.push(block);
        }
      }
      for (const child of node) scan(child, depth + 1);
    };
    scan(root, 0);
    return blocks;
  }

  private hashBlock(block: MessageBlock): string {
    // Simple hash combining lengths and timestamp - avoids O(n) JSON.stringify
    const userLen = block.userText.length;
    const assistLen = block.assistantText.length;
    const thoughtLen = block.thoughtsText?.length || 0;
    const ts0 = block.tsPair?.[0] || 0;
    const ts1 = block.tsPair?.[1] || 0;
    // Include first/last chars for better collision resistance
    const userSig = block.userText ? `${block.userText[0]}${block.userText.slice(-1)}` : '';
    const assistSig = block.assistantText ? `${block.assistantText[0]}${block.assistantText.slice(-1)}` : '';
    return `${userLen}:${assistLen}:${thoughtLen}:${ts0}:${ts1}:${userSig}:${assistSig}`;
  }

  private extractAllBlocks(payloads: unknown[]): MessageBlock[] {
    let blocks: MessageBlock[] = [];
    for (const p of payloads) {
      const b = this.extractBlocksFromPayloadRoot(p);
      blocks = blocks.concat(b);
    }

    const withIndex = blocks.map((b, i) => ({ ...b, _i: i }));
    withIndex.sort((a, b) => {
      const c = this.cmpTimestampAsc(a, b);
      return c !== 0 ? c : a._i - b._i;
    });
    return withIndex.map(({ _i, ...rest }) => rest);
  }

  private cmpTimestampAsc(a: MessageBlock, b: MessageBlock): number {
    if (!a.tsPair && !b.tsPair) return 0;
    if (!a.tsPair) return -1;
    if (!b.tsPair) return 1;
    if (a.tsPair[0] !== b.tsPair[0]) return a.tsPair[0] - b.tsPair[0];
    return a.tsPair[1] - b.tsPair[1];
  }

  // --- Convert to Message[] ---

  private blocksToMessages(blocks: MessageBlock[]): Message[] {
    const messages: Message[] = [];
    for (const blk of blocks) {
      const userContent = (blk.userText || '').trim();
      const assistantContent = (blk.assistantText || '').trim();
      const thoughtsContent = (blk.thoughtsText || '').trim();

      if (userContent) {
        messages.push({ role: 'user', content: userContent });
      }

      // If there are thoughts, prepend them to assistant response
      if (thoughtsContent && assistantContent) {
        messages.push({
          role: 'assistant',
          content: `<thinking>\n${thoughtsContent}\n</thinking>\n\n${assistantContent}`,
        });
      } else if (assistantContent) {
        messages.push({ role: 'assistant', content: assistantContent });
      } else if (thoughtsContent) {
        messages.push({
          role: 'assistant',
          content: `<thinking>\n${thoughtsContent}\n</thinking>`,
        });
      }
    }
    return messages;
  }
}
