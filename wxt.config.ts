import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist', // Use conventional 'dist' instead of '.output'
  manifest: {
    name: 'Chat Exporter',
    description: 'Export ChatGPT conversations to Markdown, JSON, HTML, and TXT',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting', 'downloads'],
    host_permissions: ['https://chat.openai.com/*', 'https://chatgpt.com/*'],
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
