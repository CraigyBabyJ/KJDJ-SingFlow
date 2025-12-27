# KJDJ Frontend

React + Vite frontend for the KJDJ Karaoke system. It provides:
- **Host UI:** queue management, rotation, and playback controls.
- **Singer UI:** join flow and song requests.

## Running locally

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on port `5180` and proxies `/api` to `http://localhost:3002`.
If your backend runs on `3000`, update `frontend/vite.config.js` or set `PORT=3002` in `backend/.env`.

## Routes

- `/` host login + host controller view after authentication
- `/join/:token` singer join flow (sets singer session cookie)
- `/request` singer request page

## Build

```bash
npm run build
npm run preview
```
