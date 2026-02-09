/**
 * Grok platform adapter (grok.com and x.com/i/grok)
 *
 * Role detection strategy (discovered from DOM analysis):
 * - Assistant messages have action buttons: Like, Dislike, Regenerate, Copy text
 * - User messages do NOT have these buttons
 * - This is a STABLE signal based on aria-labels, not CSS classes
 *
 * Fallback to heuristics if DOM detection fails (aligned with enhanced-grok-export v2.4)
 *
 * Known limitations:
 * - Message container CSS selectors may break on Grok UI updates
 * - Injection uses stable aria-labels
 */

import type { Conversation, Message, PlatformAdapter } from '../core/types';

interface RawMessage {
  text: string;
  element: Element;
  index: number;
  hasAssistantButtons: boolean;
}

interface ScoredMessage {
  role: 'user' | 'assistant';
  content: string;
  confidence: 'high' | 'medium' | 'low';
}

// Stable aria-labels that only appear on assistant (Grok) responses
const ASSISTANT_BUTTON_LABELS = ['Like', 'Dislike', 'Regenerate', 'Copy text'];

export class GrokAdapter implements PlatformAdapter {
  id = 'grok';

  matches(url: string): boolean {
    return /grok\.com|x\.com\/i\/grok/.test(url);
  }

  async scrape(doc: Document): Promise<Conversation | null> {
    console.warn(
      '[Chat Exporter] Grok adapter uses heuristic speaker detection. ' +
        'Results may be inaccurate. Please verify the exported conversation.'
    );

    await this.loadFullConversation();

    const rawMessages = this.extractRawMessages(doc);
    if (rawMessages.length === 0) {
      console.warn('[Grok] No messages found. DOM structure may have changed.');
      return null;
    }

    const messages = this.assignRoles(rawMessages);
    if (messages.length === 0) return null;

    const url = window.location.href;
    const conversationIdMatch = url.match(/\/(?:c|chat|share)\/([a-zA-Z0-9_-]+)/);
    const conversationId = conversationIdMatch?.[1];

    let title = this.extractTitle(doc, messages);

    return {
      platform: 'grok',
      title,
      messages,
      url,
      timestamp: new Date().toISOString(),
      conversationId,
    };
  }

  private extractTitle(doc: Document, messages: Message[]): string {
    const docTitle = doc.title;
    if (docTitle && docTitle !== 'Grok' && !docTitle.toLowerCase().includes('grok.com')) {
      const cleaned = docTitle.replace(/\s*[-|–]\s*Grok.*$/i, '').trim();
      if (cleaned && cleaned.length > 0) return cleaned;
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

  private extractRawMessages(doc: Document): RawMessage[] {
    const messages: RawMessage[] = [];
    const seenTexts = new Set<string>();

    // Find main content - try multiple selectors
    const mainArea =
      doc.querySelector('main[role="main"]') ||
      doc.querySelector('[data-testid="primaryColumn"]') ||
      doc.body;

    console.log('[Grok] Searching for messages in:', mainArea.tagName);

    // Strategy: Find all text containers and filter intelligently
    // Look for css-1jxf684 spans which contain actual text content
    const textContainers = mainArea.querySelectorAll('span[class*="css-1jxf684"]');
    console.log(`[Grok] Found ${textContainers.length} text containers`);

    // Group text containers by their message turn (walk up to find turn boundary)
    const turnMap = new Map<Element, string[]>();

    textContainers.forEach(span => {
      const text = span.textContent?.trim() || '';
      if (text.length < 5) return; // Skip tiny fragments

      // Find the message turn container (walk up looking for a boundary)
      const turn = this.findTurnContainer(span);
      if (!turn) return;

      if (!turnMap.has(turn)) {
        turnMap.set(turn, []);
      }
      turnMap.get(turn)!.push(text);
    });

    console.log(`[Grok] Found ${turnMap.size} potential message turns`);

    // Process each turn
    turnMap.forEach((textParts, turnElement) => {
      // Combine text parts, removing duplicates
      const uniqueParts: string[] = [];
      const seen = new Set<string>();
      textParts.forEach(part => {
        if (!seen.has(part)) {
          seen.add(part);
          uniqueParts.push(part);
        }
      });

      const fullText = uniqueParts.join(' ').trim();

      // Filter out navigation/UI
      if (fullText.length < 30) return;
      if (this.isNavigationOrUI(fullText)) return;
      if (seenTexts.has(fullText)) return;

      seenTexts.add(fullText);

      // Check for Like/Dislike buttons to determine role
      const hasAssistantButtons = this.hasAssistantActionButtons(turnElement);

      messages.push({
        text: fullText,
        element: turnElement,
        index: messages.length,
        hasAssistantButtons,
      });
    });

    // Sort by DOM order
    messages.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    messages.forEach((msg, idx) => {
      msg.index = idx;
    });

    console.log(`[Grok] Final message count: ${messages.length}`);
    return this.dedupeConsecutive(messages);
  }

  private findTurnContainer(element: Element): Element | null {
    // Walk up to find a reasonable message turn boundary
    let current: Element | null = element;
    let depth = 0;
    let lastGoodContainer: Element | null = null;

    while (current && depth < 15) {
      const classes = current.className || '';

      // Stop at navigation elements
      if (current.tagName === 'NAV' || current.tagName === 'HEADER') {
        break;
      }

      // Good container indicators
      if (classes.includes('r-13qz1uu') || classes.includes('r-1awozwy')) {
        lastGoodContainer = current;
      }

      // Stop at these structural boundaries
      if (classes.includes('r-gtdqiz') || classes.includes('r-1gn8etr')) {
        return lastGoodContainer || current;
      }

      current = current.parentElement;
      depth++;
    }

    return lastGoodContainer;
  }

  private hasAssistantActionButtons(element: Element): boolean {
    // Check for Like, Dislike, Regenerate buttons (only on assistant messages)
    const likeBtn = element.querySelector('button[aria-label="Like"]');
    const dislikeBtn = element.querySelector('button[aria-label="Dislike"]');
    const regenBtn = element.querySelector('button[aria-label="Regenerate"]');
    return !!(likeBtn || dislikeBtn || regenBtn);
  }

  private isNavigationOrUI(text: string): boolean {
    // Common navigation and UI text patterns to exclude
    const uiPatterns = [
      /^Home$/i,
      /^Explore$/i,
      /^Notifications$/i,
      /^Messages?$/i,
      /^Chat$/i,
      /^Grok$/i,
      /^Communities$/i,
      /^Profile$/i,
      /^More$/i,
      /^Post$/i,
      /^See new posts$/i,
      /^Thoughts$/i,
      /^\d+ web pages?$/i,
      /^\d+ posts?$/i,
      /^Expert$/i,
      /^Focus Mode$/i,
      /^@\w+$/, // Just a username
      /^To view keyboard shortcuts/i,
      /^Skip to/i,
    ];

    for (const pattern of uiPatterns) {
      if (pattern.test(text.trim())) return true;
    }

    // Also exclude very short text that's likely UI
    if (text.length < 15 && !/[.!?]/.test(text)) {
      // Short text without punctuation is likely UI
      return true;
    }

    return false;
  }

  private detectAssistantButtons(element: Element): boolean {
    // Look for assistant-only buttons within this element or nearby siblings
    // These buttons only appear on Grok responses, not user messages
    const container = this.findMessageContainer(element);
    if (!container) return false;

    for (const label of ASSISTANT_BUTTON_LABELS) {
      const btn = container.querySelector(`button[aria-label="${label}"]`);
      if (btn) return true;
    }
    return false;
  }

  private findMessageContainer(element: Element): Element | null {
    // Walk up the DOM to find a reasonable message container
    // Stop at main content area or after 10 levels
    let current: Element | null = element;
    let depth = 0;

    while (current && depth < 10) {
      // Check if this container has assistant buttons
      for (const label of ASSISTANT_BUTTON_LABELS) {
        if (current.querySelector(`button[aria-label="${label}"]`)) {
          return current;
        }
      }
      current = current.parentElement;
      depth++;
    }

    // Return the original element's closest reasonable container
    return element.closest('[class*="r-13qz1uu"]') || element.parentElement;
  }

  private filterValidElements(elements: Element[]): Element[] {
    return elements.filter(el => {
      const text = el.textContent?.trim() || '';
      // Min 20 chars for actual content, max 100k to avoid grabbing entire page
      if (text.length < 20 || text.length >= 100000) return false;
      // Exclude UI patterns
      if (this.isNavigationOrUI(text)) return false;
      return true;
    });
  }

  private dedupeConsecutive(messages: RawMessage[]): RawMessage[] {
    const result: RawMessage[] = [];
    for (const msg of messages) {
      const prev = result[result.length - 1];
      // Only dedupe if CONSECUTIVE, IDENTICAL text, AND same role indicator
      if (!prev || prev.text !== msg.text || prev.hasAssistantButtons !== msg.hasAssistantButtons) {
        result.push(msg);
      }
    }
    return result;
  }

  private extractCleanText(element: Element): string {
    const clone = element.cloneNode(true) as Element;

    // Remove UI chrome
    const selectors = [
      'svg',
      'button',
      'input',
      'select',
      'nav',
      'header',
      'footer',
      'script',
      'style',
      '[aria-hidden="true"]',
    ];
    clone.querySelectorAll(selectors.join(', ')).forEach(el => el.remove());

    return clone.textContent?.trim() || '';
  }

  private assignRoles(rawMessages: RawMessage[]): Message[] {
    const scored: ScoredMessage[] = rawMessages.map((msg, idx) => {
      const { role, confidence } = this.scoreMessage(msg.text, idx, rawMessages);
      return { role, content: msg.text, confidence };
    });

    // Log low-confidence assignments for debugging
    scored.forEach((msg, idx) => {
      if (msg.confidence === 'low') {
        console.warn(
          `[Grok] Low confidence on message ${idx + 1}: assigned "${msg.role}" ` +
            `for: "${msg.content.slice(0, 50)}..."`
        );
      }
    });

    return scored.map(m => ({ role: m.role, content: m.content }));
  }

  private scoreMessage(
    text: string,
    index: number,
    allMessages: RawMessage[]
  ): { role: 'user' | 'assistant'; confidence: 'high' | 'medium' | 'low' } {
    const msg = allMessages[index];

    // === PRIMARY: DOM-based detection using aria-label buttons ===
    // This is the MOST RELIABLE signal - Like/Dislike/Regenerate only on assistant messages
    if (msg.hasAssistantButtons) {
      return { role: 'assistant', confidence: 'high' };
    }

    // If DOM detection didn't find assistant buttons, it's likely a user message
    // But we still apply heuristics to catch edge cases
    let assistantScore = 0;
    let userScore = 0;

    // Start with a bonus for user (no assistant buttons found)
    userScore += 2;

    // === LENGTH ANALYSIS (Most reliable per reference impl) ===
    if (text.length > 400) {
      assistantScore += 4;
    } else if (text.length > 200) {
      assistantScore += 2;
    } else if (text.length < 50) {
      userScore += 2;
    }

    // === ASSISTANT PATTERNS ===
    // Response starters
    if (
      /^(I'll|I can|I'd be happy|Here's|Let me|I understand|Certainly|Absolutely|Looking at)/i.test(
        text
      )
    ) {
      assistantScore += 3;
    }
    // Grok personality phrases
    if (/^(Yo, I'm right here|Hey there|What's up|Oof|Thanks for sharing)/i.test(text)) {
      assistantScore += 4;
    }
    // Analysis starters
    if (
      /^(From your|Based on your|Looking at your|The error|This means|Why It's Happening)/i.test(
        text
      )
    ) {
      assistantScore += 4;
    }
    // Code blocks
    if (/```/.test(text)) {
      assistantScore += 3;
    }
    // Technical terms in longer messages
    if (
      text.length > 100 &&
      /(docker|container|build|error|issue|problem|fix|solution)/i.test(text)
    ) {
      assistantScore += 2;
    }
    // Structured content
    if (/\n\n/.test(text) && text.length > 150) {
      assistantScore += 1;
    }
    // Grok personality
    if (/(fully alive|kicking in the digital realm|locked in|squash|tackle this)/i.test(text)) {
      assistantScore += 4;
    }
    // Instructional language
    if (/^(Let's|Why|Steps to|Here's how)/i.test(text)) {
      assistantScore += 3;
    }

    // === USER PATTERNS ===
    // Greetings and requests
    if (/^(hi|hello|hey|can you|could you|please|help|i need|i want)/i.test(text)) {
      userScore += 3;
    }
    // Direct address to Grok
    if (/^(grok|are you|do you remember)/i.test(text)) {
      userScore += 5;
    }
    // Questions (short)
    if (/\?$/.test(text) && text.length < 150) {
      userScore += 3;
    }
    // Acknowledgments
    if (/^(ok|okay|thanks|thank you|great|perfect|yes|no|good|nice)/i.test(text)) {
      userScore += 2;
    }
    // Terminal commands
    if (/^(root@|trying|nano|ls |cd |cat |vim |docker run|docker build)/i.test(text)) {
      userScore += 4;
    }
    // Directive language
    if (/^(let's|lets|now|next|alright|ready)/i.test(text)) {
      userScore += 2;
    }

    // === CONTEXT ANALYSIS ===
    if (index > 0) {
      const prevText = allMessages[index - 1].text;
      // Long response to question -> assistant
      if (prevText.includes('?') && prevText.length < 200 && text.length > 150) {
        assistantScore += 3;
      }
      // Short follow-up to long message -> user
      if (prevText.length > 300 && text.length < 100) {
        userScore += 2;
      }
    }

    // === QUESTION ANALYSIS ===
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount > 0 && text.length < 150) {
      userScore += questionCount * 2;
    }

    // === POSITION ANALYSIS ===
    if (index === 0) {
      userScore += 2;
    }

    // === DECISION (Balanced thresholds from reference impl v2.4) ===
    let role: 'user' | 'assistant';
    let confidence: 'high' | 'medium' | 'low';

    // Reference impl: grokScore >= humanScore + 2 for Grok (clear advantage)
    // Reference impl: humanScore >= grokScore + 1 for Human (easier detection)
    if (assistantScore >= userScore + 2) {
      role = 'assistant';
      confidence = assistantScore >= userScore + 4 ? 'high' : 'medium';
    } else if (userScore >= assistantScore + 1) {
      role = 'user';
      confidence = userScore >= assistantScore + 3 ? 'high' : 'medium';
    } else {
      // Fallback with additional heuristics
      if (/^root@|nano |ls -|docker run|docker build/.test(text) || text.length < 25) {
        role = 'user';
        confidence = 'medium';
      } else if (text.includes('?') && text.length < 100) {
        role = 'user';
        confidence = 'medium';
      } else if (text.length > 300 && /(Fix:|Issue:|Solution:)/i.test(text)) {
        role = 'assistant';
        confidence = 'medium';
      } else if (text.length > 150 && /(docker|container|error)/i.test(text)) {
        role = 'assistant';
        confidence = 'low';
      } else if (text.length < 100 && !/Here's|Let's/i.test(text)) {
        role = 'user';
        confidence = 'low';
      } else {
        // Final alternating fallback
        role = index % 2 === 0 ? 'user' : 'assistant';
        confidence = 'low';
      }
    }

    return { role, confidence };
  }
}
