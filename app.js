(() => {
const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const rideData = window.RIDE_DATA;
const baseRoutes = rideData.routes;
const { schedulePlan, sources } = rideData;
let routes = baseRoutes.slice();
const routeById = new Map();
const initialSearchParams = new URLSearchParams(window.location.search);
const syncApiBase = "https://mantledb.sh/v2";
const syncPath = "crew-plan";
const syncPollMs = 8000;
let scheduleSlots = [];
let schedule = [];
let lastScheduledWeek;
let summerStart;
let summerEnd;
let totalScheduledRides = routes.length;

function readLocalValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some mobile in-app/private browsers block localStorage. Keep the app usable without persistence.
  }
}

function removeLocalValue(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable on mobile; nothing to remove in that case.
  }
}

function randomId(prefix = "") {
  const id =
    window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}-${id}` : id;
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "route";
}

function normalizeExternalUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function safeJsonStorage(key, fallback) {
  try {
    const value = readLocalValue(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    removeLocalValue(key);
    return fallback;
  }
}

function safeArrayStorage(key, fallback) {
  const value = safeJsonStorage(key, fallback);
  return Array.isArray(value) ? value : fallback;
}

function safeObjectStorage(key, fallback) {
  const value = safeJsonStorage(key, fallback);
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function safeNumberStorage(key, fallback) {
  const value = Number(readLocalValue(key));
  return Number.isFinite(value) ? value : fallback;
}

function getOrCreateClientId() {
  const existing = readLocalValue("crewSyncClientId");
  if (existing) return existing;
  const next = randomId("client");
  writeLocalValue("crewSyncClientId", next);
  return next;
}

const defaultRiders = ["Sri", "Apurv", "Ayaan"];
const defaultPreferences = {
  weeknightTime: "06:30",
  saturdayTime: "06:30",
  meetSpot: "UMN East Bank",
  stravaClub: "",
  photosAlbum: "",
};

const state = {
  selectedRouteId: "stone-arch-boom",
  activeVibe: "all",
  activeTab: "schedule",
  completed: new Set(safeArrayStorage("completedRides", [])),
  riders: safeArrayStorage("riders", defaultRiders),
  preferences: { ...defaultPreferences, ...safeObjectStorage("ridePreferences", {}) },
  rsvps: safeObjectStorage("rideRsvps", {}),
  planAssignments: safeObjectStorage("planAssignments", {}),
  planSeed: safeNumberStorage("planSeed", 0),
  rideOverrides: safeObjectStorage("rideOverrides", {}),
  customRoutes: safeArrayStorage("customRoutes", []),
  activityLinks: safeObjectStorage("rideActivityLinks", {}),
};

const syncState = {
  id: initialSearchParams.get("sync") || readLocalValue("crewSyncBlobId") || "",
  clientId: getOrCreateClientId(),
  lastRemoteUpdatedAt: safeNumberStorage("crewSyncLastUpdatedAt", 0),
  saveTimer: null,
  pollTimer: null,
  applyingRemote: false,
  busy: false,
  ready: false,
};

const dateInput = document.querySelector("#dateInput");
const energyFilter = document.querySelector("#energyFilter");
const weekLabel = document.querySelector("#weekLabel");
const weekRides = document.querySelector("#weekRides");
const scheduleList = document.querySelector("#scheduleList");
const routeList = document.querySelector("#routeList");
const routeCount = document.querySelector("#routeCount");
const selectedTitle = document.querySelector("#selectedTitle");
const selectedVibe = document.querySelector("#selectedVibe");
const selectedMiles = document.querySelector("#selectedMiles");
const selectedTime = document.querySelector("#selectedTime");
const selectedEnergy = document.querySelector("#selectedEnergy");
const detailDock = document.querySelector("#detailDock");
const doneCount = document.querySelector("#doneCount");
const milesDone = document.querySelector("#milesDone");
const ridesDone = document.querySelector("#ridesDone");
const longestRide = document.querySelector("#longestRide");
const achievementList = document.querySelector("#achievementList");
const seasonProgress = document.querySelector("#seasonProgress");
const meterFill = document.querySelector("#meterFill");
const riderInputs = [document.querySelector("#riderOne"), document.querySelector("#riderTwo"), document.querySelector("#riderThree")];
const preferenceInputs = {
  stravaClub: document.querySelector("#stravaClub"),
  photosAlbum: document.querySelector("#photosAlbum"),
};
const customRouteForm = document.querySelector("#customRouteForm");
const customRouteInputs = {
  name: document.querySelector("#customRouteName"),
  miles: document.querySelector("#customRouteMiles"),
  minutes: document.querySelector("#customRouteMinutes"),
  energy: document.querySelector("#customRouteEnergy"),
  vibe: document.querySelector("#customRouteVibe"),
  start: document.querySelector("#customRouteStart"),
  surface: document.querySelector("#customRouteSurface"),
  stops: document.querySelector("#customRouteStops"),
  note: document.querySelector("#customRouteNote"),
  link: document.querySelector("#customRouteLink"),
};
const syncStatus = document.querySelector("#syncStatus");
const startSyncButton = document.querySelector("#startSyncButton");
const copySyncLinkButton = document.querySelector("#copySyncLinkButton");
const pullSyncButton = document.querySelector("#pullSyncButton");
const toast = document.querySelector("#toast");

const weekThemes = {
  1: "Kickoff and river orientation",
  2: "Hidden Minneapolis",
  3: "Overlooks and first sampler",
  4: "East and Northeast discoveries",
  5: "Lakes classic week",
  6: "Falls, creek, confluence",
  7: "North river pockets",
  8: "South and east expansion",
  9: "Rail trails and east side",
  10: "St. Paul architecture",
  11: "Ravines and west metro",
  12: "Grand Rounds finale",
};
let map;
let routeLayer;
let markerLayer;

function parseDateValue(value) {
  return new Date(`${value}T12:00:00`);
}

function dayLabelForDate(date) {
  return dayLabels[date.getDay()];
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextCadenceDateAfter(date, cadence) {
  let next = addDays(date, 1);
  while (!cadence.includes(dayLabelForDate(next))) {
    next = addDays(next, 1);
  }
  return next;
}

function nextDayOnOrAfter(date, targetDay) {
  let next = new Date(date);
  while (dayLabelForDate(next) !== targetDay) {
    next = addDays(next, 1);
  }
  return next;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateScheduledRouteIds(knownRouteIds, slots) {
  const scheduledIds = slots.map((slot) => slot.routeId).filter(Boolean);
  const missingIds = scheduledIds.filter((routeId) => !knownRouteIds.has(routeId));
  const duplicateIds = scheduledIds.filter((routeId, index) => scheduledIds.indexOf(routeId) !== index);
  const unscheduledIds = [...knownRouteIds].filter((routeId) => !scheduledIds.includes(routeId));

  if (missingIds.length || duplicateIds.length || unscheduledIds.length) {
    throw new Error(
      [
        "Schedule plan is invalid.",
        missingIds.length ? `Missing route ids: ${missingIds.join(", ")}` : "",
        duplicateIds.length ? `Duplicate route ids: ${[...new Set(duplicateIds)].join(", ")}` : "",
        unscheduledIds.length ? `Unscheduled route ids: ${unscheduledIds.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  if (!slots.every((slot) => slot.routeId)) throw new Error("Schedule plan has unassigned ride slots.");
}

function normalizeCustomRoute(route) {
  route = route && typeof route === "object" ? route : {};
  const name = String(route.name || "Custom route").trim();
  const miles = Number(route.miles);
  const minutes = Number(route.minutes);
  const stops = Array.isArray(route.stops)
    ? route.stops.map((stop) => String(stop).trim()).filter(Boolean)
    : String(route.stops || "")
        .split(",")
        .map((stop) => stop.trim())
        .filter(Boolean);
  const link = normalizeExternalUrl(route.link);
  const id = route.id && String(route.id).startsWith("custom-") ? route.id : randomId(`custom-${slugify(name)}`);

  return {
    id,
    name,
    miles: Number.isFinite(miles) && miles > 0 ? Math.round(miles * 10) / 10 : 8,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 60,
    energy: ["easy", "steady", "big"].includes(route.energy) ? route.energy : "easy",
    vibe: ["water", "city", "green", "destination"].includes(route.vibe) ? route.vibe : "city",
    surface: String(route.surface || "Custom route").trim(),
    start: String(route.start || defaultPreferences.meetSpot).trim(),
    note: String(route.note || "Crew-added route. Confirm the exact path before rolling.").trim(),
    stops: stops.length ? stops : ["Custom stop"],
    link,
    color: route.color || "#7a1f2b",
    coords: Array.isArray(route.coords) && route.coords.length >= 2 ? route.coords : [[44.9757, -93.2342], [44.9847, -93.2548]],
    sourceKeys: ["openStreetMap"],
    learnMore: link ? [{ title: "Custom route link", url: link, kind: "article" }] : [],
    caveat: "Crew-added route. Verify roads, trail closures, and exact navigation before riding.",
    distanceMethod: "Crew-entered planned ride distance",
    geometrySource: "Crew-entered route placeholder",
    geometryPrecision: "Planning only, not turn-by-turn navigation",
    lastVerified: "crew-added",
    custom: true,
  };
}

function rebuildRouteLibrary() {
  const customRoutes = state.customRoutes
    .filter((route) => route && typeof route === "object")
    .map(normalizeCustomRoute);
  state.customRoutes = customRoutes;
  routes = baseRoutes.concat(customRoutes);
  routeById.clear();
  routes.forEach((route) => routeById.set(route.id, route));
  if (!routeById.has(state.selectedRouteId)) state.selectedRouteId = "stone-arch-boom";
}

function groupScheduleSlots(slots, weekSize) {
  const weeks = [];
  for (let index = 0; index < slots.length; index += weekSize) {
    const chunk = slots.slice(index, index + weekSize);
    weeks.push({
      week: weeks.length + 1,
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
      slots: chunk,
    });
  }
  return weeks;
}

function buildScheduleSlots(plan, routeList) {
  const knownRouteIds = new Set(routeList.map((route) => route.id));
  if (!plan.cadence || !plan.cadence.length) throw new Error("Schedule plan needs at least one cadence day.");

  const kickoffSlots = (plan.kickoff || [])
    .map((slot) => {
      const date = parseDateValue(slot.date);
      const day = slot.day || dayLabelForDate(date);
      return {
        id: formatDateValue(date),
        date: formatDateValue(date),
        day,
        label: slot.label || day,
        routeId: slot.routeId,
        fixedRouteId: slot.routeId,
        locked: true,
        kind: "kickoff",
      };
    })
    .sort((a, b) => parseDateValue(a.date) - parseDateValue(b.date));

  const slots = [...kickoffSlots];
  let cursor = kickoffSlots.length
    ? parseDateValue(kickoffSlots[kickoffSlots.length - 1].date)
    : parseDateValue(plan.seasonStart);

  const fixedRouteIds = new Set([...kickoffSlots.map((slot) => slot.routeId), plan.finaleRouteId]);
  const flexibleCount = routeList.length - fixedRouteIds.size;
  if (flexibleCount < 0) throw new Error("Schedule plan reserves more fixed routes than exist.");

  for (let index = 0; index < flexibleCount; index += 1) {
    cursor = nextCadenceDateAfter(cursor, plan.cadence);
    const day = dayLabelForDate(cursor);
    slots.push({
      id: formatDateValue(cursor),
      date: formatDateValue(cursor),
      day,
      label: day,
      routeId: null,
      kind: "adaptive",
    });
  }

  const earliestFinaleDate = addDays(cursor, plan.finaleRestDays || 0);
  let finaleDate = nextDayOnOrAfter(earliestFinaleDate, plan.finaleDay);
  if (finaleDate <= cursor) {
    finaleDate = nextDayOnOrAfter(addDays(cursor, 1), plan.finaleDay);
  }
  slots.push({
    id: formatDateValue(finaleDate),
    date: formatDateValue(finaleDate),
    day: dayLabelForDate(finaleDate),
    label: "Finale",
    routeId: plan.finaleRouteId,
    fixedRouteId: plan.finaleRouteId,
    locked: true,
    kind: "finale",
    isFinale: true,
  });

  const unknownFixedIds = [...fixedRouteIds].filter((routeId) => !knownRouteIds.has(routeId));
  if (unknownFixedIds.length) throw new Error(`Schedule plan has unknown fixed route ids: ${unknownFixedIds.join(", ")}`);
  return slots;
}

function energyFitScore(route, slotIndex, totalSlots) {
  const phase = totalSlots <= 1 ? 1 : slotIndex / (totalSlots - 1);
  const target = { easy: 0.2, steady: 0.55, big: 0.86 }[route.energy] || 0.5;
  return Math.abs(phase - target) * 5;
}

function pickAdaptiveRoute(pool, slot, slotIndex, totalSlots, previousRoute, seed) {
  if (!pool.length) throw new Error(`No adaptive route left for ${slot.date}.`);
  return pool
    .map((routeId) => {
      const route = routeById.get(routeId);
      const vibePenalty = previousRoute && previousRoute.vibe === route.vibe ? 1.1 : 0;
      const bigEarlyPenalty = route.energy === "big" && slotIndex < Math.floor(totalSlots * 0.45) ? 1.7 : 0;
      const seededNoise = (hashString(`${seed}|${slot.date}|${route.id}`) % 1000) / 1000;
      return {
        routeId,
        score: energyFitScore(route, slotIndex, totalSlots) + vibePenalty + bigEarlyPenalty + seededNoise,
      };
    })
    .sort((a, b) => a.score - b.score)[0].routeId;
}

function normalizePlanAssignments({ preserve = true } = {}) {
  const knownRouteIds = new Set(baseRoutes.map((route) => route.id));
  const fixedRouteIds = new Set(scheduleSlots.filter((slot) => slot.fixedRouteId).map((slot) => slot.fixedRouteId));
  const nextAssignments = {};
  const usedRouteIds = new Set(fixedRouteIds);
  const flexibleSlots = scheduleSlots.filter((slot) => !slot.fixedRouteId);

  for (const slot of scheduleSlots.filter((item) => item.fixedRouteId)) {
    nextAssignments[slot.id] = slot.fixedRouteId;
  }

  if (preserve) {
    for (const slot of flexibleSlots) {
      const routeId = state.planAssignments[slot.id];
      if (!routeId || !knownRouteIds.has(routeId) || usedRouteIds.has(routeId)) continue;
      nextAssignments[slot.id] = routeId;
      usedRouteIds.add(routeId);
    }
  }

  let pool = baseRoutes
    .map((route) => route.id)
    .filter((routeId) => !usedRouteIds.has(routeId));

  const unassignedSlots = flexibleSlots.filter((slot) => !nextAssignments[slot.id]);
  for (const slot of unassignedSlots) {
    const slotIndex = scheduleSlots.findIndex((item) => item.id === slot.id);
    const previousSlot = scheduleSlots[slotIndex - 1];
    const previousRoute = previousSlot ? routeById.get(nextAssignments[previousSlot.id]) : null;
    const pickedRouteId = pickAdaptiveRoute(pool, slot, slotIndex, scheduleSlots.length, previousRoute, state.planSeed);
    nextAssignments[slot.id] = pickedRouteId;
    usedRouteIds.add(pickedRouteId);
    pool = pool.filter((routeId) => routeId !== pickedRouteId);
  }

  state.planAssignments = nextAssignments;
  savePlanState();
}

function buildScheduleFromAssignments() {
  const slots = scheduleSlots.map((slot) => ({
    ...slot,
    routeId: slot.fixedRouteId || state.planAssignments[slot.id],
  }));
  validateScheduledRouteIds(new Set(baseRoutes.map((route) => route.id)), slots);
  return groupScheduleSlots(slots, schedulePlan.weekSize || 3);
}

function refreshSchedule({ preserve = true } = {}) {
  scheduleSlots = buildScheduleSlots(schedulePlan, baseRoutes);
  normalizePlanAssignments({ preserve });
  schedule = buildScheduleFromAssignments();
  lastScheduledWeek = schedule[schedule.length - 1];
  const firstScheduledSlot = schedule[0].slots[0];
  const lastScheduledSlot = lastScheduledWeek.slots[lastScheduledWeek.slots.length - 1];
  summerStart = parseDateValue(firstScheduledSlot.date);
  summerEnd = parseDateValue(lastScheduledSlot.date);
  totalScheduledRides = scheduleSlots.length;
}

function clampDate(date) {
  if (date < summerStart) return summerStart;
  if (date > summerEnd) return summerEnd;
  return date;
}

function formatDateValue(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekForDate(value) {
  const date = clampDate(parseDateValue(value));
  return schedule.find((week) => parseDateValue(week.end) >= date) || lastScheduledWeek;
}

function formatWeekRange(week) {
  const start = parseDateValue(week.start);
  const end = parseDateValue(week.end);
  const month = start.toLocaleString("en-US", { month: "short" });
  const endMonth = end.toLocaleString("en-US", { month: "short" });
  if (month === endMonth) return `${month} ${start.getDate()}-${end.getDate()}`;
  return `${month} ${start.getDate()}-${endMonth} ${end.getDate()}`;
}

function rideKey(slot) {
  return `${slot.date}-${slot.routeId}`;
}

function routeIdFromRideKey(key) {
  if (String(key).startsWith("route:")) return String(key).slice(6);
  const dateKeyMatch = String(key).match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return dateKeyMatch ? dateKeyMatch[1] : "";
}

function setSyncId(id) {
  syncState.id = id || "";
  if (syncState.id) {
    writeLocalValue("crewSyncBlobId", syncState.id);
  } else {
    removeLocalValue("crewSyncBlobId");
  }
}

function getSyncEndpoint(id = syncState.id) {
  return `${syncApiBase}/${encodeURIComponent(id)}/${syncPath}`;
}

function getSyncLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("sync", syncState.id);
  url.searchParams.set("tab", "crew");
  return url.toString();
}

function updateSyncControls(message, tone = "idle") {
  if (!syncStatus) return;
  const isConnected = Boolean(syncState.id);
  syncStatus.textContent = message || (isConnected ? "Crew sync connected" : "Local only");
  syncStatus.dataset.tone = tone;
  if (startSyncButton) {
    startSyncButton.disabled = isConnected || syncState.busy;
    startSyncButton.innerHTML = `<i data-lucide="cloud"></i>${isConnected ? "Sync on" : "Start sync"}`;
  }
  if (copySyncLinkButton) copySyncLinkButton.disabled = !isConnected;
  if (pullSyncButton) pullSyncButton.disabled = !isConnected || syncState.busy;
  renderIcons();
}

function getCrewPlanSnapshot() {
  return {
    app: "gopher-summer-rides",
    version: 1,
    updatedAt: Date.now(),
    updatedBy: syncState.clientId,
    riders: state.riders.slice(0, 3),
    preferences: { ...state.preferences },
    completed: [...state.completed],
    rsvps: { ...state.rsvps },
    planAssignments: { ...state.planAssignments },
    planSeed: state.planSeed,
    rideOverrides: { ...state.rideOverrides },
    customRoutes: state.customRoutes.slice(),
    activityLinks: { ...state.activityLinks },
  };
}

function persistLocalCrewState() {
  writeLocalValue("completedRides", JSON.stringify([...state.completed]));
  writeLocalValue("riders", JSON.stringify(state.riders));
  writeLocalValue("ridePreferences", JSON.stringify(state.preferences));
  writeLocalValue("rideRsvps", JSON.stringify(state.rsvps));
  writeLocalValue("planAssignments", JSON.stringify(state.planAssignments));
  writeLocalValue("planSeed", String(state.planSeed));
  writeLocalValue("rideOverrides", JSON.stringify(state.rideOverrides));
  writeLocalValue("customRoutes", JSON.stringify(state.customRoutes));
  writeLocalValue("rideActivityLinks", JSON.stringify(state.activityLinks));
}

function renderCrewControls() {
  riderInputs.forEach((input, index) => {
    input.value = state.riders[index] || defaultRiders[index];
  });
  Object.entries(preferenceInputs).forEach(([key, input]) => {
    input.value = state.preferences[key] || "";
  });
}

function applyCrewPlanSnapshot(snapshot) {
  if (!snapshot || snapshot.app !== "gopher-summer-rides") throw new Error("This sync link does not contain a Gopher Summer Rides crew plan.");
  syncState.applyingRemote = true;
  try {
    state.riders = Array.isArray(snapshot.riders) ? snapshot.riders.slice(0, 3) : defaultRiders;
    state.preferences = { ...defaultPreferences, ...(snapshot.preferences && typeof snapshot.preferences === "object" ? snapshot.preferences : {}) };
    state.completed = new Set(Array.isArray(snapshot.completed) ? snapshot.completed : []);
    state.rsvps = snapshot.rsvps && typeof snapshot.rsvps === "object" ? snapshot.rsvps : {};
    state.planAssignments = snapshot.planAssignments && typeof snapshot.planAssignments === "object" ? snapshot.planAssignments : {};
    state.planSeed = Number.isFinite(Number(snapshot.planSeed)) ? Number(snapshot.planSeed) : 0;
    state.rideOverrides = snapshot.rideOverrides && typeof snapshot.rideOverrides === "object" ? snapshot.rideOverrides : {};
    state.customRoutes = Array.isArray(snapshot.customRoutes) ? snapshot.customRoutes.map(normalizeCustomRoute) : [];
    state.activityLinks = snapshot.activityLinks && typeof snapshot.activityLinks === "object" ? snapshot.activityLinks : {};
    persistLocalCrewState();
    rebuildRouteLibrary();
    const requestedRoute = initialSearchParams.get("route");
    if (requestedRoute && routeById.has(requestedRoute)) state.selectedRouteId = requestedRoute;
    refreshSchedule({ preserve: true });
    renderCrewControls();
    renderAll();
  } finally {
    syncState.applyingRemote = false;
  }
}

async function fetchCrewPlan() {
  const response = await fetch(getSyncEndpoint(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Sync pull failed (${response.status})`);
  return response.json();
}

async function pullCrewSync({ quiet = false } = {}) {
  if (!syncState.id) return;
  if (!quiet) updateSyncControls("Pulling latest...", "busy");
  const remote = await fetchCrewPlan();
  const remoteUpdatedAt = Number(remote.updatedAt) || 0;
  if (remoteUpdatedAt > syncState.lastRemoteUpdatedAt) {
    applyCrewPlanSnapshot(remote);
    syncState.lastRemoteUpdatedAt = remoteUpdatedAt;
    writeLocalValue("crewSyncLastUpdatedAt", String(syncState.lastRemoteUpdatedAt));
    updateSyncControls("Crew sync updated", "ok");
    showToast("Crew plan updated.");
  } else if (!quiet) {
    updateSyncControls("Already up to date", "ok");
  }
}

async function pushCrewSyncNow() {
  if (!syncState.id || syncState.applyingRemote || !syncState.ready) return;
  window.clearTimeout(syncState.saveTimer);
  const snapshot = getCrewPlanSnapshot();
  updateSyncControls("Syncing changes...", "busy");
  const response = await fetch(getSyncEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Sync push failed (${response.status})`);
  syncState.lastRemoteUpdatedAt = snapshot.updatedAt;
  writeLocalValue("crewSyncLastUpdatedAt", String(syncState.lastRemoteUpdatedAt));
  updateSyncControls("Synced just now", "ok");
}

function queueSyncPush() {
  if (!syncState.id || syncState.applyingRemote || !syncState.ready) return;
  window.clearTimeout(syncState.saveTimer);
  syncState.saveTimer = window.setTimeout(() => {
    pushCrewSyncNow().catch((error) => {
      updateSyncControls("Sync failed. Pull or retry.", "error");
      console.error(error);
    });
  }, 650);
}

function startSyncPolling() {
  if (!syncState.id) return;
  syncState.ready = true;
  window.clearInterval(syncState.pollTimer);
  updateSyncControls("Crew sync connected", "ok");
  pullCrewSync({ quiet: true }).catch((error) => {
    updateSyncControls("Could not pull sync yet", "error");
    console.error(error);
  });
  syncState.pollTimer = window.setInterval(() => {
    pullCrewSync({ quiet: true }).catch((error) => {
      updateSyncControls("Sync check failed", "error");
      console.error(error);
    });
  }, syncPollMs);
}

async function createCrewSync() {
  syncState.busy = true;
  updateSyncControls("Creating crew sync...", "busy");
  const snapshot = getCrewPlanSnapshot();
  const id = randomId("gopher-rides");
  const response = await fetch(getSyncEndpoint(id), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Sync create failed (${response.status})`);
  setSyncId(id);
  syncState.lastRemoteUpdatedAt = snapshot.updatedAt;
  writeLocalValue("crewSyncLastUpdatedAt", String(syncState.lastRemoteUpdatedAt));
  syncState.ready = true;
  syncState.busy = false;
  updateUrlState();
  startSyncPolling();
  showToast("Crew sync created.");
}

async function copyCrewSyncLink() {
  if (!syncState.id) return;
  await navigator.clipboard.writeText(getSyncLink());
  showToast("Crew sync link copied.");
}

function getCompletedRouteIds() {
  return new Set([...state.completed].map(routeIdFromRideKey).filter((routeId) => routeById.has(routeId)));
}

function completionKeyForRoute(route, scheduled) {
  return scheduled ? rideKey(scheduled.slot) : `route:${route.id}`;
}

function isRouteComplete(route, scheduled) {
  const key = completionKeyForRoute(route, scheduled);
  return state.completed.has(key) || getCompletedRouteIds().has(route.id);
}

function isRideDone(slot) {
  return state.completed.has(rideKey(slot)) || getCompletedRouteIds().has(slot.routeId);
}

function toggleRouteCompletion(routeId, key) {
  const existingKeys = [...state.completed].filter((completedKey) => routeIdFromRideKey(completedKey) === routeId);
  if (state.completed.has(key) || existingKeys.length) {
    existingKeys.forEach((completedKey) => state.completed.delete(completedKey));
    state.completed.delete(key);
  } else {
    state.completed.add(key);
  }
  saveCompleted();
}

function refreshUpcomingPlan() {
  const cutoff = clampDate(parseDateValue(dateInput.value));
  const completedRouteIds = getCompletedRouteIds();

  for (const slot of scheduleSlots) {
    if (slot.fixedRouteId || parseDateValue(slot.date) < cutoff) continue;
    const routeId = state.planAssignments[slot.id];
    if (routeId && !completedRouteIds.has(routeId)) delete state.planAssignments[slot.id];
  }

  state.planSeed += 1;
  refreshSchedule({ preserve: true });
  renderAll();
  showToast("Upcoming picks refreshed.");
}

function saveCompleted() {
  writeLocalValue("completedRides", JSON.stringify([...state.completed]));
  queueSyncPush();
}

function saveRiders() {
  writeLocalValue("riders", JSON.stringify(state.riders));
  queueSyncPush();
}

function savePreferences() {
  writeLocalValue("ridePreferences", JSON.stringify(state.preferences));
  queueSyncPush();
}

function saveRsvps() {
  writeLocalValue("rideRsvps", JSON.stringify(state.rsvps));
  queueSyncPush();
}

function savePlanState() {
  writeLocalValue("planAssignments", JSON.stringify(state.planAssignments));
  writeLocalValue("planSeed", String(state.planSeed));
  queueSyncPush();
}

function saveRideOverrides() {
  writeLocalValue("rideOverrides", JSON.stringify(state.rideOverrides));
  queueSyncPush();
}

function saveCustomRoutes() {
  writeLocalValue("customRoutes", JSON.stringify(state.customRoutes));
  queueSyncPush();
}

function saveActivityLinks() {
  writeLocalValue("rideActivityLinks", JSON.stringify(state.activityLinks));
  queueSyncPush();
}

function addCustomRouteFromForm() {
  if (!customRouteForm || !customRouteInputs.name) return;
  const route = normalizeCustomRoute({
    id: randomId(`custom-${slugify(customRouteInputs.name.value)}`),
    name: customRouteInputs.name.value,
    miles: customRouteInputs.miles.value,
    minutes: customRouteInputs.minutes.value,
    energy: customRouteInputs.energy.value,
    vibe: customRouteInputs.vibe.value,
    start: customRouteInputs.start.value,
    surface: customRouteInputs.surface.value,
    stops: customRouteInputs.stops.value,
    note: customRouteInputs.note.value,
    link: customRouteInputs.link.value,
  });

  state.customRoutes.push(route);
  rebuildRouteLibrary();
  state.selectedRouteId = route.id;
  state.activeTab = "routes";
  saveCustomRoutes();
  renderAll();
  setActiveTab("routes");
  customRouteForm.reset();
  if (customRouteInputs.start) customRouteInputs.start.value = state.preferences.meetSpot;
  if (customRouteInputs.surface) customRouteInputs.surface.value = "Paved trail";
  showToast("Custom route added.");
  focusSelectedRoutePanel();
}

function deleteCustomRoute(routeId) {
  const route = routeById.get(routeId);
  if (!route || !route.custom) return;
  const message = syncState.id
    ? "Remove this custom route for everyone using the crew sync link?"
    : "Remove this custom route?";
  if (!window.confirm(message)) return;
  state.customRoutes = state.customRoutes.filter((customRoute) => customRoute.id !== routeId);
  Object.keys(state.activityLinks).forEach((key) => {
    if (routeIdFromRideKey(key) === routeId) delete state.activityLinks[key];
  });
  [...state.completed].forEach((key) => {
    if (routeIdFromRideKey(key) === routeId) state.completed.delete(key);
  });
  rebuildRouteLibrary();
  if (state.selectedRouteId === routeId) state.selectedRouteId = "stone-arch-boom";
  saveCustomRoutes();
  saveActivityLinks();
  saveCompleted();
  renderAll();
  showToast("Custom route removed.");
}

function getInitialParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    route: params.get("route"),
    tab: params.get("tab"),
    vibe: params.get("vibe"),
    energy: params.get("energy"),
    date: params.get("date"),
    sync: params.get("sync"),
  };
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (syncState.id) params.set("sync", syncState.id);
  if (state.selectedRouteId !== "stone-arch-boom") params.set("route", state.selectedRouteId);
  if (state.activeTab !== "schedule") params.set("tab", state.activeTab);
  if (state.activeVibe !== "all") params.set("vibe", state.activeVibe);
  if (energyFilter.value !== "all") params.set("energy", energyFilter.value);
  if (dateInput.value !== formatDateValue(clampDate(new Date()))) params.set("date", dateInput.value);
  const next = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
  window.history.replaceState(null, "", next);
}

function buildRouteUrl(routeId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (syncState.id) url.searchParams.set("sync", syncState.id);
  url.searchParams.set("route", routeId);
  url.searchParams.set("tab", "routes");
  return url.toString();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function getRideDate(slot) {
  return parseDateValue(slot.date);
}

function formatRideDate(slot) {
  const date = getRideDate(slot);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSelectedScheduleSlot(routeId) {
  for (const week of schedule) {
    for (const slot of week.slots) {
      if (slot.routeId === routeId) {
        return { week, slot, date: getRideDate(slot) };
      }
    }
  }
  return null;
}

function getGoogleMapsUrl(route) {
  const [lat, lng] = route.coords[0];
  const query = encodeURIComponent(`${route.name} ${route.start} Minneapolis Saint Paul MN`);
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=&center=${lat},${lng}`;
}

function getExactRouteUrl(route) {
  return normalizeExternalUrl(route.link);
}

function getRouteMapAction(route) {
  const exactUrl = getExactRouteUrl(route);
  return {
    url: exactUrl || getGoogleMapsUrl(route),
    label: exactUrl ? "Open route map" : "Map search",
    exact: Boolean(exactUrl),
  };
}

function getRideMeetTime(slotOrDay) {
  const day = typeof slotOrDay === "string" ? slotOrDay : slotOrDay.day;
  const override = typeof slotOrDay === "string" ? null : state.rideOverrides[slotOrDay.id];
  if (override && override.time) return override.time;
  return day === "Sat" ? state.preferences.saturdayTime : state.preferences.weeknightTime;
}

function getRideMeetSpot(slot) {
  if (slot && state.rideOverrides[slot.id] && state.rideOverrides[slot.id].spot) return state.rideOverrides[slot.id].spot;
  return state.preferences.meetSpot;
}

function getRidePlanNote(slot) {
  if (!slot) return "";
  return state.rideOverrides[slot.id] && state.rideOverrides[slot.id].note ? state.rideOverrides[slot.id].note : "";
}

function updateRideOverride(slotId, field, rawValue) {
  const slot = scheduleSlots.find((item) => item.id === slotId);
  if (!slot || !["time", "spot", "note"].includes(field)) return;

  const value = field === "note" ? rawValue.trim() : rawValue;
  const fallback = {
    time: slot.day === "Sat" ? state.preferences.saturdayTime : state.preferences.weeknightTime,
    spot: state.preferences.meetSpot,
    note: "",
  }[field];
  const override = { ...(state.rideOverrides[slotId] || {}) };

  if (!value || value === fallback) {
    delete override[field];
  } else {
    override[field] = value;
  }

  if (Object.keys(override).length) {
    state.rideOverrides[slotId] = override;
  } else {
    delete state.rideOverrides[slotId];
  }

  saveRideOverrides();

  const selectedRoute = routeById.get(state.selectedRouteId);
  const whatsAppAction = document.querySelector(".action-whatsapp");
  if (selectedRoute && whatsAppAction) whatsAppAction.href = getWhatsAppUrl(selectedRoute);
  const timeDisplay = document.querySelector("[data-selected-meet-time]");
  const spotDisplay = document.querySelector("[data-selected-meet-spot]");
  if (timeDisplay) timeDisplay.textContent = getRideMeetTime(slot);
  if (spotDisplay) spotDisplay.textContent = getRideMeetSpot(slot);
}

function updateActivityLink(key, rawValue) {
  const value = normalizeExternalUrl(rawValue);
  if (value) {
    state.activityLinks[key] = { url: value, updatedAt: Date.now() };
  } else {
    delete state.activityLinks[key];
  }
  saveActivityLinks();
}

function getRideStartTimeForIcs(slot) {
  return `${getRideMeetTime(slot).replace(":", "")}00`;
}

function getCrewNames() {
  return state.riders.filter(Boolean).join(", ");
}

const rsvpStates = ["", "in", "maybe", "out", "late"];
const rsvpLabels = {
  "": "Set",
  in: "In",
  maybe: "Maybe",
  out: "Out",
  late: "Late",
};

function getRsvp(key, riderIndex) {
  return state.rsvps[key] && state.rsvps[key][riderIndex] ? state.rsvps[key][riderIndex] : "";
}

function cycleRsvp(key, riderIndex) {
  const current = getRsvp(key, riderIndex);
  const next = rsvpStates[(rsvpStates.indexOf(current) + 1) % rsvpStates.length];
  state.rsvps[key] = state.rsvps[key] || {};
  if (next) {
    state.rsvps[key][riderIndex] = next;
  } else {
    delete state.rsvps[key][riderIndex];
  }
  saveRsvps();
}

function getRsvpSummary(route) {
  const scheduled = getSelectedScheduleSlot(route.id);
  if (!scheduled) return "RSVP in WhatsApp.";
  const key = rideKey(scheduled.slot);
  return state.riders
    .map((name, index) => `${name || defaultRiders[index]}: ${rsvpLabels[getRsvp(key, index)]}`)
    .join(" | ");
}

function buildWhatsAppText(route) {
  const scheduled = getSelectedScheduleSlot(route.id);
  const note = scheduled ? getRidePlanNote(scheduled.slot) : "";
  const routeMapUrl = getExactRouteUrl(route);
  const when = scheduled
    ? `${scheduled.slot.day}, ${formatRideDate(scheduled.slot)} at ${getRideMeetTime(scheduled.slot)}`
    : "summer 2026";
  const lines = [
    `Ride plan for ${getCrewNames()}: ${route.name}`,
    `${when} - meet at ${scheduled ? getRideMeetSpot(scheduled.slot) : state.preferences.meetSpot}`,
    `${route.miles} approx mi, ${route.energy}, ${route.surface}`,
    `Stops: ${route.stops.join(", ")}`,
    `RSVP: ${getRsvpSummary(route)}`,
  ];
  if (note) lines.push(`Plan note: ${note}`);
  if (routeMapUrl) lines.push(`Route map: ${routeMapUrl}`);
  if (getPhotosAlbumUrl()) lines.push(`Photos: ${getPhotosAlbumUrl()}`);
  lines.push(`Track on Strava after the ride. Plan: ${buildRouteUrl(route.id)}`);
  return lines.join("\n");
}

function getWhatsAppUrl(route) {
  return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppText(route))}`;
}

function getStravaClubUrl() {
  return normalizeExternalUrl(state.preferences.stravaClub);
}

function getPhotosAlbumUrl() {
  return normalizeExternalUrl(state.preferences.photosAlbum);
}

function getStravaLaunchUrl() {
  if (/Android/i.test(navigator.userAgent)) {
    return "intent://record#Intent;scheme=strava;package=com.strava;end";
  }
  return "strava://record";
}

function openStravaApp(event) {
  event.preventDefault();
  const launchUrl = getStravaLaunchUrl();

  showToast("Opening Strava app...");
  window.location.assign(launchUrl);
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function formatIcsDate(date, time) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${time}`;
}

function addMinutesToIcs(date, time, minutes) {
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const next = new Date(date);
  next.setHours(hour, minute + minutes, 0, 0);
  return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}T${pad(next.getHours())}${pad(next.getMinutes())}00`;
}

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function learnMoreKindLabel(kind) {
  const labels = {
    article: "Article",
    blog: "Blog",
    official: "Official",
    video: "Video",
  };
  return labels[kind] || "Read";
}

function renderLearnMoreLink(link) {
  const title = escapeHtml(link.title || link.label || "Learn more");
  const url = escapeHtml(normalizeExternalUrl(link.url));
  const kind = escapeHtml(learnMoreKindLabel(link.kind));
  if (!url) return "";
  return `
    <a href="${url}" target="_blank" rel="noopener noreferrer">
      <span>${kind}</span>
      <strong>${title}</strong>
      <i data-lucide="external-link"></i>
    </a>
  `;
}

function buildCalendarIcs() {
  const events = schedule.flatMap((week) =>
    week.slots.map((slot) => {
      const route = routeById.get(slot.routeId);
      const date = getRideDate(slot);
      const startTime = getRideStartTimeForIcs(slot);
      const start = formatIcsDate(date, startTime);
      const end = addMinutesToIcs(date, startTime, route.minutes);
      const planNote = getRidePlanNote(slot);
      const description = `${route.miles} approximate miles. ${route.note} Meet at ${getRideMeetSpot(slot)}. ${planNote ? `${planNote} ` : ""}Track on Strava. Stops: ${route.stops.join(", ")}. Check official sources before rolling.`;
      return [
        "BEGIN:VEVENT",
        `UID:gopher-summer-rides-${slot.date}-${route.id}@gopher-summer-rides`,
        `DTSTAMP:20260507T000000Z`,
        `DTSTART;TZID=America/Chicago:${start}`,
        `DTEND;TZID=America/Chicago:${end}`,
        `SUMMARY:${escapeIcsText(route.name)}`,
        `LOCATION:${escapeIcsText(route.start)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        "END:VEVENT",
      ].join("\r\n");
    }),
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gopher Summer Rides//Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Gopher Summer Rides 2026",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadCalendar() {
  const blob = new Blob([buildCalendarIcs()], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gopher-summer-rides-2026.ics";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Calendar file downloaded.");
}

function renderWeek() {
  const week = getWeekForDate(dateInput.value);
  weekLabel.textContent = `Week ${week.week} / ${weekThemes[week.week]}`;
  const allowedEnergy = energyFilter.value;
  const entries = week.slots
    .map((slot) => ({ slot, route: routeById.get(slot.routeId) }))
    .filter(({ route }) => allowedEnergy === "all" || route.energy === allowedEnergy);

  if (!entries.length) {
    weekRides.innerHTML = `
      <div class="empty-state">
        <h3>No ${allowedEnergy} rides this week</h3>
        <p>Pick Any or use shuffle for a backup that matches the energy filter.</p>
      </div>
    `;
    return;
  }

  weekRides.innerHTML = entries
    .map(({ slot, route }) => {
      const key = rideKey(slot);
      const done = isRideDone(slot);
      const routeName = escapeHtml(route.name);
      return `
        <article class="ride-card">
          <div class="day-pill">${slot.label}</div>
          <div class="ride-main">
            <button type="button" class="route-select-link" data-route="${escapeHtml(route.id)}">
              <h3>${routeName}</h3>
              <p class="meta-line">
                <span>${route.miles} approx mi</span>
                <span>${escapeHtml(route.surface)}</span>
                <span class="badge">${route.energy}</span>
              </p>
            </button>
            <div class="rsvp-row" aria-label="${routeName} RSVPs">
              ${state.riders
                .map((name, index) => {
                  const status = getRsvp(key, index);
                  const label = rsvpLabels[status];
                  const riderName = escapeHtml(name || defaultRiders[index]);
                  return `<button class="rsvp-chip ${status ? `is-${status}` : ""}" type="button" data-rsvp-key="${escapeHtml(key)}" data-rider-index="${index}" aria-label="${riderName} RSVP ${label}">${riderName}: ${label}</button>`;
                })
                .join("")}
            </div>
          </div>
          <button class="ride-action ${done ? "is-done" : ""}" type="button" data-done-key="${escapeHtml(key)}" data-done-route="${escapeHtml(route.id)}" title="Toggle done" aria-label="Mark ${routeName} ${done ? "incomplete" : "complete"}" aria-pressed="${done}">
            <i data-lucide="${done ? "check" : "circle"}"></i>
          </button>
        </article>
      `;
    })
    .join("");

  renderIcons();
}

function renderSchedule() {
  const currentWeek = getWeekForDate(dateInput.value).week;
  scheduleList.innerHTML = schedule
    .map((week) => {
      const rows = week.slots
        .map((slot) => {
          const route = routeById.get(slot.routeId);
          const key = rideKey(slot);
          return `
            <button type="button" class="week-row" data-route="${escapeHtml(route.id)}">
              <span>${slot.label}</span>
              <strong>${escapeHtml(route.name)}${slot.isFinale ? ' <span class="finale-pill">Finale</span>' : ""}</strong>
              <span>${isRideDone(slot) ? "Done" : `${formatRideDate(slot)} - ${route.miles} mi`}</span>
            </button>
          `;
        })
        .join("");
      return `
        <article class="schedule-week ${week.week === currentWeek ? "is-current" : ""}">
          <h3>Week ${week.week} <span class="meta-line">${formatWeekRange(week)} - ${weekThemes[week.week] || "Adaptive picks"}</span></h3>
          <div class="week-grid">${rows}</div>
        </article>
      `;
    })
    .join("");
}

function renderRoutes() {
  const visibleRoutes = routes.filter((route) => state.activeVibe === "all" || route.vibe === state.activeVibe);
  routeCount.textContent = `${visibleRoutes.length} routes`;
  routeList.innerHTML = visibleRoutes
    .map((route) => `
      <article class="route-card ${route.id === state.selectedRouteId ? "is-selected" : ""}">
        <button type="button" data-route="${escapeHtml(route.id)}">
          <h3>${escapeHtml(route.name)}</h3>
          <p class="meta-line">
            <span>${route.miles} approx mi</span>
            <span>${route.minutes} min</span>
            <span class="badge">${escapeHtml(route.vibe)}</span>
            ${route.custom ? '<span class="badge badge-custom">custom</span>' : ""}
          </p>
          <p class="route-note">${escapeHtml(route.note)}</p>
        </button>
      </article>
    `)
    .join("");
}

function renderStats() {
  const completedDetails = [...getCompletedRouteIds()]
    .map((routeId) => routeById.get(routeId))
    .filter(Boolean);

  const totalMiles = completedDetails.reduce((sum, route) => sum + route.miles, 0);
  const longest = completedDetails.reduce((max, route) => Math.max(max, route.miles), 0);
  const completedCount = completedDetails.length;
  const progressTotal = Math.max(totalScheduledRides, completedCount);
  const percent = Math.round((completedCount / progressTotal) * 100);
  doneCount.textContent = `${completedCount}/${progressTotal} done`;
  milesDone.textContent = totalMiles;
  ridesDone.textContent = completedCount;
  longestRide.textContent = longest;
  seasonProgress.textContent = `${percent}%`;
  meterFill.style.width = `${Math.min(100, percent)}%`;
  renderAchievements(completedDetails, totalMiles, longest);
}

function renderAchievements(completedDetails, totalMiles, longest) {
  const riverRides = completedDetails.filter((route) => route.vibe === "water").length;
  const bigRides = completedDetails.filter((route) => route.energy === "big").length;
  const cityRides = completedDetails.filter((route) => route.vibe === "city").length;
  const achievements = [
    { name: "First roll", unlocked: completedDetails.length >= 1 },
    { name: "Five rides", unlocked: completedDetails.length >= 5 },
    { name: "100 miles", unlocked: totalMiles >= 100 },
    { name: "River regular", unlocked: riverRides >= 4 },
    { name: "Big day survivor", unlocked: bigRides >= 1 || longest >= 30 },
    { name: "St. Paul curious", unlocked: cityRides >= 4 },
  ];

  achievementList.innerHTML = achievements
    .map((achievement) => `<span class="${achievement.unlocked ? "is-unlocked" : ""}">${achievement.name}</span>`)
    .join("");
}

function renderSelectedRoute() {
  const route = routeById.get(state.selectedRouteId);
  const scheduled = getSelectedScheduleSlot(route.id);
  const scheduledText = scheduled ? `${scheduled.slot.label}, ${formatRideDate(scheduled.slot)}` : route.custom ? "Shared route library" : "Backup ride";
  const completionKey = completionKeyForRoute(route, scheduled);
  const routeComplete = isRouteComplete(route, scheduled);
  const activityLink = state.activityLinks[completionKey] && state.activityLinks[completionKey].url ? normalizeExternalUrl(state.activityLinks[completionKey].url) : "";
  const rideOverride = scheduled ? state.rideOverrides[scheduled.slot.id] || {} : {};
  const meetTime = scheduled ? getRideMeetTime(scheduled.slot) : state.preferences.weeknightTime;
  const meetSpot = scheduled ? getRideMeetSpot(scheduled.slot) : state.preferences.meetSpot;
  const routeMapAction = getRouteMapAction(route);
  const exactRouteUrl = getExactRouteUrl(route);
  const routeSources = (route.sourceKeys || [])
    .map((key) => sources[key])
    .filter(Boolean);
  const learnMoreLinks = (route.learnMore || []).filter((link) => {
    const url = link && normalizeExternalUrl(link.url);
    return url && url !== exactRouteUrl;
  });
  const caveat = route.caveat ? `<p class="route-caveat">${escapeHtml(route.caveat)}</p>` : "";
  const mapNote = route.custom ? '<p class="route-caveat">Custom route map is approximate unless the route link has exact navigation.</p>' : "";
  selectedTitle.textContent = route.name;
  selectedVibe.textContent = route.vibe;
  selectedMiles.textContent = route.miles;
  selectedTime.textContent = route.minutes;
  selectedEnergy.textContent = route.energy;
  detailDock.innerHTML = `
    <div>
      <p class="eyebrow">${escapeHtml(route.start)}</p>
      <h2>${escapeHtml(route.surface)}${route.custom ? ' <span class="custom-route-tag">Custom</span>' : ""}</h2>
      <p>${escapeHtml(route.note)}</p>
      ${caveat}
      ${mapNote}
      <p class="data-note">${escapeHtml(route.distanceMethod)}. ${escapeHtml(route.geometryPrecision)}. Last verified ${escapeHtml(route.lastVerified)}.</p>
    </div>
    <div>
      <p class="eyebrow">${escapeHtml(scheduledText)}</p>
      <div class="stop-list">${route.stops.map((stop) => `<span>${escapeHtml(stop)}</span>`).join("")}</div>
      <div class="ride-ops">
        <div>
          <span>Meet</span>
          <strong data-selected-meet-time>${escapeHtml(meetTime)}</strong>
        </div>
        <div>
          <span>Spot</span>
          <strong data-selected-meet-spot>${escapeHtml(meetSpot)}</strong>
        </div>
        <div>
          <span>Track</span>
          <strong>${state.preferences.stravaClub ? "Club" : "Strava"}</strong>
        </div>
      </div>
      ${
        scheduled
          ? `<div class="ride-customizer" aria-label="Ride setup">
              <label>
                <span>Meet time</span>
                <input type="time" data-ride-override="time" data-slot-id="${scheduled.slot.id}" value="${escapeHtml(rideOverride.time || meetTime)}" />
              </label>
              <label>
                <span>Meet spot</span>
                <input type="text" data-ride-override="spot" data-slot-id="${scheduled.slot.id}" value="${escapeHtml(rideOverride.spot || meetSpot)}" />
              </label>
              <label class="ride-note-field">
                <span>Plan note</span>
                <textarea data-ride-override="note" data-slot-id="${scheduled.slot.id}" rows="2" placeholder="Snacks, late start, lock plan">${escapeHtml(rideOverride.note || "")}</textarea>
              </label>
            </div>`
          : ""
      }
      <div class="post-ride-panel">
        <div class="post-ride-heading">
          <div>
            <p class="eyebrow">After ride</p>
            <strong>${routeComplete ? "Ride marked done" : "Ready to log after the ride"}</strong>
          </div>
          <button class="text-button" type="button" data-toggle-route-complete="${escapeHtml(completionKey)}" data-route-id="${escapeHtml(route.id)}">
            <i data-lucide="${routeComplete ? "check" : "circle"}"></i>
            ${routeComplete ? "Done" : "Mark done"}
          </button>
        </div>
        <label>
          <span>Shared Strava activity</span>
          <input type="url" data-activity-link="${escapeHtml(completionKey)}" value="${escapeHtml(activityLink)}" placeholder="https://www.strava.com/activities/..." />
        </label>
        ${
          activityLink
            ? `<a class="activity-open-link" href="${escapeHtml(activityLink)}" target="_blank" rel="noopener noreferrer">Open saved activity</a>`
            : ""
        }
      </div>
      <div class="action-grid">
        <a class="inline-action action-whatsapp" href="${getWhatsAppUrl(route)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="message-circle"></i>
          Send to WhatsApp
        </a>
        <a class="inline-action action-route-map ${routeMapAction.exact ? "has-exact-route" : ""}" href="${escapeHtml(routeMapAction.url)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="${routeMapAction.exact ? "navigation" : "map-pin"}"></i>
          ${routeMapAction.label}
        </a>
        <a class="inline-action action-strava" href="${getStravaLaunchUrl()}" data-strava-launch>
          <i data-lucide="activity"></i>
          Start Strava
        </a>
        ${
          getPhotosAlbumUrl()
            ? `<a class="inline-action action-photos" href="${escapeHtml(getPhotosAlbumUrl())}" target="_blank" rel="noopener noreferrer">
                <i data-lucide="images"></i>
                Photos
              </a>`
            : ""
        }
        ${
          getStravaClubUrl()
            ? `<a class="inline-action action-strava-club" href="${escapeHtml(getStravaClubUrl())}" target="_blank" rel="noopener noreferrer">
                <i data-lucide="users"></i>
                Strava club
              </a>`
            : ""
        }
        ${
          route.custom
            ? `<button class="inline-action action-remove" type="button" data-delete-custom-route="${escapeHtml(route.id)}">
                <i data-lucide="trash-2"></i>
                Remove custom
              </button>`
            : ""
        }
      </div>
      ${
        learnMoreLinks.length
          ? `<div class="learn-more-links">
              <p class="eyebrow">Learn more</p>
              <div class="learn-more-list">
                ${learnMoreLinks.map(renderLearnMoreLink).join("")}
              </div>
            </div>`
          : ""
      }
      <div class="source-links">
        ${routeSources
          .map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`)
          .join("")}
      </div>
    </div>
  `;
  drawRoute(route);
  renderRoutes();
  renderIcons();
  updateUrlState();
}

function drawRoute(route) {
  if (!map || !window.L) return;
  if (routeLayer) routeLayer.remove();
  if (markerLayer) markerLayer.remove();

  routeLayer = L.polyline(route.coords, {
    color: route.color,
    weight: 6,
    opacity: 0.9,
    lineJoin: "round",
  }).addTo(map);

  const start = route.coords[0];
  const end = route.coords[route.coords.length - 1];
  markerLayer = L.layerGroup([
    L.circleMarker(start, {
      radius: 8,
      color: "#ffffff",
      fillColor: route.color,
      fillOpacity: 1,
      weight: 3,
    }).bindPopup(`<strong>${escapeHtml(route.name)}</strong><br>${escapeHtml(route.start)}`),
    L.circleMarker(end, {
      radius: 7,
      color: "#ffffff",
      fillColor: "#f0b429",
      fillOpacity: 1,
      weight: 3,
    }),
  ]).addTo(map);

  const bounds = routeLayer.getBounds();
  map.fitBounds(bounds.pad(0.22), { animate: true });
}

function showMapFallback(message) {
  const mapElement = document.querySelector("#map");
  if (mapElement.querySelector(".map-fallback")) return;
  const fallback = document.createElement("div");
  fallback.className = "map-fallback";
  fallback.textContent = message;
  mapElement.append(fallback);
}

function initMap() {
  if (!window.L) {
    document.querySelector("#map").innerHTML = "<div class='map-fallback'>Map scripts need an internet connection.</div>";
    return;
  }

  map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: true,
  }).setView([44.9757, -93.2342], 12);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  const tileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });
  tileLayer.on("tileerror", () => {
    showMapFallback("Map tiles did not load. The route plan still works, but the basemap needs internet access.");
  });
  tileLayer.addTo(map);
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderAll() {
  renderWeek();
  renderSchedule();
  renderRoutes();
  renderStats();
  renderSelectedRoute();
}

function renderStartupError(error) {
  console.error(error);
  const message = "The planner hit a startup error. Refresh once; if it stays blank, open the live link in Chrome.";
  if (weekRides) {
    weekRides.innerHTML = `<div class="empty-state"><h3>Could not load rides</h3><p>${message}</p></div>`;
  }
  if (detailDock) {
    detailDock.innerHTML = `<div class="empty-state"><h3>Startup error</h3><p>${message}</p></div>`;
  }
  showMapFallback("Map did not start, but the ride plan can still load.");
}

function safelyInitMap() {
  try {
    initMap();
    renderSelectedRoute();
  } catch (error) {
    console.error(error);
    showMapFallback("Map did not start. The ride plan still works.");
  }
}

function selectRoute(routeId) {
  if (!routeById.has(routeId)) return;
  state.selectedRouteId = routeId;
  renderSelectedRoute();
  updateUrlState();
}

function focusSelectedRoutePanel() {
  if (!window.matchMedia || !window.matchMedia("(max-width: 960px)").matches) return;
  const panel = document.querySelector(".map-panel");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusInitialMobileDeepLink(params) {
  if (!window.matchMedia || !window.matchMedia("(max-width: 960px)").matches) return;
  const target = params.route
    ? document.querySelector(".map-panel")
    : params.tab && params.tab !== "schedule"
      ? document.querySelector(".views-panel")
      : null;
  if (!target) return;
  window.setTimeout(() => {
    target.scrollIntoView({ behavior: "auto", block: "start" });
  }, 150);
}

function pickBackupRide() {
  const allowedEnergy = energyFilter.value;
  const completedRouteIds = getCompletedRouteIds();
  const pool = routes.filter(
    (route) => route.id !== state.selectedRouteId && (allowedEnergy === "all" || route.energy === allowedEnergy),
  );
  const freshPool = pool.filter((route) => !completedRouteIds.has(route.id));
  const candidates = freshPool.length ? freshPool : pool;
  if (!candidates.length) {
    showToast("No backup ride matches that filter.");
    return;
  }
  const next = candidates[Math.floor(Math.random() * candidates.length)];
  selectRoute(next.id);
  focusSelectedRoutePanel();
  showToast(`Backup ride: ${next.name}`);
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab").forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.id === `${tabName}Panel`;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
  updateUrlState();
}

function initEvents() {
  document.body.addEventListener("click", (event) => {
    const routeButton = event.target.closest("[data-route]");
    const doneButton = event.target.closest("[data-done-key]");
    const tabButton = event.target.closest("[data-tab]");
    const vibeButton = event.target.closest("[data-vibe]");
    const rsvpButton = event.target.closest("[data-rsvp-key]");
    const stravaButton = event.target.closest("[data-strava-launch]");
    const completionButton = event.target.closest("[data-toggle-route-complete]");
    const deleteCustomButton = event.target.closest("[data-delete-custom-route]");
    const disabledLink = event.target.closest("a.is-disabled");

    if (disabledLink) {
      event.preventDefault();
      return;
    }

    if (stravaButton) {
      openStravaApp(event);
      return;
    }

    if (doneButton) {
      const key = doneButton.dataset.doneKey;
      const routeId = doneButton.dataset.doneRoute;
      toggleRouteCompletion(routeId, key);
      renderAll();
      return;
    }

    if (completionButton) {
      toggleRouteCompletion(completionButton.dataset.routeId, completionButton.dataset.toggleRouteComplete);
      renderAll();
      return;
    }

    if (deleteCustomButton) {
      deleteCustomRoute(deleteCustomButton.dataset.deleteCustomRoute);
      return;
    }

    if (rsvpButton) {
      cycleRsvp(rsvpButton.dataset.rsvpKey, rsvpButton.dataset.riderIndex);
      renderWeek();
      renderSelectedRoute();
      return;
    }

    if (routeButton) {
      selectRoute(routeButton.dataset.route);
      focusSelectedRoutePanel();
      return;
    }

    if (tabButton) {
      setActiveTab(tabButton.dataset.tab);
      return;
    }

    if (vibeButton) {
      state.activeVibe = vibeButton.dataset.vibe;
      document.querySelectorAll(".filter-chip").forEach((button) => {
        button.classList.remove("is-active");
        button.setAttribute("aria-pressed", "false");
      });
      vibeButton.classList.add("is-active");
      vibeButton.setAttribute("aria-pressed", "true");
      renderRoutes();
      updateUrlState();
    }
  });

  document.querySelector(".tab-list").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll(".tab")];
    const currentIndex = tabs.findIndex((tab) => tab.classList.contains("is-active"));
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    event.preventDefault();
    tabs[nextIndex].focus();
    setActiveTab(tabs[nextIndex].dataset.tab);
  });

  dateInput.addEventListener("change", () => {
    renderAll();
    updateUrlState();
  });
  energyFilter.addEventListener("change", () => {
    renderWeek();
    updateUrlState();
  });
  document.body.addEventListener("input", (event) => {
    const overrideInput = event.target.closest("[data-ride-override]");
    const activityInput = event.target.closest("[data-activity-link]");
    if (overrideInput) {
      updateRideOverride(overrideInput.dataset.slotId, overrideInput.dataset.rideOverride, overrideInput.value);
      return;
    }
    if (activityInput) {
      updateActivityLink(activityInput.dataset.activityLink, activityInput.value);
    }
  });

  document.querySelector("#downloadCalendarButton").addEventListener("click", downloadCalendar);
  document.querySelector("#refreshPlanButton").addEventListener("click", refreshUpcomingPlan);
  startSyncButton.addEventListener("click", () => {
    createCrewSync().catch((error) => {
      syncState.busy = false;
      updateSyncControls("Could not start sync", "error");
      console.error(error);
      showToast("Crew sync failed.");
    });
  });
  copySyncLinkButton.addEventListener("click", () => {
    copyCrewSyncLink().catch((error) => {
      updateSyncControls("Copy failed", "error");
      console.error(error);
    });
  });
  pullSyncButton.addEventListener("click", () => {
    pullCrewSync({ quiet: false }).catch((error) => {
      updateSyncControls("Pull failed", "error");
      console.error(error);
    });
  });

  if (customRouteForm) {
    customRouteForm.addEventListener("submit", (event) => {
      event.preventDefault();
      addCustomRouteFromForm();
    });
  }

  document.querySelector("#randomRideButton").addEventListener("click", () => {
    pickBackupRide();
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    state.completed.clear();
    saveCompleted();
    renderAll();
  });

  riderInputs.forEach((input, index) => {
    input.value = state.riders[index] || defaultRiders[index];
    input.addEventListener("input", () => {
      state.riders[index] = input.value;
      saveRiders();
      renderSelectedRoute();
    });
  });

  Object.entries(preferenceInputs).forEach(([key, input]) => {
    input.value = state.preferences[key] || "";
    input.addEventListener("input", () => {
      state.preferences[key] = input.value;
      savePreferences();
      renderSelectedRoute();
    });
  });
}

function boot() {
  const params = getInitialParams();
  if (params.sync) setSyncId(params.sync);
  rebuildRouteLibrary();
  refreshSchedule({ preserve: true });
  dateInput.min = formatDateValue(summerStart);
  dateInput.max = formatDateValue(summerEnd);
  const today = clampDate(new Date());
  dateInput.value = params.date || formatDateValue(today);
  if (!dateInput.validity.valid) dateInput.value = formatDateValue(today);
  if (["all", "easy", "steady", "big"].includes(params.energy)) energyFilter.value = params.energy;
  if (params.route && routeById.has(params.route)) state.selectedRouteId = params.route;
  if (params.vibe && ["all", "water", "city", "green", "destination"].includes(params.vibe)) state.activeVibe = params.vibe;
  if (params.tab && ["schedule", "routes", "crew"].includes(params.tab)) state.activeTab = params.tab;
  renderCrewControls();
  initEvents();
  updateSyncControls();
  renderAll();
  setActiveTab(state.activeTab);
  safelyInitMap();
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const isActive = button.dataset.vibe === state.activeVibe;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (syncState.id) {
    window.setTimeout(() => startSyncPolling(), 0);
  }
  focusInitialMobileDeepLink(params);
}

try {
  boot();
} catch (error) {
  renderStartupError(error);
}
})();
