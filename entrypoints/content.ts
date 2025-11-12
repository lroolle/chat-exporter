/**
 * Content script - orchestrates platform adapters and exporters
 */

import { registry } from '../src/core/registry';
import { ChatGPTAdapter } from '../src/platforms/chatgpt';
import { MarkdownExporter } from '../src/exporters/markdown';

// Register platform adapters
registry.registerPlatform(new ChatGPTAdapter());

// Register exporters
registry.registerExporter(new MarkdownExporter());

export default defineContentScript({
  matches: ['https://chat.openai.com/*', 'https://chatgpt.com/*'],
  main() {
    console.log('[Chat Exporter] Content script loaded');

    // Initialize exporter when page is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initExporter());
    } else {
      setTimeout(() => initExporter(), 0);
    }
  },
});

function defineContentScript(config: any) {
  return config;
}

function initExporter() {
  // Detect platform
  const platform = registry.getPlatformFor(window.location.href);
  if (!platform) {
    console.log('[Chat Exporter] Platform not supported');
    return;
  }

  console.log(`[Chat Exporter] Platform detected: ${platform.id}`);

  let attempts = 0;
  const maxAttempts = 20; // Try for ~10 seconds
  const checkInterval = 500; // Check every 500ms

  const tryInject = () => {
    // Already injected
    if (document.getElementById('chat-exporter-btn')) {
      return;
    }

    // Look for Share button as signal that header is ready
    const buttons = Array.from(document.querySelectorAll('button'));
    const shareButton = buttons.find(
      btn =>
        btn.textContent?.includes('Share') ||
        btn.getAttribute('aria-label')?.toLowerCase().includes('share')
    );

    if (shareButton) {
      console.log('[Chat Exporter] Header ready, injecting button...');
      injectExportButton(platform);
      return;
    }

    // Keep trying
    attempts++;
    if (attempts < maxAttempts) {
      setTimeout(tryInject, checkInterval);
    } else {
      // Timeout - inject anyway if main content exists
      const mainContent = document.querySelector('main');
      if (mainContent) {
        console.log('[Chat Exporter] Timeout, injecting anyway...');
        injectExportButton(platform);
      }
    }
  };

  // Start trying
  tryInject();

  // Watch for SPA navigation - re-inject if button disappears
  let observer: MutationObserver | null = null;
  let reinjectTimer: number | null = null;

  const scheduleReinject = () => {
    if (reinjectTimer) return;

    reinjectTimer = window.setTimeout(() => {
      reinjectTimer = null;
      if (!document.getElementById('chat-exporter-btn')) {
        console.log('[Chat Exporter] Button disappeared, re-injecting...');
        tryInject();
      }
    }, 250);
  };

  const startWatching = () => {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      if (!document.getElementById('chat-exporter-btn')) {
        scheduleReinject();
      }
    });

    const targets = [
      document.querySelector('header'),
      document.querySelector('[role="banner"]'),
      document.querySelector('nav'),
      document.body,
    ].filter((el): el is Element => Boolean(el));

    targets.forEach(target => {
      observer?.observe(target, {
        childList: true,
        subtree: true,
      });
    });
  };

  // Delay observer start to avoid interfering with initial injection
  setTimeout(startWatching, 5000);
}

function injectExportButton(platform: any) {
  const button = document.createElement('button');
  button.id = 'chat-exporter-btn';
  button.className = 'btn relative btn-ghost text-token-text-primary';
  button.title = 'Export current conversation to Markdown';

  // Compact styling to match Share button exactly
  Object.assign(button.style, {
    marginLeft: '0',
    marginRight: '0.25rem',
  });

  // Create icon + text like Share button
  button.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
      <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span style="margin-left: 0.5rem;">Export</span>
  `;

  button.onclick = () => exportConversation(platform);

  // Try to get injection point from platform adapter
  const injectionPoint = platform.getInjectionPoint(document);

  if (injectionPoint) {
    // Find Share button to insert before it
    const buttons = Array.from(injectionPoint.querySelectorAll('button')) as HTMLButtonElement[];
    const shareButton = buttons.find(
      (btn: HTMLButtonElement) =>
        btn.textContent?.includes('Share') ||
        btn.getAttribute('aria-label')?.includes('Share') ||
        btn.getAttribute('aria-label')?.includes('share')
    );

    if (shareButton) {
      injectionPoint.insertBefore(button, shareButton);
      console.log('[Chat Exporter] Export button injected next to Share button');
      return;
    }

    // No Share button found, append to container
    injectionPoint.appendChild(button);
    console.log('[Chat Exporter] Export button injected into header');
    return;
  }

  // Fallback to fixed position - align with header
  Object.assign(button.style, {
    position: 'fixed',
    top: '16px',
    right: '20px',
    zIndex: '9999',
    padding: '0.5rem',
    borderRadius: '0.5rem',
  });
  document.body.appendChild(button);
  console.log('[Chat Exporter] Export button injected (fallback position)');
}

async function exportConversation(platform: any) {
  const button = document.getElementById('chat-exporter-btn');
  if (!button) return;

  // Set loading state
  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
      </path>
    </svg>
    <span style="margin-left: 0.5rem;">Exporting...</span>
  `;
  button.style.opacity = '0.7';
  button.style.pointerEvents = 'none';

  try {
    // Scrape conversation using platform adapter
    const conversation = platform.scrape(document);
    if (!conversation) {
      alert('No conversation found. Please open a chat thread first.');
      return;
    }

    if (conversation.messages.length === 0) {
      alert('Conversation is empty. Start chatting first!');
      return;
    }

    // Export using registered exporter (default: markdown)
    const exporter = registry.getExporter('markdown');
    if (!exporter) {
      alert('Markdown exporter not found.');
      return;
    }

    const content = exporter.export(conversation);
    downloadFile(content, conversation.title || 'chat-export', exporter.extension);

    // Success feedback
    button.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
        <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span style="margin-left: 0.5rem;">Exported!</span>
    `;
    setTimeout(() => {
      button.innerHTML = originalHTML;
    }, 2000);

    console.log('[Chat Exporter] Conversation exported successfully');
  } catch (error) {
    console.error('[Chat Exporter] Export failed:', error);
    button.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span style="margin-left: 0.5rem;">Failed</span>
    `;
    setTimeout(() => {
      button.innerHTML = originalHTML;
    }, 2000);
    alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    button.style.opacity = '1';
    button.style.pointerEvents = 'auto';
  }
}

function downloadFile(content: string, filename: string, extension: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${sanitizeFilename(filename)}.${extension}`;
  link.click();

  // Revoke after browser has started download
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Sanitize filename while preserving readability
 * Keeps unicode chars, removes only filesystem-unsafe chars
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove filesystem-unsafe chars only
    .replace(/\s+/g, '-') // Spaces to dashes
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 200) // Reasonable length limit
    .trim();
}
