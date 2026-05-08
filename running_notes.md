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
- Replaced the Strava upload/login link with an app-only launch (`strava://record` or Android intent). Removed automatic web fallback because mobile browsers can fire it after returning from the app.
- Added Crew Sync via MantleDB so one sync link can share rider names, meet settings, RSVPs, completed rides, adaptive route order, and per-ride overrides across devices.
- Changed the Photos album handoff to an optional crew setting, not a hard-coded public default. The Photos button still appears after the group adds an album link in the Crew tab.
- Started a mobile-first layout pass: phone flow is planner header, selected route controls, map, then the longer Schedule/Routes/Crew views; desktop restores the left-planner/right-map split.
- Clarified access model: Sri shares the sync link with Apurv and Ayaan once; Crew Sync is link-based, and the Photos button is only a shortcut to whatever album privacy Google Photos enforces.
- Fixed the backup ride button so it chooses a different matching route, updates the URL, shows a toast, and scrolls phones to the selected route panel.

## Route context links pass

- User asked for ride pages to include links to blogs, articles, or videos so the routes feel like real Twin Cities exploration instead of just map sketches.
- Spawned three research agents for Minneapolis/UMN, Saint Paul/east metro, and regional/west/south trails.
- Added a route-level `learnMore` catalog with curated local-history, ride-preview, official-context, blog, and video links.
- Kept official trail/status source links separate from the discovery links so closures and authoritative trail pages still have their own lower-friction place in the UI.

## Crew board simplification

- User pointed out that global weeknight/Saturday meet defaults and the Crew Sync WhatsApp button were clutter.
- Removed the global meet controls from the Crew board; meet time, meet spot, and notes are now edited per ride in the selected route panel.
- Removed the WhatsApp sync-link shortcut from Crew Sync because sharing the sync URL is a one-time setup.
- Confirmed the sync link is tied to the shared crew document id, not to commits; removed old local migration shims to keep the frontend lean.

## Mobile startup fix

- User shared an Android Chrome screenshot showing the static shell only: no ride cards, no map tiles, and no icons.
- Reverted the mistaken public-link assumption from the prior fix attempt.
- Hardened startup after the sync work: localStorage failures no longer crash boot, newer optional/nullish syntax was removed, ride content renders before map/sync startup, and map/sync failures are isolated from first paint.
- Added versioned asset URLs for the app CSS/data/JS so mobile Chrome fetches the fixed bundle instead of a stale cached script.

## Custom routes and Strava links

- User chose the practical path: custom routes first, then manual Strava activity links before any full Strava OAuth/backend integration.
- Added custom routes as Crew Sync state so Sri, Apurv, and Ayaan can add route ideas together without changing the fixed summer schedule.
- Added a post-ride panel on each selected route to mark it done and paste a Strava activity URL.
- Browser QA found and fixed route-link preservation, mobile numeric-field friction, and escaping for crew-entered custom route text.

## Narrow UX follow-up

- User rejected the broad mobile ride cockpit pass because the fixed nav made tab changes happen offscreen and blocked lower content; reverted it in commit d6abfef.
- Follow-up pass is deliberately narrow: keep the working layout, promote exact custom route links into the existing map action, include exact route links in WhatsApp text, and avoid broad navigation changes.
- Continued with another narrow pass: route library cards now show a selected badge, and small RSVP/filter/done controls have larger tap targets without changing page structure.
- Continued route idea flow: minutes are optional and auto-estimated from miles/energy, the form uses "route idea" language, and route cards show when a custom idea has a map link.
- Continued post-ride logging polish: Strava activity URLs now show immediate saved feedback and expose the saved activity link without waiting for another render.
- Started the long-running product goal: custom route ideas can now be deliberately planned into the next unfinished flexible ride, marked as crew picks, preserved through refreshes, and shared through Crew Sync.
- Reliability follow-up: unplanned custom route ideas remain valid library ideas and no longer make the schedule validator expect every custom idea to appear in the summer queue.
- Morning-use follow-up: the top planner now shows a next-ride strip with the upcoming unfinished ride, meet details, route map action, and WhatsApp handoff before the longer weekly list.
- Post-ride follow-up: Crew board now includes a ride log that lists completed rides and opens saved Strava activity links from one place.
- Sync confidence follow-up: Crew Sync now shows autosave/saving, last-sync time, and auto-check cadence so cross-device edits feel less mysterious.
- Share-link reliability follow-up: route-plan and sync links now fall back to the public GitHub Pages URL when generated from a local preview.
- Discovery follow-up: Route library now has search across names, stops, notes, surfaces, and discovery-link titles so hidden gems and custom ideas are easier to find on mobile.

## Reliability guardrail

- Added a local Node smoke check for the fragile public-site basics: versioned local assets, required mobile DOM hooks, public share-link fallback, dataset integrity, official/discovery URLs, and the May 8 / Tue-Thu-Sat / Grand Rounds schedule assumptions.
- Kept this as tooling/docs only so it does not disturb the currently working mobile UI while still reducing the chance of another silent startup regression.

## Sync resume behavior

- Added a narrow Crew Sync reliability pass: when the app regains focus, becomes visible, or comes back online, it quietly checks the shared plan instead of waiting only for the next interval.
- Added an in-flight guard and short throttle so focus/visibility events do not stack overlapping sync pulls.
- Bumped the static asset version so mobile Chrome fetches this sync fix from GitHub Pages.

## Next ride swap

- Added a shared "Swap" action to the next-ride strip when the next unfinished ride is editable.
- The swap trades the next open ride with a later unpinned route that matches the energy filter, pins the new pick as a crew choice, and syncs it without reshuffling the whole summer queue.
- Kept fixed kickoff/finale rides locked, and kept the action out of the strip when the visible next ride is not editable.

## Next ride unpin

- Added an "Unpin" action for crew-picked next rides so a route can become refreshable again without clearing the rest of the plan.
- The action only appears on editable pinned next rides and preserves locked kickoff/finale rides.
- Bumped the static asset version for the deployed bundle.

## Next ride Strava action

- Added a Strava launch action directly to the next-ride strip so the morning flow has map, WhatsApp, and tracking from the first card.
- Reused the existing app-only Strava handoff with no web fallback, keeping the previous mobile-login fix intact.
- Bumped the static asset version for GitHub Pages.

## Completion audit

Objective restated as deliverables: a polished mobile-first shared ride companion for Sri, Apurv, and Ayaan for Summer 2026 with dynamic Twin Cities route discovery, synced crew planning, editable meet logistics, custom route ideas, WhatsApp coordination, Strava post-ride logging, and reliable GitHub Pages delivery.

- Sri/Apurv/Ayaan + Summer 2026: README names the three riders, defaults are `["Sri", "Apurv", "Ayaan"]`, schedule starts May 8, 2026, and the app title/header targets UMN summer 2026.
- Dynamic Twin Cities route discovery: `data/dataset.js` has 36 routes, official source keys, route caveats, OpenStreetMap attribution, and route-level `learnMore` links; app includes search, vibe/energy filters, adaptive route refresh, Swap, Unpin, and a locked Full Grand Rounds finale.
- Synced crew planning: Crew Sync state includes riders, preferences, completed rides, RSVPs, plan assignments, pins, overrides, custom routes, and activity links; app shows connected/saving/last-sync status and pulls on interval, resume, focus, and reconnect.
- Editable meet logistics: selected scheduled routes expose meet time, meet spot, and plan note overrides; defaults keep the usual 6:30 AM meet time.
- Custom route ideas: route idea form supports route name, distance, optional auto-estimated minutes, energy/vibe, start/surface/stops/note, exact map link, deletion, shared sync, and "Use next ride" planning.
- WhatsApp coordination: next ride and selected route actions build WhatsApp ride text with timing, meet spot, map/plan link, Photos link when configured, and Strava reminder.
- Strava workflow: next ride and selected route actions launch the Strava app only; selected route panel accepts manual Strava activity links; Crew ride log shows completed rides and saved Strava links.
- Reliable GitHub Pages: assets are cache-versioned, share links generated from local preview use the public Pages URL, README documents sharing/deployment, `tools/smoke-check.mjs` covers mobile-critical DOM hooks, dataset integrity, share fallback, schedule assumptions, sync resume hooks, and next ride actions.
- Verification evidence: `node tools\smoke-check.mjs` passed, `node --check app.js` passed, `node --check data\dataset.js` passed, `git diff --check` passed, and the public GitHub Pages app booted with title, selected route, next ride actions, route search, custom route form, sync status, and zero public-host console errors.

Residual risks: route geometry and distances remain planning approximations, Strava import is intentionally manual rather than OAuth/backend-based, and Crew Sync remains link-based access control. These are documented product choices rather than blockers for the stated objective.

## Route map correction

- User called out that Campus Coffee looked like it magically crossed the river, and that the Map action was useless if it did not open an actual route.
- Replaced the built-in Google Maps fallback from search URLs to bicycling directions URLs with origin, destination, and route waypoints.
- Added bridge-approach waypoints to Campus Coffee so the in-app preview no longer draws a fake diagonal river crossing.
- Updated the smoke check so built-in map actions must keep using Google Maps directions with bicycling mode.

## All-route map audit

- Added `tools/route-audit.mjs` to check every dataset route, print its Google Maps bicycling directions URL, verify origin/destination/waypoint wiring, and guard Campus Coffee against losing its bridge-aware waypoint count.
- Renamed the next-ride action from "Map" to "Directions" because the button now promises an actual route, not a generic map search.
- Ran browser QA across all 36 route pages; every selected-route Directions button resolved to Google Maps directions with bicycling mode and waypoints.
