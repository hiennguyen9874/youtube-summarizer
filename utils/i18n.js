/**
 * i18n Service - Simple internationalization helper
 * Supports English and Vietnamese
 */

let translations = {};
let currentLanguage = "en";

/**
 * Load translations from messages.json
 * @returns {Promise<void>}
 */
async function loadTranslations() {
  try {
    const response = await fetch(
      chrome.runtime.getURL("locales/messages.json"),
      { credentials: "include" }
    );
    translations = await response.json();
  } catch (error) {
    console.error("Failed to load translations:", error);
    translations = { en: {}, vi: {} };
  }
}

/**
 * Set the current language
 * @param {string} lang - Language code ('en' or 'vi')
 */
function setLanguage(lang) {
  currentLanguage = lang;
}

/**
 * Get current language
 * @returns {string} Current language code
 */
function getLanguage() {
  return currentLanguage;
}

/**
 * Translate a key to the current language
 * @param {string} key - Translation key
 * @param {string} [fallback] - Fallback text if key not found
 * @returns {string|null} Translated text
 */
function t(key, fallback = null) {
  const langTranslations =
    translations[currentLanguage] || translations["en"] || {};
  const value = langTranslations[key];
  if (value !== undefined) return value;
  return fallback;
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    const translated = t(key);

    if (translated) {
      // Handle different element types
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        if (element.placeholder !== undefined) {
          element.placeholder = translated;
        }
      } else {
        element.textContent = translated;
      }
    }
  });

  // Handle data-i18n-placeholder separately
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    const translated = t(key);
    if (translated) {
      element.placeholder = translated;
    }
  });
}

/**
 * Initialize i18n with saved language preference
 * @returns {Promise<void>}
 */
async function initI18n() {
  await loadTranslations();
  const savedLang = await window.StorageService.getLanguage();
  setLanguage(savedLang);
  applyTranslations();
}

// Export for use in other modules
window.I18n = {
  loadTranslations,
  setLanguage,
  getLanguage,
  t,
  applyTranslations,
  initI18n,
};
