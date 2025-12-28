/**
 * Background Service Worker
 * Handles API requests to avoid Mixed Content and CORS issues
 */

importScripts('utils/api.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    const { provider, apiKey, baseUrl, model, transcript, systemPrompt } = request.data;
    
    // Call ApiService.summarize which will perform the actual fetch 
    // because it's running in the background context
    ApiService.summarize(provider, apiKey, baseUrl, model, transcript, systemPrompt)
      .then(summary => {
        sendResponse({ success: true, summary });
      })
      .catch(error => {
        console.error('Background summarization error:', error);
        sendResponse({ success: false, error: error.message });
      });
      
    return true; // Keep message channel open for async response
  }

  if (request.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (request.action === 'EXTRACT_YOUTUBE_DATA') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: () => window.ytInitialPlayerResponse
    }).then(results => {
      sendResponse({ success: true, data: results[0]?.result });
    }).catch(error => {
      console.error('Extraction error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'FETCH_TRANSCRIPT') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        return await response.text();
      },
      args: [request.url]
    }).then(results => {
      sendResponse({ success: true, xml: results[0]?.result });
    }).catch(error => {
      console.error('Main World transcript fetch error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

/**
 * Handle streaming connections
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'summarize-stream') {
    port.onMessage.addListener(async (request) => {
      if (request.action === 'summarize') {
        const { provider, apiKey, baseUrl, model, transcript, systemPrompt } = request.data;
        
        try {
          await ApiService.summarize(
            provider, 
            apiKey, 
            baseUrl, 
            model, 
            transcript, 
            systemPrompt,
            (chunk) => {
              // Send each chunk back to the caller
              port.postMessage({ success: true, chunk, done: false });
            }
          );
          
          // Send final message to indicate completion
          port.postMessage({ success: true, done: true });
        } catch (error) {
          console.error('Background streaming error:', error);
          port.postMessage({ success: false, error: error.message });
        }
      }
    });
  }
});
