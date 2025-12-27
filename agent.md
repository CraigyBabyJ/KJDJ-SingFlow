# KJDJ - Project Documentation & Agent Guide

## 1. Project Overview
KJDJ is a web-based Karaoke Jockey system designed to manage karaoke events. It features a dual-role interface:
- **Host (KJ):** Manages the queue, controls playback, and organizes the singer rotation.
- **Singer (QR Join):** Join via host QR, set a display name once, then search + queue only (no playback access).

The system supports CDG+MP3 playback directly in the browser, fair rotation algorithms, and multi-host isolation (allowing multiple KJs to run separate rooms on the same server instance).

## 2. Tech Stack

### Frontend (`/frontend`)
- **Framework:** React 19 + Vite
- **State Management:** Local React State (useState/useReducer)
- **Styling:** Tailwind CSS
- **Key Libraries:**
  - `axios`: API communication
  - `jszip`: Unzipping CDG+MP3 files client-side
  - `@dnd-kit`: Drag-and-drop for queue/singer reordering
  - `qrcode`: Host invite QR generation
  - `tailwindcss`: Utility-first styling

### Backend (`/backend`)
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite3 (`kjdj.db`)
- **Authentication:** JWT (JSON Web Tokens) + bcrypt + singer session cookie
- **Key Libraries:**
  - `sqlite3`: Database driver
  - `dotenv`: Environment configuration

## 3. Project Structure
```
kjdj/
├── backend/
│   ├── src/
│   │   ├── db.js             # Database connection & Schema definitions
│   │   ├── server.js         # Entry point, Express app setup
│   │   ├── routes/           # API Routes (queue, rotation, playback, etc.)
│   │   ├── services/         # Business logic (queueService, rotationService)
│   │   ├── middleware/       # Auth & Role middleware
│   │   └── lib/              # Utilities (CDG parser, file scanner)
│   ├── db/                   # SQLite database location
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/       # React Components (HostController, Player, etc.)
│   │   ├── lib/              # Logic (CDGPlayer canvas renderer)
│   │   ├── App.jsx           # Main layout & Routing logic
│   │   └── main.jsx          # Entry point
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vite.config.js
│
└── agent.md                  # This file
```

## 4. Data Model (Schema)

The database is SQLite. Key tables include:

- **`users`**: `id, username, password_hash, role, invite_token, last_login` (HOST/admin).
- **`songs`**: `id, artist, title, file_path` (Scanned from disk).
- **`singers`**: `id, name, displayName_norm, host_id, in_rotation, rotation_index, active`
  - *Note:* Singers are scoped to a `host_id`. A user can be a singer for multiple hosts.
- **`queue_entries`**: `id, song_id, singer_id, host_id, status, position`
  - *Status:* 'queued', 'playing', 'done', 'skipped'
  - *Isolation:* strictly filtered by `host_id`.
- **`singer_history`**: `id, singer_id, song_id, performed_at` (History log).
- **`favorites`**: `id, user_id, song_id` (Saved songs per user).
- **`settings`**: `id, key, value` (Global feature flags like rotation).

## 5. Core Workflows

### Host Isolation
- Every "Room" is defined by a **Host User**.
- `queue_entries` and `singers` tables have a `host_id` column.
- API endpoints filter all data by `req.user.id` (if Host) or `req.query.hostId` (if Singer).
- This ensures queues never leak between different KJs.

### Rotation Algorithm
1.  **Eligibility:** Singers with `in_rotation = 1` and at least one song in `queue_entries` (status='queued').
2.  **Ordering:** Sorted by `rotation_index` (ASC).
3.  **Selection:** The top singer is picked. Their *earliest* queued song is loaded.
4.  **Completion:** When a song finishes, the singer's `rotation_index` is incremented to move them to the bottom of the rotation.

### Playback System
- **Source:** Backend serves ZIP files containing `.mp3` and `.cdg` to HOST only.
- **Client:**
  1.  Fetches ZIP via `/api/library/songs/:id/download` (HOST-only).
  2.  Unzips in memory using `JSZip`.
  3.  Plays MP3 via HTML5 `<audio>`.
  4.  Parses/Renders CDG commands to `<canvas>` via `CDGPlayer.js`.
  5.  Syncs graphics to audio timestamp.
  6.  Pop-out display syncs state via `postMessage` bursts for resync.

## 6. API Endpoints (Key Routes)

### Auth (`/api/auth`)
- `POST /login`: Returns JWT.
- `POST /register`: Create new Host (invite code required).
- `GET /hosts`: List host users (for join/host selection).
- `GET /me`: Current user.

### Join (`/api/join`)
- `GET /join/:token`: Host display name + active flag.
- `POST /api/join/:token`: Create singer session (display name uniqueness enforced per host).
- `GET /api/join/session`: Current singer session metadata.
- `POST /api/join/end`: End session (clears queued songs + deactivates singer).

### Queue (`/api/queue`)
- `GET /`: List queue (Host-scoped).
- `POST /`: Add song to queue.
- `PATCH /reorder`: Drag-and-drop updates.
- `DELETE /:id`: Remove item.
- `POST /:id/mark-done`: Mark entry done (Host-only).
- `POST /:id/mark-skipped`: Mark entry skipped (Host-only).

### Singers (`/api/singers`)
- `GET /`: List singers (Host-scoped).
- `PATCH /reorder`: Update singer rotation order (Host-only).
- `PATCH /:id`: Toggle `inRotation` (Host-only).
- `DELETE /:id`: Remove singer and history (Host-only).
- `GET /:id/history`: Singer performance history.

### Library (`/api/library`)
- `GET /status`: Scan status and counts (Host/Admin only).
- `GET /search`: Search library (Host or Singer).
- `POST /refresh`: Trigger scan (Host/Admin only).
- `GET /songs/:id/download`: Download ZIP (Host/Admin only).

### Rotation (`/api/rotation`)
- `GET /next`: Get next calculated singer/song.
- `GET /upcoming`: Get next 5 singers.
- `GET /settings`: Get rotation enabled flag.
- `PATCH /settings`: Toggle rotation (Host/Admin only).

### Playback (`/api/playback`)
- `POST /load-next`: Loads the next singer (Host only).

### Admin (`/api/admin`)
- `GET /hosts`: Host list with last login, total songs played, playing status (admin/craig only).
- `DELETE /hosts/:id`: Remove host and related data (admin/craig only).

### Misc
- `GET /api/health`: Backend health check.
- `GET /api/config`: Current backend config (media path).

## 7. Development Guide

### Prerequisites
- Node.js v16+
- NPM
- yt-dlp (for YouTube import)

### Setup
1.  **Backend:**
    ```bash
    cd backend
    npm install
    # Configure .env if needed (default port 3000)
    npm start
    ```
2.  **Frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

Vite proxies `/api` to `http://localhost:3002` in `frontend/vite.config.js`.
If the backend stays on `3000`, update that proxy or set `PORT=3002` in `backend/.env`.

### YouTube Import Notes
- yt-dlp is required for the host-only YouTube import feature.
- If `yt-dlp` is installed via `pipx`, ensure `~/.local/bin` is on the backend PATH or set `YTDLP_BIN=/home/<user>/.local/bin/yt-dlp`.
- Optional binary override: `YTDLP_BIN=/full/path/to/yt-dlp` (must be executable).
- Optional cookies support: set `YTDLP_COOKIES_FILE=/path/to/cookies.txt` to avoid 403s on restricted videos.
- Optional auto-upgrade: `backend/scripts/yt-dlp-upgrade.sh` uses `pipx upgrade yt-dlp` and expects `pipx` on PATH.
- Cron example (daily 03:15, logs to user home):
  - `15 3 * * * /home/craig/projects/kjdj/backend/scripts/yt-dlp-upgrade.sh >> /home/craig/yt-dlp-upgrade.log 2>&1`
- Systemd example: see the cron/systemd snippets in `README.md`.

### Common Tasks
- **Library Scan:** Triggered on-demand from the Host UI (Refresh Lib). No scan on backend startup.
- **Reset DB:** Delete `backend/db/kjdj.db` and restart backend to regenerate schema.

## 8. Current Status (Phase 3.5 Complete + Security/Join)
- [x] Host UI Dashboard (Rotation, Queue, Deck)
- [x] Singer Mobile Request Page
- [x] QR Join Flow + Singer Sessions (no login for singers)
- [x] Host Isolation (Data Separation)
- [x] Drag & Drop Reordering
- [x] In-Browser CDG Playback + Pop-out sync
- [x] Fair Rotation Logic
- [x] Panic Stop + Resync Display QoL controls
- [x] Host-only media download endpoint (singers blocked)
- [x] Host admin modal for managing hosts (craig/admin only)

## 9. Troubleshooting
- Blank page after login: clear `localStorage` keys `token` and `user`, then reload.
- If it still blanks, check the console for missing imports or state in the Host header:
  - `ReferenceError: audioAnalyser is not defined`: ensure `frontend/src/App.jsx` defines `audioAnalyser` state.
  - `ReferenceError: AudioVisualizer is not defined`: ensure `frontend/src/components/HostController.jsx` imports `./AudioVisualizer`.
- Visualizer not animating: browser audio context may be suspended until playback; ensure `frontend/src/components/KaraokePlayer.jsx` initializes/resumes the AudioContext on play.
