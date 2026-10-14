# Nodewise — IoT Deployment Advisor PWA

A responsive, installable PWA for an ECE / prompt-engineering project.

## Features
- Android-friendly responsive interface
- Optional project profile passed into the chat as context
- Direct conversational interface to an OpenAI-compatible chat-completions API
- Configurable endpoint, model, and API key
- In-tab chat history and follow-up questions
- PWA manifest and service worker

## Run locally
Run `python -m http.server 8000` from this folder and open `http://localhost:8000`.

## Connect an LLM
Tap **AI settings** in the app and provide an API endpoint, model name, and API key from a provider that supports OpenAI-compatible chat completions and browser CORS. The default endpoint/model are OpenAI's chat-completions endpoint and `gpt-4o-mini`; a valid API key and provider billing/credits are required.

## Security note
This is a static GitHub Pages app. The key is held only in the current page's memory and is not written to local storage, but browser requests still expose it to the browser session and network tooling. Do not use a sensitive or high-limit key. For a public app, put the key in a backend/serverless proxy and have the PWA call that proxy instead.

The LLM's output is advisory. Validate hardware choices, radio coverage, local regulations, power budgets, and safety-critical designs before deployment.
