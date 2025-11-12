/**
 * Markdown exporter for conversations
 */

import type { Conversation, Exporter } from '../core/types';

export class MarkdownExporter implements Exporter {
  id = 'markdown';
  extension = 'md';

  export(conversation: Conversation): string {
    const lines: string[] = [];

    // YAML frontmatter - clean and organized
    lines.push('---');
    lines.push(`title: "${conversation.title}"`);

    // Context
    if (conversation.conversationId) {
      lines.push(`conversation_id: ${conversation.conversationId}`);
    }

    const type = conversation.isProject ? 'project' : conversation.gptId ? 'gpt' : 'chat';
    lines.push(`type: ${type}`);

    // GPT/Project metadata
    if (conversation.gptId) {
      const idLabel = conversation.isProject ? 'project_id' : 'gpt_id';
      const nameLabel = conversation.isProject ? 'project_name' : 'gpt_name';
      lines.push(`${idLabel}: ${conversation.gptId}`);
      if (conversation.gptName) {
        lines.push(`${nameLabel}: "${conversation.gptName}"`);
      }
    }

    // Model
    if (conversation.model) {
      lines.push(`model: ${conversation.model}`);
    }

    // Timestamps
    lines.push(`created: ${conversation.timestamp}`);
    lines.push(`exported: ${new Date().toISOString()}`);

    // Stats
    lines.push(`messages: ${conversation.messages.length}`);

    // Source
    lines.push(`source: ${conversation.url}`);
    lines.push('---');
    lines.push('');

    // Main title
    lines.push(`# ${conversation.title}`);
    lines.push('');

    // Messages with emoji banner separators (unambiguous, visual)
    const separator = '━'.repeat(60);

    for (let i = 0; i < conversation.messages.length; i++) {
      const msg = conversation.messages[i];

      // Role banner with emoji
      let roleEmoji = '👤';
      let roleName = 'USER';
      if (msg.role === 'assistant') {
        roleEmoji = '🤖';
        roleName = 'ASSISTANT';
      } else if (msg.role === 'system') {
        roleEmoji = '⚙️';
        roleName = 'SYSTEM';
      }

      lines.push(separator);
      lines.push(`${roleEmoji} ${roleName}`);
      lines.push(separator);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }

    return lines.join('\n').trim() + '\n'; // Ensure single trailing newline
  }
}
