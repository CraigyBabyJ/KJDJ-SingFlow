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

## Troubleshooting

- Blank page after login: clear `localStorage` keys `token` and `user`, then reload.
- Host header visualizer missing: ensure `AudioVisualizer` is imported in `frontend/src/components/HostController.jsx`.
- Visualizer not animating: AudioContext may be suspended until playback; init/resume on play in `frontend/src/components/KaraokePlayer.jsx`.

## Build

```bash
npm run build
npm run preview
```
