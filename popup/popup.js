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
    
    // Connection
    connectionSelect: document.getElementById('connectionSelect'),
    addConnectionBtn: document.getElementById('addConnectionBtn'),
    deleteConnectionBtn: document.getElementById('deleteConnectionBtn'),
    connectionName: document.getElementById('connectionName'),
    providerSelect: document.getElementById('providerSelect'),
    providerLabel: document.getElementById('providerLabel'),
    baseUrlLabel: document.getElementById('baseUrlLabel'),
    modelLabel: document.getElementById('modelLabel'),
    apiKey: document.getElementById('apiKey'),
    baseUrl: document.getElementById('baseUrl'),
    model: document.getElementById('model'),
    
    // System Prompt
    promptSelect: document.getElementById('promptSelect'),
    addPromptBtn: document.getElementById('addPromptBtn'),
    deletePromptBtn: document.getElementById('deletePromptBtn'),
    promptName: document.getElementById('promptName'),
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
  
  // Connections
  renderConnectionSelect(settings.connections, settings.activeConnectionId);
  const activeConnection = settings.connections.find(c => c.id === settings.activeConnectionId) || settings.connections[0];
  
  if (activeConnection) {
    elements.connectionName.value = activeConnection.name || '';
    elements.providerSelect.value = activeConnection.provider || 'openai';
    elements.apiKey.value = activeConnection.apiKey || '';
    elements.baseUrl.value = activeConnection.baseUrl || '';
    elements.model.value = activeConnection.model || '';
    
    updateConnectionActions(settings.activeConnectionId);
  }
  
  // Prompts
  renderPromptSelect(settings.prompts, settings.activePromptId);
  const activePrompt = settings.prompts.find(p => p.id === settings.activePromptId) || settings.prompts[0];
  elements.systemPrompt.value = activePrompt?.content || '';
  elements.promptName.value = activePrompt?.name || '';
  elements.promptName.classList.toggle('hidden', settings.activePromptId === 'default');
  updatePromptActions(settings.activePromptId);
  
  // If system prompt is empty, set placeholder with default
  if (!elements.systemPrompt.value) {
    elements.systemPrompt.placeholder = window.I18n.t('defaultPrompt');
  }
}

/**
 * Update connection action buttons state
 */
function updateConnectionActions(activeConnectionId) {
  // Can delete if more than 1 connection
  chrome.storage.sync.get('connections', (result) => {
    const connections = result.connections || window.StorageService.DEFAULT_SETTINGS.connections;
    const canDelete = connections.length > 1;
    elements.deleteConnectionBtn.disabled = !canDelete;
    elements.deleteConnectionBtn.style.opacity = canDelete ? '1' : '0.3';
    elements.deleteConnectionBtn.style.cursor = canDelete ? 'pointer' : 'not-allowed';
  });
}

/**
 * Render connection select options
 */
function renderConnectionSelect(connections, activeConnectionId) {
  elements.connectionSelect.innerHTML = '';
  connections.forEach(conn => {
    const option = document.createElement('option');
    option.value = conn.id;
    option.textContent = conn.name;
    option.selected = conn.id === activeConnectionId;
    elements.connectionSelect.appendChild(option);
  });
}

/**
 * Update prompt action buttons state
 */
function updatePromptActions(activePromptId) {
  const isDefault = activePromptId === 'default';
  elements.deletePromptBtn.disabled = isDefault;
  elements.deletePromptBtn.style.opacity = isDefault ? '0.3' : '1';
  elements.deletePromptBtn.style.cursor = isDefault ? 'not-allowed' : 'pointer';
}

/**
 * Render prompt select options
 */
function renderPromptSelect(prompts, activePromptId) {
  elements.promptSelect.innerHTML = '';
  prompts.forEach(prompt => {
    const option = document.createElement('option');
    option.value = prompt.id;
    option.textContent = prompt.name;
    option.selected = prompt.id === activePromptId;
    elements.promptSelect.appendChild(option);
  });
}

/**
 * Attach all event listeners
 */
function attachEventListeners() {
  // Settings toggle
  elements.settingsToggle.addEventListener('click', toggleSettings);
  
  // Language change
  elements.languageSelect.addEventListener('change', handleLanguageChange);
  
  // Connection management
  elements.connectionSelect.addEventListener('change', handleConnectionSelectChange);
  elements.addConnectionBtn.addEventListener('click', handleAddConnection);
  elements.deleteConnectionBtn.addEventListener('click', handleDeleteConnection);
  
  // Provider change
  elements.providerSelect.addEventListener('change', handleProviderChange);
  
  // Settings inputs (debounced save)
  const saveDebounced = debounce(saveSettings, 500);
  elements.connectionName.addEventListener('input', saveDebounced);
  elements.apiKey.addEventListener('input', saveDebounced);
  elements.baseUrl.addEventListener('input', saveDebounced);
  elements.model.addEventListener('input', saveDebounced);
  
  // Prompts
  elements.promptSelect.addEventListener('change', handlePromptSelectChange);
  elements.addPromptBtn.addEventListener('click', handleAddPrompt);
  elements.deletePromptBtn.addEventListener('click', handleDeletePrompt);
  elements.promptName.addEventListener('input', saveDebounced);
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
  updateProviderSettingsVisibility();
  await saveSettings();
}

/**
 * Update provider settings visibility and labels
 */
function updateProviderSettingsVisibility() {
  const provider = elements.providerSelect.value;
  const isOpenAI = provider === 'openai';
  
  elements.providerLabel.textContent = isOpenAI ? 'OpenAI' : 'Gemini';
  elements.baseUrlLabel.textContent = isOpenAI ? 'OpenAI' : 'Gemini';
  elements.modelLabel.textContent = isOpenAI ? 'OpenAI' : 'Gemini';
  
  if (!elements.baseUrl.value || elements.baseUrl.value === 'https://api.openai.com/v1' || elements.baseUrl.value === 'https://generativelanguage.googleapis.com') {
    elements.baseUrl.placeholder = isOpenAI ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com';
  }
  
  if (!elements.model.value || elements.model.value === 'gpt-4o-mini' || elements.model.value === 'gemini-2.0-flash') {
    elements.model.placeholder = isOpenAI ? 'gpt-4o-mini' : 'gemini-2.0-flash';
  }
}

/**
 * Handle connection selection change
 */
async function handleConnectionSelectChange() {
  const settings = await window.StorageService.getSettings();
  const connectionId = elements.connectionSelect.value;
  const connection = settings.connections.find(c => c.id === connectionId);
  
  if (connection) {
    elements.connectionName.value = connection.name;
    elements.providerSelect.value = connection.provider;
    elements.apiKey.value = connection.apiKey;
    elements.baseUrl.value = connection.baseUrl;
    elements.model.value = connection.model;
    
    await window.StorageService.saveSetting('activeConnectionId', connectionId);
    updateProviderSettingsVisibility();
    updateConnectionActions(connectionId);
  }
}

/**
 * Handle add connection
 */
async function handleAddConnection() {
  const settings = await window.StorageService.getSettings();
  const newId = 'conn_' + Date.now();
  const newConnection = {
    id: newId,
    name: 'New Connection',
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  };
  
  const updatedConnections = [...settings.connections, newConnection];
  await window.StorageService.saveAllSettings({
    connections: updatedConnections,
    activeConnectionId: newId
  });
  
  renderConnectionSelect(updatedConnections, newId);
  elements.connectionName.value = 'New Connection';
  elements.providerSelect.value = 'openai';
  elements.apiKey.value = '';
  elements.baseUrl.value = 'https://api.openai.com/v1';
  elements.model.value = 'gpt-4o-mini';
  
  updateProviderSettingsVisibility();
  updateConnectionActions(newId);
  elements.connectionName.focus();
}

/**
 * Handle delete connection
 */
async function handleDeleteConnection() {
  const connectionId = elements.connectionSelect.value;
  const settings = await window.StorageService.getSettings();
  
  if (settings.connections.length <= 1) return;
  
  const updatedConnections = settings.connections.filter(c => c.id !== connectionId);
  const newActiveId = updatedConnections[0].id;
  
  await window.StorageService.saveAllSettings({
    connections: updatedConnections,
    activeConnectionId: newActiveId
  });
  
  renderConnectionSelect(updatedConnections, newActiveId);
  handleConnectionSelectChange(); // Update form with new active connection
}

/**
 * Handle prompt selection change
 */
async function handlePromptSelectChange() {
  const settings = await window.StorageService.getSettings();
  const promptId = elements.promptSelect.value;
  const prompt = settings.prompts.find(p => p.id === promptId);
  
  if (prompt) {
    elements.systemPrompt.value = prompt.content;
    elements.promptName.value = prompt.name;
    await window.StorageService.saveSetting('activePromptId', promptId);
    
    // Toggle prompt name visibility (only hide if it's the default one)
    elements.promptName.classList.toggle('hidden', promptId === 'default');
    updatePromptActions(promptId);
  }
}

/**
 * Handle add prompt
 */
async function handleAddPrompt() {
  const settings = await window.StorageService.getSettings();
  const newId = 'prompt_' + Date.now();
  const newPrompt = {
    id: newId,
    name: 'New Prompt',
    content: ''
  };
  
  const updatedPrompts = [...settings.prompts, newPrompt];
  await window.StorageService.saveAllSettings({
    prompts: updatedPrompts,
    activePromptId: newId
  });
  
  renderPromptSelect(updatedPrompts, newId);
  elements.systemPrompt.value = '';
  elements.promptName.value = 'New Prompt';
  elements.promptName.classList.remove('hidden');
  updatePromptActions(newId);
  elements.systemPrompt.focus();
}

/**
 * Handle delete prompt
 */
async function handleDeletePrompt() {
  const promptId = elements.promptSelect.value;
  if (promptId === 'default') return; // Cannot delete default prompt
  
  const settings = await window.StorageService.getSettings();
  const updatedPrompts = settings.prompts.filter(p => p.id !== promptId);
  const newActiveId = 'default';
  
  await window.StorageService.saveAllSettings({
    prompts: updatedPrompts,
    activePromptId: newActiveId
  });
  
  renderPromptSelect(updatedPrompts, newActiveId);
  const defaultPrompt = updatedPrompts.find(p => p.id === 'default');
  elements.systemPrompt.value = defaultPrompt.content;
  elements.promptName.value = defaultPrompt.name;
  elements.promptName.classList.add('hidden');
  updatePromptActions(newActiveId);
}

/**
 * Save all settings to storage
 */
async function saveSettings() {
  const settings = await window.StorageService.getSettings();
  const activePromptId = elements.promptSelect.value;
  const activeConnectionId = elements.connectionSelect.value;
  
  const updatedPrompts = settings.prompts.map(p => {
    if (p.id === activePromptId) {
      return {
        ...p,
        name: elements.promptName.value || p.name,
        content: elements.systemPrompt.value
      };
    }
    return p;
  });

  const updatedConnections = settings.connections.map(c => {
    if (c.id === activeConnectionId) {
      return {
        ...c,
        name: elements.connectionName.value || c.name,
        provider: elements.providerSelect.value,
        apiKey: elements.apiKey.value,
        baseUrl: elements.baseUrl.value,
        model: elements.model.value
      };
    }
    return c;
  });

  // Update names in selects if changed
  const selectedPromptOption = elements.promptSelect.options[elements.promptSelect.selectedIndex];
  if (selectedPromptOption) {
    selectedPromptOption.textContent = elements.promptName.value || 'Untitled';
  }
  
  const selectedConnectionOption = elements.connectionSelect.options[elements.connectionSelect.selectedIndex];
  if (selectedConnectionOption) {
    selectedConnectionOption.textContent = elements.connectionName.value || 'Untitled';
  }

  const newSettings = {
    language: elements.languageSelect.value,
    connections: updatedConnections,
    activeConnectionId: activeConnectionId,
    prompts: updatedPrompts,
    activePromptId: activePromptId
  };
  
  await window.StorageService.saveAllSettings(newSettings);
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
  const activePrompt = settings.prompts.find(p => p.id === settings.activePromptId) || settings.prompts[0];
  const systemPrompt = activePrompt?.content || window.I18n.t('defaultPrompt');
  
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
