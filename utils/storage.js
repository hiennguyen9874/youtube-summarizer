/**
 * Storage Service - Wrapper around chrome.storage.sync
 * Provides type-safe access to extension settings
 */

const DEFAULT_SETTINGS = {
  language: 'en',
  provider: 'openai',
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.0-flash'
  },
  systemPrompt: ''
};

/**
 * Get all settings from storage
 * @returns {Promise<object>} Settings object
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve(result);
    });
  });
}

/**
 * Save a single setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @returns {Promise<void>}
 */
async function saveSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [key]: value }, resolve);
  });
}

/**
 * Save multiple settings at once
 * @param {object} settings - Settings object
 * @returns {Promise<void>}
 */
async function saveAllSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}

/**
 * Get current language setting
 * @returns {Promise<string>} Language code ('en' or 'vi')
 */
async function getLanguage() {
  const settings = await getSettings();
  return settings.language || 'en';
}

/**
 * Get current provider config (apiKey and baseUrl)
 * @returns {Promise<{provider: string, apiKey: string, baseUrl: string}>}
 */
async function getProviderConfig() {
  const settings = await getSettings();
  const provider = settings.provider || 'openai';
  const config = settings[provider] || DEFAULT_SETTINGS[provider];
  return {
    provider,
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || DEFAULT_SETTINGS[provider].baseUrl,
    model: config.model || DEFAULT_SETTINGS[provider].model
  };
}

// Export for use in other modules
const StorageService = {
  getSettings,
  saveSetting,
  saveAllSettings,
  getLanguage,
  getProviderConfig,
  DEFAULT_SETTINGS
};

if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
} else {
  self.StorageService = StorageService;
}
