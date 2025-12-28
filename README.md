# KJDJ Karaoke System

This is a karaoke hosting system with a React frontend and Node.js/Express backend.
Hosts control playback; singers join via QR to search and queue only.

## Folder Structure

- **backend/**: Contains the Node.js API server and database connection.
    - `src/server.js`: Main entry point for the API.
    - `src/db.js`: SQLite database connection and initialization.
    - `.env`: Configuration for media paths and server settings.
    - `db/`: Directory for the SQLite database file (`kjdj.db`).
- **frontend/**: Contains the React application (Vite).
    - `src/`: React source code.
- **CDGPlayer/**: Legacy upstream package retained only for historical reference; the live player implementation now lives in `frontend/src/lib/cdg/`.

## Configuration

The backend is configured via `backend/.env`. Required and optional values:

- `KARAOKE_MEDIA_PATH` (required): Root folder containing `.zip` karaoke files.
- `PORT` (optional): Backend port (defaults to `3000`).
- `HOST_INVITE_CODE` (optional): Invite code for HOST/admin registration (defaults to `6969`).
- `JWT_SECRET` (optional): JWT signing secret (defaults to `your-secret-key-change-this-in-prod`).
- `DB_PATH` (optional): Relative path to the SQLite DB (defaults to `./db/kjdj.db`).
- `DOWNLOAD_TOKEN_SECRET` (optional): HMAC secret used for short-lived media download tokens (defaults to `JWT_SECRET`).
- `DOWNLOAD_TOKEN_TTL` (optional): Token lifetime in seconds (defaults to `60`).
- `DOWNLOAD_RATE_LIMIT` (optional): Max library downloads per host per minute (defaults to `30`).

## Running the Project

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Full stack (from repo root)
```bash
npm install
npm run start
```

`npm run start` uses `concurrently`. If it's not on your PATH, run the backend and frontend in separate terminals.

The Vite dev server runs on port `5180` and proxies `/api` to `http://localhost:3002`.
If you keep the backend on its default `3000`, update `frontend/vite.config.js` or set `PORT=3002`.

## Singer Join Flow
- Host UI shows an Invite button with QR + Join URL.
- Singer opens `/join/:token`, sets display name once, then queues songs on `/request`.

## Security Notes
- `/api/library/songs/:id/download` is HOST-only. Singer sessions are blocked.
- Singers can search + queue but never receive karaoke file bytes.

## Features

### YouTube Import
Hosts can import karaoke tracks directly from YouTube.
- **Requirement**: `yt-dlp` and `ffmpeg` must be installed on the backend server.
- **Usage**: Paste a YouTube URL in the Host Dashboard to download.
- **Storage**: Files are saved to a `#Youtube Karaoke Downloads` folder in your media library.

### Real-Time Visualizer
The Host UI includes a Web Audio API-based spectrum analyzer in the header that reacts to the currently playing track.

### Pop-out Player & Controls
- **Pop-out Window**: Detach the lyrics/video display to a separate window for external monitors/projectors.
- **Volume Control**: Persistent local volume slider.

## Optional: Auto-upgrade yt-dlp

If you installed `yt-dlp` via `pipx`, you can run a daily upgrade using cron or a systemd timer.
This repo includes a helper script and sample systemd unit files:

- `backend/scripts/yt-dlp-upgrade.sh` (requires `pipx` on PATH)
- `backend/scripts/yt-dlp-upgrade.service`
- `backend/scripts/yt-dlp-upgrade.timer`

Before enabling, edit the service file to set the correct `User=` and path to the script.

Example systemd setup (run as root):
```bash
sudo cp /home/craig/projects/kjdj/backend/scripts/yt-dlp-upgrade.service /etc/systemd/system/
sudo cp /home/craig/projects/kjdj/backend/scripts/yt-dlp-upgrade.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now yt-dlp-upgrade.timer
```

Cron alternative (runs daily at 3:15 AM):
```bash
15 3 * * * /home/craig/projects/kjdj/backend/scripts/yt-dlp-upgrade.sh >> /var/log/yt-dlp-upgrade.log 2>&1
```

Example for this machine (installed in `craig` crontab):
```bash
15 3 * * * /home/craig/projects/kjdj/backend/scripts/yt-dlp-upgrade.sh >> /home/craig/yt-dlp-upgrade.log 2>&1
```

## Deployment Notes & Known Fixes

- **Backend systemd restarts:** use `backend/scripts/start-backend.sh` as the systemd `ExecStart`. The helper reads `backend/.env` to find `PORT`, kills any stale `node src/server.js` still bound there, and then runs `npm start`. Without it, `kjdj-backend.service` would occasionally fail with `EADDRINUSE` after a crash or manual kill. Example unit snippet:
  ```ini
  ExecStart=/home/craig/projects/kjdj/backend/scripts/start-backend.sh
  Restart=on-failure
  RestartSec=5
  ```
  Remember to copy the updated unit to `/etc/systemd/system`, run `sudo systemctl daemon-reload`, and restart the service after any changes.
- **Deck pop-out + CDG:** the React deck used to reload CDG ZIPs whenever the pop-out window toggled, causing songs to restart. The loader effect no longer depends on transient canvas mounts, so CDG playback now behaves like MP4 when docking/undocking the deck.
- **Volume slider regression:** the slider previously only updated component state; volume changes now apply to both `<audio>` and `<video>` elements immediately and persist via `localStorage`.
- **Media download hardening:** `/api/library/songs/:id/authorize` now issues short-lived signed tokens that must accompany `/download` requests, downloads are rate-limited per host, and responses set `Cache-Control: no-store`. If a host reports 403/429 errors while loading tracks, check these guards and adjust `DOWNLOAD_TOKEN_TTL` / `DOWNLOAD_RATE_LIMIT` as needed.
- **Visualizer silent for MP4 deck:** the analyser now rebinds when the active media element changes (e.g., pop-out swaps `<video>` tags). If the spectrum analyzer stops updating after toggling the deck, ensure the `initAudioContext` logic in `frontend/src/components/KaraokePlayer.jsx` is intact.
