# Running Notes

## Project goal

Build a small website/app for three University of Minnesota students to make summer 2026 biking decisions automatic. The app should provide a ready-made weekly rotation, an interactive map, filters, completion tracking, and links to official trail status pages.

## Dataset plan

The app should use local JSON datasets instead of hard-coded route data in JavaScript:

- `data/routes.json`: route library, approximate waypoint geometry, distance, duration, surface, energy, vibe, stops, official source links, and caveats.
- `data/schedule.json`: 12-week summer rotation from May 18, 2026 through August 9, 2026, with Tuesday, Thursday, and Saturday ride assignments.

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
