(() => {
const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const { routes, schedulePlan, sources } = window.RIDE_DATA;
const routeById = new Map(routes.map((route) => [route.id, route]));
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

function safeJsonStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    localStorage.removeItem(key);
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
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

function getOrCreateClientId() {
  const existing = localStorage.getItem("crewSyncClientId");
  if (existing) return existing;
  const next = crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem("crewSyncClientId", next);
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
};

const syncState = {
  id: initialSearchParams.get("sync") || localStorage.getItem("crewSyncBlobId") || "",
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
  weeknightTime: document.querySelector("#weeknightTime"),
  saturdayTime: document.querySelector("#saturdayTime"),
  meetSpot: document.querySelector("#meetSpot"),
  stravaClub: document.querySelector("#stravaClub"),
  photosAlbum: document.querySelector("#photosAlbum"),
};
const syncStatus = document.querySelector("#syncStatus");
const startSyncButton = document.querySelector("#startSyncButton");
const copySyncLinkButton = document.querySelector("#copySyncLinkButton");
const whatsAppSyncLink = document.querySelector("#whatsAppSyncLink");
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
  if (!plan.cadence?.length) throw new Error("Schedule plan needs at least one cadence day.");

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

  const earliestFinaleDate = addDays(cursor, plan.finaleRestDays ?? 0);
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
  const target = { easy: 0.2, steady: 0.55, big: 0.86 }[route.energy] ?? 0.5;
  return Math.abs(phase - target) * 5;
}

function pickAdaptiveRoute(pool, slot, slotIndex, totalSlots, previousRoute, seed) {
  if (!pool.length) throw new Error(`No adaptive route left for ${slot.date}.`);
  return pool
    .map((routeId) => {
      const route = routeById.get(routeId);
      const vibePenalty = previousRoute?.vibe === route.vibe ? 1.1 : 0;
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
  const knownRouteIds = new Set(routes.map((route) => route.id));
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

  let pool = routes
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
  validateScheduledRouteIds(new Set(routes.map((route) => route.id)), slots);
  return groupScheduleSlots(slots, schedulePlan.weekSize || 3);
}

function refreshSchedule({ preserve = true } = {}) {
  scheduleSlots = buildScheduleSlots(schedulePlan, routes);
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
  if (key.startsWith("route:")) return key.slice(6);
  const dateKeyMatch = key.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  if (dateKeyMatch) return dateKeyMatch[1];
  return key.split("-").slice(2).join("-");
}

function setSyncId(id) {
  syncState.id = id || "";
  if (syncState.id) {
    localStorage.setItem("crewSyncBlobId", syncState.id);
  } else {
    localStorage.removeItem("crewSyncBlobId");
  }
}

function getSyncEndpoint(id = syncState.id) {
  return `${syncApiBase}/${encodeURIComponent(id)}/${syncPath}`;
}

function getSyncLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("sync", syncState.id);
  url.searchParams.set("tab", "crew");
  return url.toString();
}

function getWhatsAppSyncUrl() {
  const text = `Gopher Summer Rides crew plan for Sri, Apurv, and Ayaan: ${getSyncLink()}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
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
  if (whatsAppSyncLink) {
    whatsAppSyncLink.href = isConnected ? getWhatsAppSyncUrl() : "#";
    whatsAppSyncLink.classList.toggle("is-disabled", !isConnected);
    whatsAppSyncLink.setAttribute("aria-disabled", String(!isConnected));
  }
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
  };
}

function persistLocalCrewState() {
  localStorage.setItem("completedRides", JSON.stringify([...state.completed]));
  localStorage.setItem("riders", JSON.stringify(state.riders));
  localStorage.setItem("ridePreferences", JSON.stringify(state.preferences));
  localStorage.setItem("rideRsvps", JSON.stringify(state.rsvps));
  localStorage.setItem("planAssignments", JSON.stringify(state.planAssignments));
  localStorage.setItem("planSeed", String(state.planSeed));
  localStorage.setItem("rideOverrides", JSON.stringify(state.rideOverrides));
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
    persistLocalCrewState();
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
    localStorage.setItem("crewSyncLastUpdatedAt", String(syncState.lastRemoteUpdatedAt));
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
  localStorage.setItem("crewSyncLastUpdatedAt", String(syncState.lastRemoteUpdatedAt));
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
  const id = `gopher-rides-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const response = await fetch(getSyncEndpoint(id), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`Sync create failed (${response.status})`);
  setSyncId(id);
  syncState.lastRemoteUpdatedAt = snapshot.updatedAt;
  localStorage.setItem("crewSyncLastUpdatedAt", String(syncState.lastRemoteUpdatedAt));
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

function isRideDone(slot) {
  return state.completed.has(rideKey(slot)) || getCompletedRouteIds().has(slot.routeId);
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
  localStorage.setItem("completedRides", JSON.stringify([...state.completed]));
  queueSyncPush();
}

function saveRiders() {
  localStorage.setItem("riders", JSON.stringify(state.riders));
  queueSyncPush();
}

function savePreferences() {
  localStorage.setItem("ridePreferences", JSON.stringify(state.preferences));
  queueSyncPush();
}

function saveRsvps() {
  localStorage.setItem("rideRsvps", JSON.stringify(state.rsvps));
  queueSyncPush();
}

function savePlanState() {
  localStorage.setItem("planAssignments", JSON.stringify(state.planAssignments));
  localStorage.setItem("planSeed", String(state.planSeed));
  queueSyncPush();
}

function saveRideOverrides() {
  localStorage.setItem("rideOverrides", JSON.stringify(state.rideOverrides));
  queueSyncPush();
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

function getRideMeetTime(slotOrDay) {
  const day = typeof slotOrDay === "string" ? slotOrDay : slotOrDay.day;
  const override = typeof slotOrDay === "string" ? null : state.rideOverrides[slotOrDay.id];
  if (override?.time) return override.time;
  return day === "Sat" ? state.preferences.saturdayTime : state.preferences.weeknightTime;
}

function getRideMeetSpot(slot) {
  if (slot && state.rideOverrides[slot.id]?.spot) return state.rideOverrides[slot.id].spot;
  return state.preferences.meetSpot;
}

function getRidePlanNote(slot) {
  if (!slot) return "";
  return state.rideOverrides[slot.id]?.note || "";
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
  return state.rsvps[key]?.[riderIndex] || "";
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
  if (getPhotosAlbumUrl()) lines.push(`Photos: ${getPhotosAlbumUrl()}`);
  lines.push(`Track on Strava after the ride. Plan: ${buildRouteUrl(route.id)}`);
  return lines.join("\n");
}

function getWhatsAppUrl(route) {
  return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppText(route))}`;
}

function getStravaClubUrl() {
  return state.preferences.stravaClub.startsWith("http") ? state.preferences.stravaClub : "";
}

function getPhotosAlbumUrl() {
  return state.preferences.photosAlbum?.startsWith("http") ? state.preferences.photosAlbum : "";
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
      return `
        <article class="ride-card">
          <div class="day-pill">${slot.label}</div>
          <div class="ride-main">
            <button type="button" class="route-select-link" data-route="${route.id}">
              <h3>${route.name}</h3>
              <p class="meta-line">
                <span>${route.miles} approx mi</span>
                <span>${route.surface}</span>
                <span class="badge">${route.energy}</span>
              </p>
            </button>
            <div class="rsvp-row" aria-label="${route.name} RSVPs">
              ${state.riders
                .map((name, index) => {
                  const status = getRsvp(key, index);
                  const label = rsvpLabels[status];
                  return `<button class="rsvp-chip ${status ? `is-${status}` : ""}" type="button" data-rsvp-key="${key}" data-rider-index="${index}" aria-label="${name || defaultRiders[index]} RSVP ${label}">${name || defaultRiders[index]}: ${label}</button>`;
                })
                .join("")}
            </div>
          </div>
          <button class="ride-action ${done ? "is-done" : ""}" type="button" data-done-key="${key}" data-done-route="${route.id}" title="Toggle done" aria-label="Mark ${route.name} ${done ? "incomplete" : "complete"}" aria-pressed="${done}">
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
            <button type="button" class="week-row" data-route="${route.id}">
              <span>${slot.label}</span>
              <strong>${route.name}${slot.isFinale ? ' <span class="finale-pill">Finale</span>' : ""}</strong>
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
        <button type="button" data-route="${route.id}">
          <h3>${route.name}</h3>
          <p class="meta-line">
            <span>${route.miles} approx mi</span>
            <span>${route.minutes} min</span>
            <span class="badge">${route.vibe}</span>
          </p>
          <p class="route-note">${route.note}</p>
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
  const percent = Math.round((completedCount / totalScheduledRides) * 100);
  doneCount.textContent = `${completedCount}/${totalScheduledRides} done`;
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
  const scheduledText = scheduled ? `${scheduled.slot.label}, ${formatRideDate(scheduled.slot)}` : "Backup ride";
  const rideOverride = scheduled ? state.rideOverrides[scheduled.slot.id] || {} : {};
  const meetTime = scheduled ? getRideMeetTime(scheduled.slot) : state.preferences.weeknightTime;
  const meetSpot = scheduled ? getRideMeetSpot(scheduled.slot) : state.preferences.meetSpot;
  const routeSources = (route.sourceKeys || [])
    .map((key) => sources[key])
    .filter(Boolean);
  const caveat = route.caveat ? `<p class="route-caveat">${route.caveat}</p>` : "";
  selectedTitle.textContent = route.name;
  selectedVibe.textContent = route.vibe;
  selectedMiles.textContent = route.miles;
  selectedTime.textContent = route.minutes;
  selectedEnergy.textContent = route.energy;
  detailDock.innerHTML = `
    <div>
      <p class="eyebrow">${route.start}</p>
      <h2>${route.surface}</h2>
      <p>${route.note}</p>
      ${caveat}
      <p class="data-note">${route.distanceMethod}. ${route.geometryPrecision}. Last verified ${route.lastVerified}.</p>
    </div>
    <div>
      <p class="eyebrow">${scheduledText}</p>
      <div class="stop-list">${route.stops.map((stop) => `<span>${stop}</span>`).join("")}</div>
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
      <div class="action-grid">
        <a class="inline-action action-whatsapp" href="${getWhatsAppUrl(route)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="message-circle"></i>
          Send to WhatsApp
        </a>
        <a class="inline-action action-strava" href="${getStravaLaunchUrl()}" data-strava-launch>
          <i data-lucide="activity"></i>
          Start Strava
        </a>
        <a class="inline-action" href="${getGoogleMapsUrl(route)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="map-pin"></i>
          Map search
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
      </div>
      <div class="source-links">
        ${routeSources.map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a>`).join("")}
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
    }).bindPopup(`<strong>${route.name}</strong><br>${route.start}`),
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

function selectRoute(routeId) {
  if (!routeById.has(routeId)) return;
  state.selectedRouteId = routeId;
  renderSelectedRoute();
  updateUrlState();
}

function focusSelectedRoutePanel() {
  if (!window.matchMedia("(max-width: 960px)").matches) return;
  document.querySelector(".map-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const existingKeys = [...state.completed].filter((completedKey) => routeIdFromRideKey(completedKey) === routeId);
      if (state.completed.has(key) || existingKeys.length) {
        existingKeys.forEach((completedKey) => state.completed.delete(completedKey));
        state.completed.delete(key);
      } else {
        state.completed.add(key);
      }
      saveCompleted();
      renderAll();
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
    if (!overrideInput) return;
    updateRideOverride(overrideInput.dataset.slotId, overrideInput.dataset.rideOverride, overrideInput.value);
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
  if (state.riders.join("|") === "Student 1|Student 2|Student 3") {
    state.riders = defaultRiders;
    saveRiders();
  }
  if (state.preferences.weeknightTime === "18:00" || state.preferences.saturdayTime === "10:00") {
    if (state.preferences.weeknightTime === "18:00") state.preferences.weeknightTime = defaultPreferences.weeknightTime;
    if (state.preferences.saturdayTime === "10:00") state.preferences.saturdayTime = defaultPreferences.saturdayTime;
    savePreferences();
  }
  renderCrewControls();
  initMap();
  initEvents();
  updateSyncControls();
  renderAll();
  setActiveTab(state.activeTab);
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const isActive = button.dataset.vibe === state.activeVibe;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (syncState.id) startSyncPolling();
}

boot();
})();
