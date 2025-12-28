/**
 * Content Script - Runs on YouTube pages to extract transcripts and inject summarizer UI
 */

// State
let isLoading = false;

/**
 * Extract video ID from current URL
 * @returns {string|null} Video ID or null if not found
 */
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("v");
}

/**
 * Get transcript from YouTube's internal API
 * @returns {Promise<string>} Transcript text
 */
async function getTranscript() {
  const videoId = getVideoId();
  if (!videoId) {
    console.error("[YouTube Summarizer] No video ID found in URL");
    throw new Error(window.I18n.t("noVideoId") || "No video ID found in URL");
  }

  console.log(
    `[YouTube Summarizer] Starting transcript extraction for video: ${videoId}`
  );
  const captionTracks = await getCaptionTracks(videoId);

  if (!captionTracks || captionTracks.length === 0) {
    console.error("[YouTube Summarizer] No caption tracks found");
    throw new Error(
      window.I18n.t("noCaptions") || "No captions available for this video"
    );
  }

  console.log(
    `[YouTube Summarizer] Found ${captionTracks.length} caption tracks`
  );
  const preferredTrack = findPreferredTrack(captionTracks);

  if (!preferredTrack) {
    console.error(
      "[YouTube Summarizer] No suitable caption track found among available tracks"
    );
    throw new Error(
      window.I18n.t("noSuitableCaptions") || "No suitable caption track found"
    );
  }

  console.log(
    `[YouTube Summarizer] Selected track: ${preferredTrack.languageCode} (${
      preferredTrack.kind || "manual"
    })`
  );
  const transcriptText = await fetchTranscript(preferredTrack.baseUrl);

  if (!transcriptText) {
    console.error(
      "[YouTube Summarizer] Transcript text is empty after fetching"
    );
  } else {
    console.log(
      `[YouTube Summarizer] Successfully fetched transcript, length: ${transcriptText.length} characters`
    );
  }

  return transcriptText;
}

/**
 * Get caption tracks from YouTube's player response
 */
async function getCaptionTracks(videoId) {
  let playerResponse = null;

  // 1. Try to get data from Main World via Background Script (Recommended fix for 429)
  try {
    console.log(
      "[YouTube Summarizer] Attempting to extract playerResponse from Main World..."
    );
    const response = await chrome.runtime.sendMessage({
      action: "EXTRACT_YOUTUBE_DATA",
    });
    if (response && response.success && response.data) {
      playerResponse = response.data;
      console.log(
        "[YouTube Summarizer] Successfully extracted playerResponse from Main World"
      );
    } else {
      console.warn(
        "[YouTube Summarizer] Main World extraction returned no data or failed:",
        response?.error
      );
    }
  } catch (error) {
    console.error(
      "[YouTube Summarizer] Error during Main World extraction:",
      error
    );
  }

  // 2. Fallback: Search scripts in current world
  if (!playerResponse) {
    console.log(
      "[YouTube Summarizer] Falling back to searching scripts in Isolated World..."
    );
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      if (script.textContent.includes("var ytInitialPlayerResponse =")) {
        playerResponse = extractJsonFromScript(script.textContent);
        if (playerResponse) {
          console.log(
            "[YouTube Summarizer] Found playerResponse in page scripts"
          );
          break;
        }
      }
    }
  }

  if (
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  ) {
    return playerResponse.captions.playerCaptionsTracklistRenderer
      .captionTracks;
  }

  console.warn(
    "[YouTube Summarizer] playerResponse does not contain captionTracks"
  );
  return [];
}

/**
 * Extract JSON from script content
 */
function extractJsonFromScript(text) {
  try {
    const startPattern = "var ytInitialPlayerResponse = ";
    const startIndex = text.indexOf(startPattern);

    if (startIndex === -1) return null;

    let currIndex = startIndex + startPattern.length;
    let openBrackets = 0;
    let jsonString = "";

    if (text[currIndex] !== "{") return null;

    for (let i = currIndex; i < text.length; i++) {
      const char = text[i];
      jsonString += char;

      if (char === "{") {
        openBrackets++;
      } else if (char === "}") {
        openBrackets--;
      }

      if (openBrackets === 0) {
        break;
      }
    }

    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Error parsing JSON:", e);
    return null;
  }
}

/**
 * Find the best caption track
 */
function findPreferredTrack(tracks) {
  const priorities = [
    (track) => track.languageCode === "en" && !track.kind,
    (track) => track.languageCode === "vi" && !track.kind,
    (track) => track.languageCode === "en" && track.kind === "asr",
    (track) => track.languageCode === "vi" && track.kind === "asr",
    (track) => !track.kind,
    (track) => track.kind === "asr",
  ];

  for (const check of priorities) {
    const found = tracks.find(check);
    if (found) return found;
  }

  return tracks[0] || null;
}

/**
 * Fetch and parse transcript
 */
async function fetchTranscript(baseUrl) {
  const url = baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}&fmt=srv3`;

  console.log(`[YouTube Summarizer] Fetching transcript XML from: ${url}`);

  try {
    const response = await chrome.runtime.sendMessage({
      action: "FETCH_TRANSCRIPT",
      url: url,
    });

    if (response && response.success && response.xml) {
      console.log(
        "[YouTube Summarizer] Successfully received transcript XML from Main World fetch"
      );
      return parseTranscriptXml(response.xml);
    } else {
      const errorMsg =
        response?.error || "Failed to fetch transcript via Main World";
      console.error(
        "[YouTube Summarizer] Main World transcript fetch failed:",
        errorMsg
      );
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error(
      "[YouTube Summarizer] Error during Main World transcript fetch:",
      error
    );

    // Last resort: Try local fetch if background fails (might hit 429 again)
    console.log(
      "[YouTube Summarizer] Attempting local fetch as last resort..."
    );
    const localResponse = await fetch(url, { credentials: "include" });
    if (!localResponse.ok) {
      throw new Error(`Failed to fetch transcript: ${localResponse.status}`);
    }
    const xml = await localResponse.text();
    return parseTranscriptXml(xml);
  }
}

/**
 * Parse XML to text
 */
function parseTranscriptXml(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  let textElements = doc.querySelectorAll("text");
  if (textElements.length === 0) {
    textElements = doc.querySelectorAll("p");
  }

  const texts = [];
  textElements.forEach((el) => {
    let text = el.textContent || "";
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, " ")
      .trim();
    if (text) {
      texts.push(text);
    }
  });

  return texts.join(" ");
}

// UI Injection Logic

/**
 * Create and inject the summary box into the YouTube sidebar
 */
async function createSidebarUI() {
  if (document.getElementById("my-ai-summary-box")) return;

  const container = document.createElement("div");
  container.id = "my-ai-summary-box";
  container.innerHTML = `
    <div class="my-ai-header">
      <div class="my-ai-header-left">
        <h3>✨ ${window.I18n.t("title") || "AI Summary"}</h3>
        <div class="my-ai-prompt-container">
          <select id="my-ai-connection-select"></select>
          <select id="my-ai-prompt-select"></select>
        </div>
      </div>
      <button id="my-ai-settings-btn" title="${
        window.I18n.t("settings") || "Settings"
      }">⚙️</button>
    </div>
    <div id="ai-status">${
      window.I18n.t("readyStatus") || "Ready to summarize this video."
    }</div>
    
    <div class="my-ai-manual-input-container">
      <textarea id="my-ai-manual-transcript" placeholder="${
        window.I18n.t("manualTranscriptPlaceholder") ||
        "Paste transcript manually if automatic extraction fails..."
      }" rows="3"></textarea>
    </div>

    <button id="my-ai-btn">${
      window.I18n.t("summarizeBtn") || "Summarize Now"
    }</button>
    <div id="my-ai-result-container" class="hidden">
      <div class="my-ai-result-header">
        <span>${window.I18n.t("summary") || "Summary"}</span>
        <button id="my-ai-copy-btn">${
          window.I18n.t("copyToClipboard") || "Copy"
        }</button>
      </div>
      <div id="my-ai-result"></div>
    </div>
  `;

  // YouTube's right column
  const secondaryColumn = document.querySelector("#secondary");
  const relatedDiv = document.querySelector("#related");

  const target = secondaryColumn || relatedDiv;

  if (target) {
    target.insertBefore(container, target.firstChild);

    // Load prompts and connections
    const settings = await window.StorageService.getSettings();

    const connectionSelect = document.getElementById("my-ai-connection-select");
    if (connectionSelect) {
      settings.connections.forEach((conn) => {
        const option = document.createElement("option");
        option.value = conn.id;
        option.textContent = conn.name;
        option.title = conn.name;
        option.selected = conn.id === settings.activeConnectionId;
        connectionSelect.appendChild(option);
      });

      connectionSelect.addEventListener("change", async (e) => {
        await window.StorageService.saveSetting(
          "activeConnectionId",
          e.target.value
        );
      });
    }

    const promptSelect = document.getElementById("my-ai-prompt-select");
    if (promptSelect) {
      settings.prompts.forEach((prompt) => {
        const option = document.createElement("option");
        option.value = prompt.id;
        option.textContent = prompt.name;
        option.title = prompt.name;
        option.selected = prompt.id === settings.activePromptId;
        promptSelect.appendChild(option);
      });

      promptSelect.addEventListener("change", async (e) => {
        await window.StorageService.saveSetting(
          "activePromptId",
          e.target.value
        );
      });
    }

    document
      .getElementById("my-ai-btn")
      .addEventListener("click", handleSummarizeClick);
    document
      .getElementById("my-ai-settings-btn")
      .addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "openOptions" });
      });
    document
      .getElementById("my-ai-copy-btn")
      .addEventListener("click", handleCopyClick);
  }
}

/**
 * Handle copy button click
 */
async function handleCopyClick() {
  const resultDiv = document.getElementById("my-ai-result");
  if (!resultDiv) return;

  const text = resultDiv.dataset.raw || resultDiv.innerText;
  try {
    await navigator.clipboard.writeText(text);
    const copyBtn = document.getElementById("my-ai-copy-btn");
    const originalText = copyBtn.innerText;
    copyBtn.innerText = window.I18n.t("copied") || "Copied!";
    setTimeout(() => {
      copyBtn.innerText = originalText;
    }, 1500);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

/**
 * Handle summarize button click
 */
async function handleSummarizeClick() {
  if (isLoading) return;

  const btn = document.getElementById("my-ai-btn");
  const status = document.getElementById("ai-status");
  const summaryEl = document.getElementById("my-ai-result");
  const containerEl = document.getElementById("my-ai-result-container");

  try {
    // Get config
    const config = await window.StorageService.getProviderConfig();
    if (!config.apiKey) {
      status.innerText =
        window.I18n.t("noApiKey") ||
        "Please set an API key in the extension settings.";
      return;
    }

    setLoadingState(true);
    if (summaryEl) summaryEl.innerText = "";
    if (containerEl) containerEl.classList.add("hidden");

    // Priority: Manual Input > Auto extraction
    const manualTranscript = document
      .getElementById("my-ai-manual-transcript")
      ?.value.trim();
    let transcript = "";

    if (manualTranscript) {
      transcript = manualTranscript;
      status.innerText =
        window.I18n.t("usingManual") || "Using manual transcript...";
    } else {
      status.innerText =
        window.I18n.t("extracting") || "Extracting transcript...";
      transcript = await getTranscript();
    }

    status.innerText = window.I18n.t("loading") || "Summarizing with AI...";

    const settings = await window.StorageService.getSettings();
    const activePromptId =
      document.getElementById("my-ai-prompt-select")?.value ||
      settings.activePromptId;
    const activePrompt =
      settings.prompts.find((p) => p.id === activePromptId) ||
      settings.prompts[0];
    const systemPrompt =
      activePrompt?.content || window.I18n.t("defaultPrompt");

    let fullSummary = "";
    const summary = await window.ApiService.summarize(
      config.provider,
      config.apiKey,
      config.baseUrl,
      config.model,
      transcript,
      systemPrompt,
      (chunk) => {
        const currentSummaryEl = document.getElementById("my-ai-result");
        const currentContainerEl = document.getElementById(
          "my-ai-result-container"
        );

        if (fullSummary === "") {
          if (currentContainerEl) currentContainerEl.classList.remove("hidden");
          status.innerText =
            window.I18n.t("streaming") || "Generating summary...";
        }
        fullSummary += chunk;

        if (currentSummaryEl) {
          currentSummaryEl.innerHTML = marked.parse(fullSummary);
          currentSummaryEl.dataset.raw = fullSummary;
          // Auto-scroll to bottom as content grows
          currentSummaryEl.scrollTop = currentSummaryEl.scrollHeight;
        }
      }
    );

    status.innerText = window.I18n.t("complete") || "Done!";
    if (summaryEl) {
      summaryEl.innerHTML = marked.parse(summary);
      summaryEl.dataset.raw = summary;
    }
    if (containerEl) containerEl.classList.remove("hidden");
  } catch (err) {
    console.error("Summarization error:", err);
    status.innerText = (window.I18n.t("error") || "Error: ") + err.message;
  } finally {
    setLoadingState(false);
  }
}

/**
 * Update UI loading state
 */
function setLoadingState(loading) {
  isLoading = loading;
  const btn = document.getElementById("my-ai-btn");
  if (btn) {
    btn.disabled = loading;
    btn.innerText = loading
      ? window.I18n.t("thinking") || "Thinking..."
      : window.I18n.t("summarizeAgain") || "Summarize Again";
  }
}

/**
 * Initialize the script
 */
async function init() {
  // Load translations
  await window.I18n.initI18n();

  // Initial UI injection
  setTimeout(createSidebarUI, 2000);

  // Watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes("youtube.com/watch")) {
        setTimeout(() => {
          const resultDiv = document.getElementById("my-ai-result");
          const resultContainer = document.getElementById(
            "my-ai-result-container"
          );
          const status = document.getElementById("ai-status");
          const manualTranscript = document.getElementById(
            "my-ai-manual-transcript"
          );
          if (resultDiv) resultDiv.innerText = "";
          if (resultContainer) resultContainer.classList.add("hidden");
          if (status)
            status.innerText =
              window.I18n.t("readyStatus") || "Ready to summarize this video.";
          if (manualTranscript) manualTranscript.value = "";
          createSidebarUI();
        }, 2000);
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // Listen for storage changes to keep UI in sync
  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === "sync") {
      const promptSelect = document.getElementById("my-ai-prompt-select");
      const connectionSelect = document.getElementById(
        "my-ai-connection-select"
      );

      if (
        (promptSelect || connectionSelect) &&
        (changes.prompts ||
          changes.activePromptId ||
          changes.connections ||
          changes.activeConnectionId)
      ) {
        const settings = await window.StorageService.getSettings();

        if (promptSelect) {
          promptSelect.innerHTML = "";
          settings.prompts.forEach((prompt) => {
            const option = document.createElement("option");
            option.value = prompt.id;
            option.textContent = prompt.name;
            option.title = prompt.name;
            option.selected = prompt.id === settings.activePromptId;
            promptSelect.appendChild(option);
          });
        }

        if (connectionSelect) {
          connectionSelect.innerHTML = "";
          settings.connections.forEach((conn) => {
            const option = document.createElement("option");
            option.value = conn.id;
            option.textContent = conn.name;
            option.title = conn.name;
            option.selected = conn.id === settings.activeConnectionId;
            connectionSelect.appendChild(option);
          });
        }
      }
    }
  });
}

// Start
init();
