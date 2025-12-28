/**
 * Storage Service - Wrapper around chrome.storage.sync
 * Provides type-safe access to extension settings
 */

const DEFAULT_SETTINGS = {
  language: "en",
  connections: [
    {
      id: "default_openai",
      name: "Default OpenAI",
      provider: "openai",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    {
      id: "default_gemini",
      name: "Default Gemini",
      provider: "gemini",
      apiKey: "",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-2.0-flash",
    },
  ],
  activeConnectionId: "default_openai",
  prompts: [
    {
      id: "default",
      name: "Default",
      content: "",
    },
  ],
  activePromptId: "default",
};

/**
 * Get all settings from storage
 * @returns {Promise<object>} Settings object
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        ...DEFAULT_SETTINGS,
        systemPrompt: undefined,
        openai: undefined,
        gemini: undefined,
        provider: undefined,
      },
      (result) => {
        // Migration: if old systemPrompt exists and new prompts are default/empty
        if (
          result.systemPrompt &&
          result.prompts.length === 1 &&
          result.prompts[0].id === "default" &&
          !result.prompts[0].content
        ) {
          result.prompts[0].content = result.systemPrompt;
        }

        // Migration: if old provider settings exist, migrate them to connections
        if (result.openai || result.gemini) {
          if (!result.connections || result.connections.length <= 2) {
            const connections = [];
            if (result.openai) {
              connections.push({
                id: "migrated_openai",
                name: "My OpenAI",
                provider: "openai",
                apiKey: result.openai.apiKey || "",
                baseUrl: result.openai.baseUrl || "https://api.openai.com/v1",
                model: result.openai.model || "gpt-4o-mini",
              });
            }
            if (result.gemini) {
              connections.push({
                id: "migrated_gemini",
                name: "My Gemini",
                provider: "gemini",
                apiKey: result.gemini.apiKey || "",
                baseUrl:
                  result.gemini.baseUrl ||
                  "https://generativelanguage.googleapis.com",
                model: result.gemini.model || "gemini-2.0-flash",
              });
            }

            if (connections.length > 0) {
              result.connections = connections;
              result.activeConnectionId =
                result.provider === "gemini"
                  ? "migrated_gemini"
                  : "migrated_openai";
            }
          }
        }

        resolve(result);
      }
    );
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
  return settings.language || "en";
}

/**
 * Get current provider config (apiKey and baseUrl)
 * @returns {Promise<{provider: string, apiKey: string, baseUrl: string}>}
 */
async function getProviderConfig() {
  const settings = await getSettings();
  const activeId =
    settings.activeConnectionId || DEFAULT_SETTINGS.activeConnectionId;
  const connection =
    settings.connections.find((c) => c.id === activeId) ||
    settings.connections[0];

  return {
    provider: connection.provider,
    apiKey: connection.apiKey || "",
    baseUrl:
      connection.baseUrl ||
      (connection.provider === "openai"
        ? "https://api.openai.com/v1"
        : "https://generativelanguage.googleapis.com"),
    model:
      connection.model ||
      (connection.provider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash"),
  };
}

// Export for use in other modules
const StorageService = {
  getSettings,
  saveSetting,
  saveAllSettings,
  getLanguage,
  getProviderConfig,
  DEFAULT_SETTINGS,
};

if (typeof window !== "undefined") {
  window.StorageService = StorageService;
} else {
  self.StorageService = StorageService;
}
