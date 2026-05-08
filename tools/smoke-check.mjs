import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

const index = read("index.html");
const app = read("app.js");
const datasetSource = read("data", "dataset.js");
const failures = [];
const passes = [];

function check(condition, message) {
  (condition ? passes : failures).push(message);
}

function isValidUrl(value) {
  try {
    new URL(String(value));
    return true;
  } catch {
    return false;
  }
}

const localAssetRefs = [...index.matchAll(/(?:href|src)="([^"]+\.(?:css|js)(?:\?[^"]*)?)"/g)]
  .map((match) => match[1])
  .filter((asset) => !/^https?:\/\//.test(asset));
const versionedAssets = localAssetRefs.filter((asset) => asset.includes("?v="));
const versions = new Set(versionedAssets.map((asset) => asset.split("?v=")[1]));

check(localAssetRefs.length >= 3, "index references stylesheet, dataset, and app assets");
check(versionedAssets.length === localAssetRefs.length, "all local css/js assets are cache-versioned");
check(versions.size === 1, `local assets share one version (${[...versions].join(", ") || "none"})`);

[
  "dateInput",
  "energyFilter",
  "nextRideStrip",
  "weekRides",
  "map",
  "detailDock",
  "scheduleList",
  "routeSearch",
  "routeList",
  "customRouteForm",
  "syncStatus",
  "syncDetail",
  "startSyncButton",
  "copySyncLinkButton",
  "pullSyncButton",
  "rideLogList",
].forEach((id) => {
  check(index.includes(`id="${id}"`), `index has #${id}`);
});

[
  "renderNextRideStrip",
  "renderRoutes",
  "routeMatchesQuery",
  "renderRideLog",
  "getShareBaseUrl",
  "isLocalShareHost",
  "requestCrewSyncPull",
  "pullCrewSyncOnResume",
  "swapNextOpenRide",
  "getBackupCandidatesForSlot",
  "planRouteForNextRide",
  "getSyncDetailText",
].forEach((functionName) => {
  check(app.includes(`function ${functionName}`), `app defines ${functionName}()`);
});

check(app.includes('const publicAppUrl = "https://sri299792458.github.io/gopher-summer-rides/";'), "app keeps the public Pages URL for shared links");
check(app.includes("syncPollMs = 8000"), "app keeps an automatic sync check cadence");
check(app.includes('document.addEventListener("visibilitychange", pullCrewSyncOnResume)'), "app refreshes crew sync after tab resume");
check(app.includes('window.addEventListener("online", pullCrewSyncOnResume)'), "app refreshes crew sync after reconnecting");
check(app.includes("data-swap-next-ride"), "app exposes a next-open-ride swap action");
check(!app.includes("?.") && !app.includes("??"), "app avoids optional chaining/nullish coalescing for older mobile browsers");

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(datasetSource, sandbox, { filename: "data/dataset.js" });
const rideData = sandbox.window.RIDE_DATA;
const routes = rideData && rideData.routes;
const schedulePlan = rideData && rideData.schedulePlan;
const sources = rideData && rideData.sources;

check(Boolean(rideData), "dataset exposes window.RIDE_DATA");
check(Array.isArray(routes) && routes.length >= 36, "dataset has at least 36 route ideas");

if (Array.isArray(routes)) {
  const ids = new Set(routes.map((route) => route.id));
  check(ids.size === routes.length, "route ids are unique");
  check(ids.has("full-grand-rounds"), "dataset includes the Full Grand Rounds finale route");
  check(
    routes.every((route) => route.id && route.name && Number(route.miles) > 0 && Number(route.minutes) > 0),
    "routes have ids, names, miles, and minutes",
  );
  check(
    routes.every((route) => ["easy", "steady", "big"].includes(route.energy)),
    "routes use known energy levels",
  );
  check(
    routes.every((route) => ["water", "city", "green", "destination"].includes(route.vibe)),
    "routes use known vibe filters",
  );
  check(
    routes.every((route) => Array.isArray(route.stops) && route.stops.length > 0),
    "routes include at least one stop",
  );
  check(
    routes.every(
      (route) =>
        Array.isArray(route.coords) &&
        route.coords.length >= 2 &&
        route.coords.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]) &&
            point[0] >= -90 &&
            point[0] <= 90 &&
            point[1] >= -180 &&
            point[1] <= 180,
        ),
    ),
    "routes have valid map coordinates",
  );
  check(routes.filter((route) => Array.isArray(route.learnMore) && route.learnMore.length > 0).length >= 30, "most routes have discovery links");
}

if (sources && Array.isArray(routes)) {
  check(Boolean(sources.openStreetMap), "sources include OpenStreetMap attribution");
  check(Object.values(sources).every((source) => source.label && isValidUrl(source.url)), "official sources have labels and valid URLs");
  check(
    routes.every((route) => Array.isArray(route.sourceKeys) && route.sourceKeys.every((key) => sources[key])),
    "route source keys resolve to official sources",
  );
  check(
    routes.every((route) => route.learnMore.every((item) => isValidUrl(item.url))),
    "route discovery links are valid URLs",
  );
}

if (schedulePlan && Array.isArray(routes)) {
  const routeIds = new Set(routes.map((route) => route.id));
  check(schedulePlan.seasonStart === "2026-05-08", "schedule starts on May 8, 2026");
  check(schedulePlan.finaleRouteId === "full-grand-rounds", "schedule locks Full Grand Rounds as the finale");
  check(schedulePlan.kickoff.some((ride) => ride.date === "2026-05-08"), "kickoff includes May 8, 2026");
  check(schedulePlan.kickoff.every((ride) => routeIds.has(ride.routeId)), "kickoff route ids exist");
  check(schedulePlan.cadence.join(",") === "Tue,Thu,Sat", "schedule cadence is Tue/Thu/Sat");
}

if (failures.length) {
  console.error("Smoke check failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  console.error(`\nPassed ${passes.length} checks before failure.`);
  process.exitCode = 1;
} else {
  console.log(`Smoke check passed (${passes.length} checks).`);
}
