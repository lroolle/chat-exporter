import { getSettings, saveSettings, type ExportSettings } from '../../src/core/settings';

type BooleanSettingKey = 'includeThinking' | 'includeMetadata' | 'includeTimestamps';
const SETTING_KEYS: BooleanSettingKey[] = ['includeThinking', 'includeMetadata', 'includeTimestamps'];

async function init() {
  const settings = await getSettings();

  for (const key of SETTING_KEYS) {
    const checkbox = document.getElementById(key) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = settings[key];
      checkbox.addEventListener('change', () => handleChange(key, checkbox.checked));
    }
  }
}

async function handleChange(key: BooleanSettingKey, value: boolean) {
  await saveSettings({ [key]: value });
  showStatus();
}

function showStatus() {
  const status = document.getElementById('status');
  if (status) {
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 1500);
  }
}

init();
