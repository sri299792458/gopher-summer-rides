# Running Notes

## Project goal

Build a small website/app for three University of Minnesota students to make summer 2026 biking decisions easy without making the plan feel rigid. The app should provide an adaptive ride queue, an interactive map, filters, completion tracking, WhatsApp/Strava handoffs, and links to official trail status pages.

## Dataset plan

The app should use a local dataset plus a small schedule config instead of hand-written ride-by-ride dates:

- `data/dataset.js`: route library, approximate waypoint geometry, distance, duration, surface, energy, vibe, stops, official source links, caveats, and a generated schedule plan.
- `schedulePlan`: starts May 8, 2026, uses a kickoff plus Tue/Thu/Sat cadence, dynamically assigns unfinished route picks, and reserves Full Grand Rounds as the finale.

Route geometry is approximate waypoint geometry for planning and visualization, not turn-by-turn navigation.

## Primary data sources

- Minneapolis Park and Recreation Board trails and parkways: Grand Rounds, Midtown Greenway connections, Minnehaha Parkway closure note.
- Three Rivers Park District: regional trail system and activity status.
- Dakota County Parks: Big Rivers Regional Trail and current trailhead/segment closure notes.
- Minnesota DNR: Luce Line State Trail, Gateway State Trail, Brown's Creek State Trail.
- OpenStreetMap tile layer: visual basemap only.

## Known 2026 caveats to surface

- Minneapolis Parks lists a Minnehaha Parkway closure through fall 2027 for Nicollet Avenue bridge work.
- Dakota County lists the Lone Oak Trailhead and a nearby Big Rivers segment as closed for bridge construction.
- Trail conditions and construction change during Minnesota summers, so the app should keep official status links close to the ride plan.

## Build notes

- Static app for low friction.
- Python virtual environment requested for project tooling.
- Keep UI functional on first screen: schedule plus map immediately visible.
- Avoid making route distances seem exact; display them as approximate planning distances.

## Agent review integration

- Data review recommended route-level source keys, distance method labels, caveats for custom mileage, and clear geometry precision. Added those to `data/dataset.js`.
- UI review found SRI/CDN, native button styling, energy-filter, ARIA, map fallback, and localStorage boot risks. Fixes are being applied before browser verification.

## May 7 update

- User clarified that the summer should feel like exploration, not repeating the same obvious loops.
- Reworked the schedule toward 36 distinct ride ids.
- Added hidden-gem variants including Nicollet Island lighthouse, Bridal Veil/Franklin gorge, Witch's Hat, Deming Heights, Hidden Falls/Crosby, Summit/Cathedral, Capital City/Harriet Island, Bruce Vento/Swede Hollow, Lake Phalen, North Mississippi/Webber, and Silverwood.
- Sharing guidance should be honest: `127.0.0.1` is local only; same-Wi-Fi sharing uses `--bind 0.0.0.0`; durable sharing is best through GitHub Pages or another static host. Progress remains per browser until a backend exists.
- User pushed back that the first sharing option was confusing. Reframed sharing around a public URL first, with same-Wi-Fi clearly labeled as a temporary preview only.

## Deployment

- Public GitHub repo: https://github.com/sri299792458/gopher-summer-rides
- GitHub Pages URL: https://sri299792458.github.io/gopher-summer-rides/
- Pages source: `master` branch, repository root.
- Verified live site in browser on May 7, 2026 with no fresh console warnings or errors.

## Next build pass

- User asked to use multiple agents for ideation and continue building.
- In progress: calendar export, copyable group-chat ride text, selected-route map search, and clearer live-link copying.
- Agent ideas integrated in this pass: full-summer `.ics` export, route-specific deep links, copyable ride text and route links, week theme labels, achievement badges, focus-visible styling, tab keyboard navigation, `noopener` on external links, and visible route verification dates.
- Deferred ideas: RSVP/availability grid, richer route metadata filters, PWA/offline mode, progress import/export, and map stop markers.

## Workflow correction

- User clarified the real workflow: coordinate in WhatsApp, track rides in Strava, keep the app practical/customizable, and end on Grand Rounds.
- Changed the three default riders to Sri, Apurv, and Ayaan.
- Moved the full Grand Rounds ride to the final Saturday and moved Dakota Rail earlier.
- Replaced low-value copy-route/copy-text actions with WhatsApp, Strava, and map handoffs.
- Added customizable meet times, meet spot, Strava club link, and local per-ride RSVP chips.
- Removed the in-app deployment/share explanation from the main UI; README remains the place for deployment notes.

## Adaptive schedule correction

- User pushed back that a fully hard-coded May 8 schedule would be brittle and too prescriptive.
- Replaced the fixed schedule array with `schedulePlan` rules: May 8 kickoff, cadence days, adaptive route pool, rest buffer, and locked Grand Rounds finale.
- Added a refresh control for unfinished upcoming picks. Completed routes and fixed kickoff/finale rides stay stable.
- Date picker min/max now derive from the generated season dates; static HTML defaults were updated to May 8 through August 8, 2026.
- Clarified product truth: public code updates propagate after deployment, but rider names, RSVPs, completed rides, and route refreshes are still per-browser until a shared-state backend is added.
- Set default meet time to 6:30 AM and added per-ride overrides for meet time, meet spot, and planning note.
