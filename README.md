# Gopher Summer Rides

A small static web app for three University of Minnesota students who want summer 2026 bike rides chosen ahead of time. The default plan now uses 36 distinct route ideas across 12 weeks.

## Dataset

The local dataset lives in `data/dataset.js`.

- Route distances are approximate planned ride distances.
- Route shapes are approximate waypoint sketches for map visualization, not turn-by-turn navigation.
- Official trail and status links are included through route-level source keys.
- The 12-week schedule covers May 18, 2026 through August 9, 2026.
- Each scheduled ride uses a different route id by default.

Primary sources include Minneapolis Park and Recreation Board, Three Rivers Park District, Dakota County Parks, Minnesota DNR, and OpenStreetMap attribution for the basemap.

## Run Locally

```powershell
.\.venv\Scripts\Activate.ps1
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Share It

The `127.0.0.1` URL only works on the computer running the server.

For a same-Wi-Fi preview:

```powershell
python -m http.server 4173 --bind 0.0.0.0
```

Then find your laptop's IPv4 address with `ipconfig` and have friends open `http://YOUR-IP:4173/`.

For a permanent link, push the repo to GitHub and enable GitHub Pages from the repository root. The app is static, so it does not need a build step. Completion check-offs are currently stored per browser; a shared live scoreboard would need a small backend.
