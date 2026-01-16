/**
 * Markdown exporter for conversations
 */

import type { Conversation, ExportOptions, Exporter } from '../core/types';

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  includeThinking: true,
  includeMetadata: true,
  includeTimestamps: true,
};

export class MarkdownExporter implements Exporter {
  id = 'markdown';
  extension = 'md';

  export(conversation: Conversation, options?: ExportOptions): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines: string[] = [];

    if (opts.includeMetadata) {
      this.addFrontmatter(lines, conversation, opts);
    }

    lines.push(`# ${conversation.title}`);
    lines.push('');

    const separator = '━'.repeat(60);

    for (const msg of conversation.messages) {
      const { emoji, name } = this.getRoleBanner(msg.role);
      lines.push(separator);
      lines.push(`${emoji} ${name}`);
      lines.push(separator);
      lines.push('');

      let content = msg.content;
      if (!opts.includeThinking) {
        content = this.stripThinking(content);
      }
      lines.push(content);
      lines.push('');
    }

    return lines.join('\n').trim() + '\n';
  }

  private addFrontmatter(lines: string[], conv: Conversation, opts: Required<ExportOptions>): void {
    lines.push('---');
    lines.push(`title: ${this.yamlString(conv.title)}`);
    lines.push(`platform: ${conv.platform}`);

    if (conv.conversationId) {
      lines.push(`conversation_id: ${conv.conversationId}`);
    }

    const type = conv.isProject ? 'project' : conv.gptId ? 'gpt' : 'chat';
    lines.push(`type: ${type}`);

    if (conv.gptId) {
      const idLabel = conv.isProject ? 'project_id' : 'gpt_id';
      const nameLabel = conv.isProject ? 'project_name' : 'gpt_name';
      lines.push(`${idLabel}: ${conv.gptId}`);
      if (conv.gptName) {
        lines.push(`${nameLabel}: ${this.yamlString(conv.gptName)}`);
      }
    }

    if (conv.model) {
      lines.push(`model: ${this.yamlString(conv.model)}`);
    }

    if (opts.includeTimestamps) {
      lines.push(`created: ${conv.timestamp}`);
      lines.push(`exported: ${new Date().toISOString()}`);
    }

    lines.push(`messages: ${conv.messages.length}`);
    lines.push(`source: ${this.yamlString(conv.url)}`);
    lines.push('---');
    lines.push('');
  }

  private yamlString(value: string): string {
    if (!value) return '""';
    // Safe if: alphanumeric, dash, underscore, dot, and no leading/trailing spaces
    if (/^[a-zA-Z0-9._-]+$/.test(value) && value === value.trim()) {
      return value;
    }
    // Double-quote and escape \ and "
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  private getRoleBanner(role: string): { emoji: string; name: string } {
    switch (role) {
      case 'assistant':
        return { emoji: '🤖', name: 'ASSISTANT' };
      case 'system':
        return { emoji: '⚙️', name: 'SYSTEM' };
      default:
        return { emoji: '👤', name: 'USER' };
    }
  }

  private stripThinking(content: string): string {
    // Use multiline flag and anchor to start of line for safer matching
    return content
      .replace(/^<thinking>\n[\s\S]*?\n<\/thinking>\n*/gm, '')
      .trim();
  }
}
