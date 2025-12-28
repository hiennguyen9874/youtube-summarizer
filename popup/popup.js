/**
 * Popup Controller - Main logic for the extension popup
 * Handles UI interactions, settings, and summarization flow
 */

// DOM Elements
let elements = {};

// State
let isLoading = false;

/**
 * Initialize the popup
 */
async function init() {
  // Cache DOM elements
  cacheElements();
  
  // Initialize i18n
  await window.I18n.initI18n();
  
  // Load and apply settings
  await loadSettings();
  
  // Attach event listeners
  attachEventListeners();
  
  // Update UI based on current state
  updateProviderSettingsVisibility();
}

/**
 * Cache all DOM elements for quick access
 */
function cacheElements() {
  elements = {
    // Header
    settingsToggle: document.getElementById('settingsToggle'),
    settingsPanel: document.getElementById('settingsPanel'),
    
    // Settings
    languageSelect: document.getElementById('languageSelect'),
    providerSelect: document.getElementById('providerSelect'),
    
    // OpenAI
    openaiSettings: document.getElementById('openaiSettings'),
    openaiApiKey: document.getElementById('openaiApiKey'),
    openaiBaseUrl: document.getElementById('openaiBaseUrl'),
    openaiModel: document.getElementById('openaiModel'),
    
    // Gemini
    geminiSettings: document.getElementById('geminiSettings'),
    geminiApiKey: document.getElementById('geminiApiKey'),
    geminiBaseUrl: document.getElementById('geminiBaseUrl'),
    geminiModel: document.getElementById('geminiModel'),
    
    // System Prompt
    systemPrompt: document.getElementById('systemPrompt'),
    
    // Manual Input
    manualTranscript: document.getElementById('manualTranscript'),
    
    // Actions
    summarizeBtn: document.getElementById('summarizeBtn'),
    copyBtn: document.getElementById('copyBtn'),
    
    // Status & Results
    status: document.getElementById('status'),
    resultSection: document.getElementById('resultSection'),
    resultContent: document.getElementById('resultContent'),
    errorSection: document.getElementById('errorSection')
  };
}

/**
 * Load settings from storage and populate form
 */
async function loadSettings() {
  const settings = await window.StorageService.getSettings();
  
  // Language
  elements.languageSelect.value = settings.language || 'en';
  
  // Provider
  elements.providerSelect.value = settings.provider || 'openai';
  
  // OpenAI
  elements.openaiApiKey.value = settings.openai?.apiKey || '';
  elements.openaiBaseUrl.value = settings.openai?.baseUrl || 'https://api.openai.com/v1';
  elements.openaiModel.value = settings.openai?.model || 'gpt-4o-mini';
  
  // Gemini
  elements.geminiApiKey.value = settings.gemini?.apiKey || '';
  elements.geminiBaseUrl.value = settings.gemini?.baseUrl || 'https://generativelanguage.googleapis.com';
  elements.geminiModel.value = settings.gemini?.model || 'gemini-2.0-flash';
  
  // System Prompt
  elements.systemPrompt.value = settings.systemPrompt || '';
  
  // If system prompt is empty, set placeholder with default
  if (!elements.systemPrompt.value) {
    elements.systemPrompt.placeholder = window.I18n.t('defaultPrompt');
  }
}

/**
 * Attach all event listeners
 */
function attachEventListeners() {
  // Settings toggle
  elements.settingsToggle.addEventListener('click', toggleSettings);
  
  // Language change
  elements.languageSelect.addEventListener('change', handleLanguageChange);
  
  // Provider change
  elements.providerSelect.addEventListener('change', handleProviderChange);
  
  // Settings inputs (debounced save)
  const saveDebounced = debounce(saveSettings, 500);
  elements.openaiApiKey.addEventListener('input', saveDebounced);
  elements.openaiBaseUrl.addEventListener('input', saveDebounced);
  elements.openaiModel.addEventListener('input', saveDebounced);
  elements.geminiApiKey.addEventListener('input', saveDebounced);
  elements.geminiBaseUrl.addEventListener('input', saveDebounced);
  elements.geminiModel.addEventListener('input', saveDebounced);
  elements.systemPrompt.addEventListener('input', saveDebounced);
  
  // Summarize button
  elements.summarizeBtn.addEventListener('click', handleSummarize);
  
  // Copy button
  elements.copyBtn.addEventListener('click', handleCopy);
}

/**
 * Toggle settings panel visibility
 */
function toggleSettings() {
  const isHidden = elements.settingsPanel.classList.contains('hidden');
  elements.settingsPanel.classList.toggle('hidden', !isHidden);
  elements.settingsToggle.classList.toggle('active', isHidden);
}

/**
 * Handle language change
 */
async function handleLanguageChange() {
  const lang = elements.languageSelect.value;
  window.I18n.setLanguage(lang);
  window.I18n.applyTranslations();
  await window.StorageService.saveSetting('language', lang);
  
  // Update system prompt placeholder
  if (!elements.systemPrompt.value) {
    elements.systemPrompt.placeholder = window.I18n.t('defaultPrompt');
  }
}

/**
 * Handle provider change
 */
async function handleProviderChange() {
  const provider = elements.providerSelect.value;
  await window.StorageService.saveSetting('provider', provider);
  updateProviderSettingsVisibility();
}

/**
 * Update provider settings visibility based on selected provider
 */
function updateProviderSettingsVisibility() {
  const provider = elements.providerSelect.value;
  elements.openaiSettings.classList.toggle('hidden', provider !== 'openai');
  elements.geminiSettings.classList.toggle('hidden', provider !== 'gemini');
}

/**
 * Save all settings to storage
 */
async function saveSettings() {
  const settings = {
    language: elements.languageSelect.value,
    provider: elements.providerSelect.value,
    openai: {
      apiKey: elements.openaiApiKey.value,
      baseUrl: elements.openaiBaseUrl.value || 'https://api.openai.com/v1',
      model: elements.openaiModel.value || 'gpt-4o-mini'
    },
    gemini: {
      apiKey: elements.geminiApiKey.value,
      baseUrl: elements.geminiBaseUrl.value || 'https://generativelanguage.googleapis.com',
      model: elements.geminiModel.value || 'gemini-2.0-flash'
    },
    systemPrompt: elements.systemPrompt.value
  };
  
  await window.StorageService.saveAllSettings(settings);
}

/**
 * Handle summarize button click
 */
async function handleSummarize() {
  if (isLoading) return;
  
  // Get current provider config
  const config = await window.StorageService.getProviderConfig();
  
  // Validate API key
  if (!config.apiKey) {
    showError(window.I18n.t('noApiKey'));
    return;
  }
  
  // Get system prompt (use default if empty)
  const settings = await window.StorageService.getSettings();
  const systemPrompt = settings.systemPrompt || window.I18n.t('defaultPrompt');
  
  try {
    setLoading(true);
    showStatus(window.I18n.t('extracting'));
    hideError();
    hideResult();
    
    let transcript = elements.manualTranscript.value.trim();
    
    // If no manual transcript, try to extract from YouTube
    if (!transcript) {
      showStatus(window.I18n.t('extracting'));
      
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a YouTube video page
      if (!tab.url || !tab.url.includes('youtube.com/watch')) {
        throw new Error(window.I18n.t('notYoutube'));
      }
      
      // Request transcript from content script
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscript' });
      
      if (!response || !response.success) {
        throw new Error(response?.error || window.I18n.t('noTranscript'));
      }
      
      transcript = response.transcript;
    }
    
    if (!transcript || transcript.trim().length === 0) {
      throw new Error(window.I18n.t('noTranscript'));
    }
    
    // Call AI API
    showStatus(window.I18n.t('loading'));
    
    let fullSummary = "";
    const summary = await window.ApiService.summarize(
      config.provider,
      config.apiKey,
      config.baseUrl,
      config.model,
      transcript,
      systemPrompt,
      (chunk) => {
        if (fullSummary === "") {
          hideStatus();
          if (elements.resultSection) elements.resultSection.classList.remove('hidden');
        }
        fullSummary += chunk;
        
        if (elements.resultContent) {
          elements.resultContent.innerHTML = marked.parse(fullSummary);
          elements.resultContent.dataset.raw = fullSummary;
          
          // Auto-scroll to bottom
          window.scrollTo(0, document.body.scrollHeight);
        }
      }
    );
    
    // Show final result (might be formatted or just ensured complete)
    showResult(summary);
    
  } catch (error) {
    console.error('Summarization error:', error);
    showError(error.message || 'An unexpected error occurred');
  } finally {
    setLoading(false);
    hideStatus();
  }
}

/**
 * Handle copy button click
 */
async function handleCopy() {
  const text = elements.resultContent.dataset.raw || elements.resultContent.textContent;
  
  try {
    await navigator.clipboard.writeText(text);
    
    // Show feedback
    const originalText = elements.copyBtn.textContent;
    elements.copyBtn.textContent = window.I18n.t('copied');
    
    setTimeout(() => {
      elements.copyBtn.textContent = originalText;
    }, 1500);
  } catch (error) {
    console.error('Copy failed:', error);
  }
}

/**
 * Set loading state
 * @param {boolean} loading - Whether loading
 */
function setLoading(loading) {
  isLoading = loading;
  elements.summarizeBtn.disabled = loading;
}

/**
 * Show status message
 * @param {string} message - Status message
 */
function showStatus(message) {
  elements.status.textContent = message;
  elements.status.classList.remove('hidden');
  elements.status.classList.add('loading');
}

/**
 * Hide status message
 */
function hideStatus() {
  elements.status.classList.add('hidden');
  elements.status.classList.remove('loading');
}

/**
 * Show result
 * @param {string} text - Result text
 */
function showResult(text) {
  elements.resultContent.innerHTML = marked.parse(text);
  elements.resultContent.dataset.raw = text;
  elements.resultSection.classList.remove('hidden');
}

/**
 * Hide result
 */
function hideResult() {
  elements.resultSection.classList.add('hidden');
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  const errorContent = elements.errorSection.querySelector('.error-content');
  errorContent.textContent = message;
  elements.errorSection.classList.remove('hidden');
}

/**
 * Hide error message
 */
function hideError() {
  elements.errorSection.classList.add('hidden');
}

/**
 * Debounce utility function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
