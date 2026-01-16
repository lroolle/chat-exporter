/**
 * Content script - orchestrates platform adapters and exporters
 */

import { registry } from '../src/core/registry';
import { ChatGPTAdapter } from '../src/platforms/chatgpt';
import { GeminiAdapter } from '../src/platforms/gemini';
import { GrokAdapter } from '../src/platforms/grok';
import { MarkdownExporter } from '../src/exporters/markdown';
import { getSettings } from '../src/core/settings';
import type { PlatformAdapter } from '../src/core/types';

// Register platform adapters
registry.registerPlatform(new ChatGPTAdapter());
registry.registerPlatform(new GeminiAdapter());
registry.registerPlatform(new GrokAdapter());

// Register exporters
registry.registerExporter(new MarkdownExporter());

export default defineContentScript({
  matches: [
    'https://chat.openai.com/*',
    'https://chatgpt.com/*',
    'https://gemini.google.com/*',
    'https://grok.com/*',
    'https://x.com/i/grok*',
  ],
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
  const platform = registry.getPlatformFor(window.location.href);
  if (!platform) {
    console.log('[Chat Exporter] Platform not supported');
    return;
  }

  console.log(`[Chat Exporter] Platform detected: ${platform.id}`);

  let injectionObserver: MutationObserver | null = null;
  let reinjectObserver: MutationObserver | null = null;
  let timeoutId: number | null = null;
  let reinjectTimer: number | null = null;

  const isButtonPresent = () => {
    return !!(document.getElementById('chat-exporter-btn') || document.getElementById('chat-exporter-container'));
  };

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (injectionObserver) {
      injectionObserver.disconnect();
      injectionObserver = null;
    }
  };

  const tryInject = () => {
    if (isButtonPresent()) return;

    const injectionPoint = platform.getInjectionPoint(document);
    if (injectionPoint) {
      cleanup();
      console.log(`[Chat Exporter] Injecting button (${platform.id})`);
      injectExportButton(platform);
      startReinjectWatcher();
      return true;
    }
    return false;
  };

  const waitForInjectionPoint = () => {
    // Try immediately first
    if (tryInject()) return;

    // Use MutationObserver instead of polling
    injectionObserver = new MutationObserver(() => {
      tryInject();
    });

    injectionObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout fallback after 10s
    timeoutId = window.setTimeout(() => {
      cleanup();
      console.warn('[Chat Exporter] Injection point not found, using fallback');
      injectExportButton(platform);
      startReinjectWatcher();
    }, 10000);
  };

  const scheduleReinject = () => {
    if (reinjectTimer) return;
    reinjectTimer = window.setTimeout(() => {
      reinjectTimer = null;
      if (!isButtonPresent()) {
        console.log('[Chat Exporter] Button disappeared, re-injecting...');
        tryInject();
      }
    }, 250);
  };

  const startReinjectWatcher = () => {
    if (reinjectObserver) {
      reinjectObserver.disconnect();
    }

    reinjectObserver = new MutationObserver(() => {
      if (!isButtonPresent()) {
        scheduleReinject();
      }
    });

    const targets = [
      document.querySelector('header'),
      document.querySelector('[role="banner"]'),
      document.querySelector('nav'),
      document.querySelector('top-bar-actions'),
      document.body,
    ].filter((el): el is Element => Boolean(el));

    targets.forEach(target => {
      reinjectObserver?.observe(target, {
        childList: true,
        subtree: true,
      });
    });
  };

  // Start injection process
  waitForInjectionPoint();

  // Cleanup on unload
  window.addEventListener('unload', () => {
    cleanup();
    if (reinjectObserver) reinjectObserver.disconnect();
    if (reinjectTimer) clearTimeout(reinjectTimer);
  });
}

function injectExportButton(platform: PlatformAdapter) {
  const button = document.createElement('button');
  button.id = 'chat-exporter-btn';
  button.title = 'Export conversation to Markdown';

  // Platform-specific styling
  if (platform.id === 'gemini') {
    // Match Gemini's mat-icon-button style
    button.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base mat-mdc-tooltip-trigger mat-unthemed';
    button.setAttribute('mat-icon-button', '');
    button.setAttribute('aria-label', 'Export conversation to Markdown');
    Object.assign(button.style, {
      width: '40px',
      height: '40px',
      padding: '8px',
      borderRadius: '50%',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    button.innerHTML = `
      <span class="mat-mdc-button-persistent-ripple mdc-icon-button__ripple"></span>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="color: var(--mat-icon-color, #444746);">
        <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="mat-focus-indicator"></span>
      <span class="mat-mdc-button-touch-target"></span>
    `;
  } else if (platform.id === 'grok') {
    // Grok/X style - matches X's icon button design (same as share/bookmark buttons)
    button.setAttribute('aria-label', 'Export conversation to Markdown');
    Object.assign(button.style, {
      padding: '0',
      width: '34px',
      height: '34px',
      borderRadius: '9999px',
      border: 'none',
      borderColor: 'rgba(0, 0, 0, 0)',
      background: 'transparent',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgb(15, 20, 25)',
      transition: 'background-color 0.2s',
      position: 'relative',
      zIndex: '9999',
    });
    button.innerHTML = `
      <div dir="ltr" style="display: flex; align-items: center; justify-content: center; color: rgb(15, 20, 25);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color: currentColor;">
          <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
    button.onmouseover = () => {
      button.style.backgroundColor = 'rgba(15, 20, 25, 0.1)';
    };
    button.onmouseout = () => {
      button.style.backgroundColor = 'transparent';
    };
  } else {
    // ChatGPT style
    button.className = 'btn relative btn-ghost text-token-text-primary';
    Object.assign(button.style, {
      marginLeft: '0',
      marginRight: '0.25rem',
    });
    button.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle;">
        <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span style="margin-left: 0.5rem;">Export</span>
    `;
  }

  button.onclick = () => exportConversation(platform);

  const injectionPoint = platform.getInjectionPoint(document);

  if (injectionPoint) {
    if (platform.id === 'chatgpt') {
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
    }

    if (platform.id === 'gemini') {
      // Wrap in buttons-container like other Gemini buttons
      const container = document.createElement('div');
      container.className = 'buttons-container';
      container.id = 'chat-exporter-container';
      container.appendChild(button);
      // Insert at the beginning of right-section
      injectionPoint.insertBefore(container, injectionPoint.firstChild);
      console.log('[Chat Exporter] Export button injected into Gemini top-bar');
      return;
    }

    if (platform.id === 'grok') {
      // Insert at the BEGINNING (left side) of the button group, before share button
      injectionPoint.insertBefore(button, injectionPoint.firstChild);
      console.log('[Chat Exporter] Export button injected into Grok header (left of share)');
      return;
    }

    injectionPoint.appendChild(button);
    console.log(`[Chat Exporter] Export button injected into header (${platform.id})`);
    return;
  }

  // Fallback to fixed position
  const fallbackStyles: Record<string, string> = {
    position: 'fixed',
    top: '16px',
    right: '20px',
    zIndex: '9999',
    padding: '8px 16px',
    border: 'none',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };

  if (platform.id === 'gemini') {
    Object.assign(fallbackStyles, {
      borderRadius: '24px',
      background: '#1a73e8',
      color: '#fff',
    });
  } else if (platform.id === 'grok') {
    Object.assign(fallbackStyles, {
      borderRadius: '9999px',
      background: 'rgb(15, 20, 25)',
      color: '#fff',
      zIndex: '99999',
    });
  } else {
    Object.assign(fallbackStyles, {
      borderRadius: '0.5rem',
      background: 'var(--surface-primary, #fff)',
      color: 'inherit',
    });
  }

  Object.assign(button.style, fallbackStyles);
  document.body.appendChild(button);
  console.log('[Chat Exporter] Export button injected (fallback position)');
}

async function exportConversation(platform: PlatformAdapter) {
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
    const conversation = await platform.scrape(document);
    if (!conversation) {
      alert('No conversation found. Please open a chat thread first.');
      return;
    }

    if (conversation.messages.length === 0) {
      alert('Conversation is empty. Start chatting first!');
      return;
    }

    // Load settings and export
    const settings = await getSettings();
    const exporter = registry.getExporter('markdown');
    if (!exporter) {
      alert('Markdown exporter not found.');
      return;
    }

    const content = exporter.export(conversation, {
      includeThinking: settings.includeThinking,
      includeMetadata: settings.includeMetadata,
      includeTimestamps: settings.includeTimestamps,
    });
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
