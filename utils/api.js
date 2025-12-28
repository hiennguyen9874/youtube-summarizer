/**
 * API Service - Unified client for OpenAI and Gemini APIs
 */

/**
 * Summarize text using the configured AI provider
 * @param {string} provider - 'openai' or 'gemini'
 * @param {string} apiKey - API key for the provider
 * @param {string} baseUrl - Base URL for the API
 * @param {string} model - Model name to use
 * @param {string} transcript - Text to summarize
 * @param {string} systemPrompt - System prompt for the AI
 * @param {Function} onChunk - Callback for streaming chunks (optional)
 * @returns {Promise<string>} Summary text (full text when done)
 */
async function summarize(
  provider,
  apiKey,
  baseUrl,
  model,
  transcript,
  systemPrompt,
  onChunk
) {
  // If we're in the background script (service worker), perform the actual fetch
  // In Manifest V3 service worker, 'window' is undefined
  if (typeof window === "undefined") {
    if (provider === "openai") {
      return callOpenAI(
        apiKey,
        baseUrl,
        model,
        transcript,
        systemPrompt,
        onChunk
      );
    } else if (provider === "gemini") {
      return callGemini(
        apiKey,
        baseUrl,
        model,
        transcript,
        systemPrompt,
        onChunk
      );
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }
  } else {
    // If we're in a content script or popup, proxy the request to the background script
    // to avoid Mixed Content issues and CORS restrictions for local API calls
    if (onChunk) {
      // For streaming, use chrome.runtime.connect
      return new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: "summarize-stream" });
        let fullText = "";

        port.postMessage({
          action: "summarize",
          data: { provider, apiKey, baseUrl, model, transcript, systemPrompt },
        });

        port.onMessage.addListener((response) => {
          if (response.success) {
            if (response.done) {
              resolve(fullText);
              port.disconnect();
            } else if (response.chunk) {
              fullText += response.chunk;
              onChunk(response.chunk);
            }
          } else {
            reject(new Error(response.error || "Streaming failed"));
            port.disconnect();
          }
        });

        port.onDisconnect.addListener(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          }
        });
      });
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "summarize",
          data: { provider, apiKey, baseUrl, model, transcript, systemPrompt },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            resolve(response.summary);
          } else {
            reject(
              new Error(
                response?.error ||
                  "Failed to get summary from background script"
              )
            );
          }
        }
      );
    });
  }
}

/**
 * Call OpenAI Chat Completions API
 * @param {string} apiKey - OpenAI API key
 * @param {string} baseUrl - Base URL (default: https://api.openai.com/v1)
 * @param {string} model - Model name (default: gpt-4o-mini)
 * @param {string} transcript - Text to summarize
 * @param {string} systemPrompt - System prompt
 * @param {Function} onChunk - Callback for streaming chunks
 * @returns {Promise<string>} Summary text
 */
async function callOpenAI(
  apiKey,
  baseUrl,
  model,
  transcript,
  systemPrompt,
  onChunk
) {
  // Ensure baseUrl doesn't have trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${cleanBaseUrl}/chat/completions`;

  // Truncate transcript if too long (roughly 15000 chars ~ 4000 tokens)
  const truncatedTranscript =
    transcript.length > 15000
      ? transcript.substring(0, 15000) + "...[truncated]"
      : transcript;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Please summarize the following YouTube video transcript:\n\n${truncatedTranscript}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `OpenAI API error: ${response.status}`
    );
  }

  if (onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Last line might be partial, keep it in buffer
      buffer = lines.pop();

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (trimmedLine.startsWith("data: ")) {
          const dataStr = trimmedLine.substring(6).trim();
          if (dataStr === "[DONE]") break;

          try {
            const data = JSON.parse(dataStr);
            const content = data.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch (e) {
            // Ignore parse errors for partial lines
          }
        }
      }
    }
    return fullContent;
  } else {
    const data = await response.json();
    return data.choices[0]?.message?.content || "No summary generated.";
  }
}

/**
 * Call Google Gemini API
 * @param {string} apiKey - Gemini API key
 * @param {string} baseUrl - Base URL (default: https://generativelanguage.googleapis.com)
 * @param {string} model - Model name (default: gemini-2.0-flash)
 * @param {string} transcript - Text to summarize
 * @param {string} systemPrompt - System prompt
 * @param {Function} onChunk - Callback for streaming chunks
 * @returns {Promise<string>} Summary text
 */
async function callGemini(
  apiKey,
  baseUrl,
  model,
  transcript,
  systemPrompt,
  onChunk
) {
  // Ensure baseUrl doesn't have trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const modelName = model || "gemini-2.0-flash";
  const method = onChunk ? "streamGenerateContent" : "generateContent";
  const url = `${cleanBaseUrl}/v1beta/models/${modelName}:${method}?key=${apiKey}`;

  // Truncate transcript if too long
  const truncatedTranscript =
    transcript.length > 30000
      ? transcript.substring(0, 30000) + "...[truncated]"
      : transcript;

  // Combine system prompt and user content for Gemini
  const fullPrompt = `${systemPrompt}\n\nPlease summarize the following YouTube video transcript:\n\n${truncatedTranscript}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: fullPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
    }),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Gemini API error: ${response.status}`
    );
  }

  if (onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini returns chunks as JSON objects in an array
      // For streamGenerateContent, it's delivered as a series of JSON objects,
      // potentially wrapped in [ ] and separated by commas.

      // Remove potential array start/separators to help parsing
      let sanitizedBuffer = buffer.trim();
      if (sanitizedBuffer.startsWith("[")) {
        sanitizedBuffer = sanitizedBuffer.substring(1).trim();
        buffer = buffer.substring(buffer.indexOf("[") + 1);
      }
      if (sanitizedBuffer.startsWith(",")) {
        sanitizedBuffer = sanitizedBuffer.substring(1).trim();
        buffer = buffer.substring(buffer.indexOf(",") + 1);
      }

      let braceCount = 0;
      let startIndex = -1;
      let foundCompleteObject = false;

      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === "{") {
          if (braceCount === 0) startIndex = i;
          braceCount++;
        } else if (buffer[i] === "}") {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            const jsonStr = buffer.substring(startIndex, i + 1);
            try {
              const data = JSON.parse(jsonStr);
              // Handle potential array of candidates (Gemini format)
              const content =
                data.candidates?.[0]?.content?.parts?.[0]?.text ||
                data.content?.parts?.[0]?.text ||
                "";
              if (content) {
                fullContent += content;
                onChunk(content);
              }
              foundCompleteObject = true;
            } catch (e) {
              console.error("Gemini stream parse error:", e);
            }
            // Update buffer to remaining text after the object
            buffer = buffer.substring(i + 1);
            // Check for trailing commas or array end
            let remaining = buffer.trim();
            if (remaining.startsWith(",")) {
              buffer = buffer.substring(buffer.indexOf(",") + 1);
            } else if (remaining.startsWith("]")) {
              buffer = buffer.substring(buffer.indexOf("]") + 1);
            }

            i = -1; // Reset loop for new buffer
            braceCount = 0;
            startIndex = -1;
          }
        }
      }
    }
    return fullContent;
  } else {
    const data = await response.json();
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text || "No summary generated."
    );
  }
}

// Export for use in other modules
const ApiService = {
  summarize,
  callOpenAI,
  callGemini,
};

if (typeof window !== "undefined") {
  window.ApiService = ApiService;
} else {
  self.ApiService = ApiService;
}
