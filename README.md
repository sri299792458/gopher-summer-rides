# Gopher Summer Rides

A small static web app for Sri, Apurv, and Ayaan to keep summer 2026 bike rides moving without re-deciding everything from scratch. The planner uses an adaptive queue of 36 distinct route ideas across 12 weeks.

Live site: https://sri299792458.github.io/gopher-summer-rides/

## Dataset

The local dataset lives in `data/dataset.js`.

- Route distances are approximate planned ride distances.
- Route shapes are approximate waypoint sketches for map visualization, not turn-by-turn navigation.
- Official trail and status links are included through route-level source keys.
- The generated queue starts May 8, 2026 and reserves the final ride for the Full Grand Rounds Attempt.
- Dates come from a kickoff plus a Tue/Thu/Sat cadence; unfinished upcoming route picks can be refreshed without changing completed rides.

Primary sources include Minneapolis Park and Recreation Board, Three Rivers Park District, Dakota County Parks, Minnesota DNR, and OpenStreetMap attribution for the basemap.

## Features

- Adaptive 36-ride summer queue with a May 8 kickoff and a Tue/Thu/Sat rhythm.
- Mobile-first layout with the weekly plan, selected route controls, and map optimized for phones.
- A next-ride strip surfaces the upcoming unfinished ride with map and WhatsApp actions.
- Interactive route sketch map.
- Vibe and energy filters.
- Route search across names, stops, notes, surfaces, and discovery links.
- Per-browser completion tracking.
- WhatsApp ride-plan handoff for Sri, Apurv, and Ayaan.
- Shared route and sync links use the public Pages URL even when testing locally.
- Crew-added custom routes shared through Crew Sync.
- Exact custom route/map links become the shared map button for the crew.
- Route ideas can auto-estimate ride time when only distance is entered.
- Custom route ideas can be planned into the next open ride and preserved as crew picks.
- Custom rider names, optional Strava club and Photos links, and per-ride meet setup.
- Per-ride RSVP chips for quick local planning.
- Default 6:30 AM meet time with per-ride meet-time, meet-spot, and note overrides in the route panel.
- Manual Strava activity links for post-ride logging.
- Saved Strava activity links show immediate save feedback and an open link.
- Crew ride log shows completed rides and saved Strava links in one place.
- Refreshable upcoming route picks, while completed rides and the Grand Rounds finale stay locked.
- A next-open-ride swap action changes one editable upcoming ride without reshuffling the whole summer.
- Crew-picked next rides can be unpinned so they become refreshable again.
- Strava app handoff for starting a recording, plus an optional separate club link.
- Shared crew sync link for names, settings, RSVPs, completed rides, route queue, ride overrides, custom routes, and saved activity links.
- Crew Sync shows autosave, last-sync, and auto-check status so shared edits feel traceable.
- Crew Sync automatically checks again when the app is reopened or the phone reconnects.
- Optional private Photos album link saved in crew settings instead of hard-coded into the public site.
- `.ics` calendar export for the full summer plan.
- Route-specific learn-more links for local history, ride previews, blogs, articles, and videos.
- Official status/source links and route caveats.

## Run Locally

```powershell
.\.venv\Scripts\Activate.ps1
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Quality Check

Run the static smoke check before committing app changes:

```powershell
node tools/smoke-check.mjs
```

It verifies the shared mobile-critical DOM hooks, cache-versioned local assets, public share-link fallback, dataset integrity, discovery links, and summer schedule basics.

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

Without Crew Sync, names, RSVPs, completed rides, and refreshed route order are stored per browser. With Crew Sync enabled, the app stores shared crew state in a small MantleDB JSON document. Share the sync link with the other two riders once; anyone with that link can read and update the crew plan. New code deploys do not change the sync link id. The Photos button is only a shortcut; album privacy is controlled in Google Photos.
