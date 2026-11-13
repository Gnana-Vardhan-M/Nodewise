# Nodewise — IoT Deployment Advisor PWA (v7)

A responsive, installable PWA for an ECE / prompt-engineering project: a voice-capable chat advisor for planning IoT deployments.

## Features
- Android-friendly responsive interface, installable (manifest + PNG/maskable icons + offline app shell)
- Optional project profile passed to the model as context
- Chat with any OpenAI-compatible chat-completions API, with **streaming replies** (falls back to normal JSON replies automatically)
- Replies rendered as safe, cleaned-up Markdown (nested lists, bold, tables, code, links; stray `**`, LaTeX and half-streamed markers are hidden). The system prompt asks the model for plain, phone-friendly text
- Responsive layout: sidebar on laptops, bottom navigation on tablets/phones, sticky full-height chat on desktop
- **Saved connection**: endpoint, model and API key persist in the browser, so you only enter them once
- Stop button while the model is answering; failed messages are put back in the input box
- Push-to-talk voice input and spoken replies (read sentence-by-sentence as they stream in)

## Run locally
Run `python -m http.server 8000` from this folder and open `http://localhost:8000`.

## Connect an LLM
Tap **AI settings** and enter an endpoint, model name and API key from a provider that supports OpenAI-compatible chat completions and browser CORS. The defaults are OpenAI's endpoint and `gpt-4o-mini`. A base URL ending in `/v1` is completed to `/v1/chat/completions` automatically. Endpoints must be `https://` (plain `http://` is allowed only for localhost).

Some models reject optional parameters (for example `temperature`). Nodewise detects this and retries without them.

## Where the API key is stored
Endpoint, model and key are saved in this browser's **localStorage** (`nodewise.connection.v1`) on this device. They are not encrypted and are sent only to the endpoint you configured. Use **Remove saved key** in AI settings to delete them. Anyone with access to your browser profile can read the key, so use a key with a low spending limit and don't save it on a shared device. For a public app, put the key in a backend/serverless proxy and have the PWA call that proxy instead.

The LLM's output is advisory. Validate hardware choices, radio coverage, local regulations, power budgets, and safety-critical designs before deployment.

## Voice chat
- Push-to-talk uses the browser SpeechRecognition API (Chrome on Android is recommended).
- Tap **Start talking**, speak, then pause or tap **Stop & send**. The recognized text is sent like a typed message.
- Replies are spoken with the browser's SpeechSynthesis API. **Voice replies** toggles speech (the choice is remembered) and **Stop audio** stops playback.
- Microphone access requires HTTPS (or localhost) and browser permission. Voice input may need an internet connection depending on the browser.
- Voice output uses the device's installed voices; it does not make a separate TTS API request.
