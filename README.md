# Nodewise — IoT Deployment Advisor PWA

A responsive, installable progressive web app demo for an ECE / prompt-engineering class.

## Features
- Responsive dashboard UI for desktop and mobile
- Project profile form: goal, range, power source, data frequency, environment, budget, internet access
- Local rule-based suggestions for connectivity, architecture, sensor strategy, power, risks, and a prototype roadmap
- Generates a reusable prompt-engineering brief for a deeper LLM review
- Copy prompt / copy plan actions
- PWA manifest and service worker for installability and offline app-shell caching
- No login, backend, or API key required

## Run locally
Service workers do not work from `file://`, so run a local HTTP server from this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Install as a PWA
Deploy this folder to any static host that serves HTTPS (for example GitHub Pages, Netlify, or Vercel), open the deployed URL in a supported browser, and choose **Install app** / **Add to Home screen**.

## Important limitation
This classroom demo uses a local rule-based recommendation engine; it does not call an LLM or validate a real site. The generated prompt can be copied into an LLM for a deeper response. Validate radio coverage, local regulations, power budget, and hardware choices before real deployment.
