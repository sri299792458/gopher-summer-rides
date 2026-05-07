# Gopher Summer Rides

A small static web app for three University of Minnesota students who want summer 2026 bike rides chosen ahead of time. The default plan now uses 36 distinct route ideas across 12 weeks.

Live site: https://sri299792458.github.io/gopher-summer-rides/

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

The `127.0.0.1` URL only works on the computer running the server. It is not a share link.

Recommended: publish the static site and send the public URL.

### Option A: Public link with GitHub Pages

Use this when you want friends to open the planner from anywhere.

- Push this repo to GitHub.
- In the repo, open Settings -> Pages.
- Choose "Deploy from a branch".
- Use the `master` branch and `/ (root)` folder. If you rename the branch to `main`, choose `main` instead.
- Send the Pages URL to the other riders.

The app is static, so there is no build step.

### Option B: Netlify Drop

- Upload only the static site files: `index.html`, `styles.css`, `app.js`, and `data/`.
- Netlify gives you a public `netlify.app` URL.

### Option C: Temporary same-Wi-Fi preview

Use this only for quick testing while your laptop is running.

```powershell
python -m http.server 4173 --bind 0.0.0.0
```

Find your laptop's IPv4 address with `ipconfig`, then have friends on the same Wi-Fi open:

```text
http://YOUR-IP:4173/
```

`127.0.0.1` only works on your own computer. `0.0.0.0` starts the server, but it is not the link to share.

Completion check-offs are currently stored per browser; a shared live scoreboard would need a small backend.
