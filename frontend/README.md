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

## YouTube Import

`yt-dlp` is required on the backend host. If installed via `pipx`, ensure `~/.local/bin` is on PATH.
Optional auto-upgrade instructions and scripts live in `README.md` at the repo root.
Cron example (daily 03:15, logs to user home):
```
15 3 * * * /home/craig/projects/kjdj/backend/scripts/yt-dlp-upgrade.sh >> /home/craig/yt-dlp-upgrade.log 2>&1
```

## Build

```bash
npm run build
npm run preview
```
