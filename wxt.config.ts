import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'Chat Exporter',
    description: 'Export ChatGPT, Gemini, and Grok conversations to Markdown',
    version: '0.3.0',
    permissions: ['activeTab', 'scripting', 'downloads', 'storage'],
    host_permissions: [
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://gemini.google.com/*',
      'https://grok.com/*',
      'https://x.com/*',
    ],
    icons: {
      '16': '/icon16.png',
      '32': '/icon32.png',
      '48': '/icon48.png',
      '128': '/icon128.png',
      '192': '/icon192.png',
      '512': '/icon512.png',
    },
    action: {
      default_icon: {
        '16': '/icon16.png',
        '32': '/icon32.png',
        '48': '/icon48.png',
        '128': '/icon128.png',
      },
    },
  },
});
