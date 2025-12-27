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

## Optional: Auto-upgrade yt-dlp

If you installed `yt-dlp` via `pipx`, you can run a daily upgrade using cron or a systemd timer.
This repo includes a helper script and sample systemd unit files:

- `backend/scripts/yt-dlp-upgrade.sh`
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
