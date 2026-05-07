# Gopher Summer Rides

A small static web app for three University of Minnesota students who want summer 2026 bike rides chosen ahead of time.

## Dataset

The local dataset lives in `data/dataset.js`.

- Route distances are approximate planned ride distances.
- Route shapes are approximate waypoint sketches for map visualization, not turn-by-turn navigation.
- Official trail and status links are included through route-level source keys.
- The 12-week schedule covers May 18, 2026 through August 9, 2026.

Primary sources include Minneapolis Park and Recreation Board, Three Rivers Park District, Dakota County Parks, Minnesota DNR, and OpenStreetMap attribution for the basemap.

## Run Locally

```powershell
.\.venv\Scripts\Activate.ps1
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.
