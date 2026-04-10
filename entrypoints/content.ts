/**
 * Content script - floating export bubble for all AI chat platforms
 */

import { registry } from '../src/core/registry';
import { ChatGPTAdapter } from '../src/platforms/chatgpt';
import { GeminiAdapter } from '../src/platforms/gemini';
import { GrokAdapter } from '../src/platforms/grok';
import { ClaudeAdapter } from '../src/platforms/claude';
import { MarkdownExporter } from '../src/exporters/markdown';
import { getSettings } from '../src/core/settings';
import type { Conversation, PlatformAdapter } from '../src/core/types';

registry.registerPlatform(new ChatGPTAdapter());
registry.registerPlatform(new GeminiAdapter());
registry.registerPlatform(new GrokAdapter());
registry.registerPlatform(new ClaudeAdapter());
registry.registerExporter(new MarkdownExporter());

export default defineContentScript({
  matches: [
    'https://chat.openai.com/*',
    'https://chatgpt.com/*',
    'https://gemini.google.com/*',
    'https://grok.com/*',
    'https://x.com/i/grok*',
    'https://claude.ai/*',
  ],
  main() {
    const platform = registry.getPlatformFor(window.location.href);
    if (!platform) return;

    console.log(`[Chat Exporter] ${platform.id} detected`);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => injectBubble(platform));
    } else {
      injectBubble(platform);
    }
  },
});

function defineContentScript(config: any) {
  return config;
}

function injectBubble(platform: PlatformAdapter) {
  if (document.getElementById('chat-exporter-bubble')) return;

  const bubble = document.createElement('div');
  bubble.id = 'chat-exporter-bubble';

  Object.assign(bubble.style, {
    position: 'fixed',
    bottom: '32px',
    right: '32px',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#1a1a1a',
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.15s, box-shadow 0.15s',
    userSelect: 'none',
  });

  bubble.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color: #fff;">
      <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  bubble.title = `Export ${platform.id} conversation`;

  bubble.onmouseenter = () => {
    bubble.style.transform = 'scale(1.1)';
    bubble.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
  };
  bubble.onmouseleave = () => {
    bubble.style.transform = 'scale(1)';
    bubble.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
  };

  bubble.onclick = () => exportConversation(platform, bubble);

  document.body.appendChild(bubble);
}

async function exportConversation(platform: PlatformAdapter, bubble: HTMLElement) {
  const originalHTML = bubble.innerHTML;

  // Loading state
  bubble.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color: #fff; animation: spin 1s linear infinite;">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  `;
  bubble.style.pointerEvents = 'none';

  try {
    const conversation = await platform.scrape(document);
    if (!conversation) {
      throw new Error('No conversation found');
    }
    if (!conversation.messages.length) {
      throw new Error('Conversation is empty');
    }

    const settings = await getSettings();
    const exporter = registry.getExporter('markdown');
    if (!exporter) throw new Error('Exporter not found');

    const content = exporter.export(conversation, {
      includeThinking: settings.includeThinking,
      includeMetadata: settings.includeMetadata,
      includeTimestamps: settings.includeTimestamps,
    });

    const filename = buildExportFilename(conversation);
    downloadFile(content, filename, exporter.extension);

    // Success
    bubble.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color: #4ade80;">
        <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    setTimeout(() => {
      bubble.innerHTML = originalHTML;
    }, 1500);
  } catch (err) {
    console.error('[Chat Exporter]', err);
    bubble.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color: #f87171;">
        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    setTimeout(() => {
      bubble.innerHTML = originalHTML;
    }, 2000);
  } finally {
    bubble.style.pointerEvents = 'auto';
  }
}

// YYYYMMDD-platform-slug  (sorts chronologically, human-readable)
function buildExportFilename(conv: Conversation): string {
  const date = conv.timestamp.slice(0, 10).replace(/-/g, '');
  const slug = sanitizeFilename(conv.title).slice(0, 60).replace(/-+$/, '');
  return `${date}-${conv.platform}-${slug}`;
}

function downloadFile(content: string, filename: string, extension: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .substring(0, 200)
    .trim();
}
