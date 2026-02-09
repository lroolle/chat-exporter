/**
 * Core type definitions for Chat Exporter
 */

export interface ImageAsset {
  alt: string;
  originalSrc: string;
  dataUri?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageAsset[];
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
  scrape(doc: Document): Promise<Conversation | null>;
}

export interface ExportOptions {
  includeThinking?: boolean;
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
}

export interface Exporter {
  id: string;
  extension: string;
  export(conversation: Conversation, options?: ExportOptions): string;
}
