/**
 * Core type definitions for Chat Exporter
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface Conversation {
  platform: string;
  title: string;
  messages: Message[];
  url: string;
  timestamp: string;
  conversationId?: string;
  gptId?: string;
  gptName?: string;
  isProject?: boolean;
  model?: string;
}

export interface PlatformAdapter {
  id: string;
  matches(url: string): boolean;
  scrape(doc: Document): Conversation | null;
  getInjectionPoint(doc: Document): Element | null;
}

export interface Exporter {
  id: string;
  extension: string;
  export(conversation: Conversation): string;
}
