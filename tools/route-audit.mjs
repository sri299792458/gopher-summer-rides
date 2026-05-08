import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetSource = fs.readFileSync(path.join(root, "data", "dataset.js"), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(datasetSource, sandbox, { filename: "data/dataset.js" });

const routes = sandbox.window.RIDE_DATA.routes;
const failures = [];

function formatCoord(point) {
  return `${point[0]},${point[1]}`;
}

function getDirectionsUrl(route) {
  const coords = Array.isArray(route.coords) ? route.coords.filter((point) => Array.isArray(point) && point.length === 2) : [];
  if (coords.length < 2) return "";
  const params = new URLSearchParams({
    api: "1",
    origin: formatCoord(coords[0]),
    destination: formatCoord(coords[coords.length - 1]),
    travelmode: "bicycling",
  });
  const waypoints = coords.slice(1, -1).map(formatCoord);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function distanceMiles(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(h));
}

function maxSegmentMiles(route) {
  let max = 0;
  for (let index = 1; index < route.coords.length; index += 1) {
    max = Math.max(max, distanceMiles(route.coords[index - 1], route.coords[index]));
  }
  return max;
}

console.log("Route map audit");
console.log("id\tpoints\tmax straight segment\tmap url");

routes.forEach((route) => {
  const url = getDirectionsUrl(route);
  const parsed = url ? new URL(url) : null;
  const waypointCount = parsed && parsed.searchParams.get("waypoints")
    ? parsed.searchParams.get("waypoints").split("|").length
    : 0;

  if (!url.includes("https://www.google.com/maps/dir/")) failures.push(`${route.id}: missing directions URL`);
  if (!parsed || parsed.searchParams.get("travelmode") !== "bicycling") failures.push(`${route.id}: missing bicycling mode`);
  if (!parsed || !parsed.searchParams.get("origin") || !parsed.searchParams.get("destination")) {
    failures.push(`${route.id}: missing origin or destination`);
  }
  if (route.coords.length > 2 && waypointCount !== route.coords.length - 2) {
    failures.push(`${route.id}: waypoint count ${waypointCount} does not match coords`);
  }
  if (route.id === "campus-coffee" && route.coords.length < 8) {
    failures.push("campus-coffee: not enough waypoints for bridge-aware campus loop");
  }

  console.log(`${route.id}\t${route.coords.length}\t${maxSegmentMiles(route).toFixed(1)} mi\t${url}`);
});

if (failures.length) {
  console.error("\nRoute map audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`\nRoute map audit passed (${routes.length} routes).`);
}
