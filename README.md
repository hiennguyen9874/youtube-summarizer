# YouTube AI Summarizer - Chrome Extension

A lightweight, powerful Chrome extension that summarizes YouTube videos using state-of-the-art AI models (OpenAI GPT-4o-mini or Google Gemini 2.0 Flash).

## 🚀 Features

- **Integrated Sidebar UI**: Seamlessly injected into the YouTube interface for easy access while watching.
- **Dual AI Providers**: Choose between **OpenAI** (GPT-4o-mini) and **Google Gemini** (Gemini 2.0 Flash).
- **Smart Transcript Extraction**: Automatically detects and extracts the best available transcript (Manual or Auto-generated, EN or VI).
- **Manual Override**: Paste your own transcript if automatic extraction fails or if you have a custom text.
- **Custom System Prompts**: Define exactly how you want your summaries to be formatted and focused.
- **Bilingual Support**: Full interface support for both **English** and **Vietnamese**.
- **Dark Mode Support**: UI automatically adapts to your system theme.
- **Custom API Endpoints**: Supports custom base URLs for OpenAI-compatible APIs (like Azure, local LLMs, or proxies).
- **Copy to Clipboard**: Quick one-click copy for the generated summary.

## 🛠️ Tech Stack

- **Manifest V3**: Built using the latest Chrome Extension standards.
- **Vanilla JavaScript**: No heavy frameworks for maximum performance.
- **Background Service Worker**: Handles API calls to bypass CORS and Mixed Content restrictions.
- **Chrome Storage API**: Persists your settings across sessions.
- **Marked.js**: Renders AI-generated Markdown into beautiful HTML.

## 📦 Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `youtube-summarizer` folder.

## 📖 Usage

1. **Navigate**: Open any YouTube video with captions/subtitles.
2. **Configure**: Click the extension icon in the toolbar, then click the gear icon (⚙️) to open settings.
3. **API Key**: Enter your OpenAI or Gemini API key.
4. **Summarize**:
   - Use the **Popup UI** by clicking the extension icon.
   - Or use the **Sidebar UI** directly on the YouTube page (appears on the right side).
5. **Review**: Wait a few seconds for the AI to process the transcript and display the summary.

## ⚙️ Configuration

### OpenAI
- **API Key**: Get it from [OpenAI Platform](https://platform.openai.com/api-keys).
- **Default Model**: `gpt-4o-mini` (fast and cost-effective).
- **Base URL**: Defaults to `https://api.openai.com/v1`.

### Gemini
- **API Key**: Get it from [Google AI Studio](https://aistudio.google.com/app/apikey).
- **Default Model**: `gemini-2.0-flash`.
- **Base URL**: Defaults to `https://generativelanguage.googleapis.com`.

### System Prompt
You can customize the AI's behavior. Example:
> "Summarize this video into 3 key takeaways with a 'Main Idea' section at the top. Use professional tone."

## 📂 Project Structure

```
youtube-summarizer/
├── manifest.json           # Extension configuration (MV3)
├── background.js           # Service worker for API proxying
├── content/
│   ├── content.js         # Sidebar UI injection & transcript extraction
│   └── sidebar.css        # Styles for the injected UI
├── popup/
│   ├── popup.html         # Main extension UI
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup controller logic
├── utils/
│   ├── api.js             # Unified AI API client
│   ├── storage.js         # Settings management wrapper
│   └── i18n.js            # Internationalization helper
├── locales/
│   └── messages.json      # Translations (EN/VI)
├── vendor/
│   └── marked.min.js      # Markdown parsing library
└── icons/                 # Extension icons
```

## ❓ Troubleshooting

### "No transcript available"
- Ensure the video has captions/subtitles (manual or auto-generated).
- Try refreshing the page.
- If it still fails, you can copy the transcript from YouTube's "Show transcript" menu and paste it into the "Manual Transcript" box in the extension.

### API Error (401/403)
- Verify your API key is active and has enough credits/quota.
- Check if your IP is restricted by the provider (use a proxy Base URL if needed).

### Sidebar not appearing
- The extension works best on standard YouTube watch pages (`youtube.com/watch?v=...`).
- Wait a few seconds for the page to fully load.

## 📄 License

MIT License - feel free to use and modify for your own projects!

