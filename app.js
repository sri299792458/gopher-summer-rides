(() => {
const { routes, schedule, sources } = window.RIDE_DATA;
const routeById = new Map(routes.map((route) => [route.id, route]));

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

const state = {
  selectedRouteId: "stone-arch-boom",
  activeVibe: "all",
  activeTab: "schedule",
  completed: new Set(safeArrayStorage("completedRides", [])),
  riders: safeArrayStorage("riders", ["Student 1", "Student 2", "Student 3"]),
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
const toast = document.querySelector("#toast");

const summerStart = new Date("2026-05-18T12:00:00");
const summerEnd = new Date("2026-08-09T12:00:00");
const totalScheduledRides = schedule.reduce((sum, week) => sum + Object.keys(week.rides).length, 0);
const dayOffsets = { Tue: 1, Thu: 3, Sat: 5 };
const rideStartTimes = { Tue: "180000", Thu: "180000", Sat: "100000" };
const weekThemes = {
  1: "Campus river orientation",
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
  12: "Big finale trailheads",
};
let map;
let routeLayer;
let markerLayer;

function clampDate(date) {
  if (date < summerStart) return summerStart;
  if (date > summerEnd) return summerEnd;
  return date;
}

function formatDateValue(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekForDate(value) {
  const date = clampDate(new Date(`${value}T12:00:00`));
  const diff = date - summerStart;
  const weekIndex = Math.min(11, Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000))));
  return schedule[weekIndex];
}

function formatWeekRange(startValue) {
  const start = new Date(`${startValue}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const month = start.toLocaleString("en-US", { month: "short" });
  const endMonth = end.toLocaleString("en-US", { month: "short" });
  return `${month} ${start.getDate()}-${endMonth} ${end.getDate()}`;
}

function rideKey(weekNumber, day, routeId) {
  return `${weekNumber}-${day}-${routeId}`;
}

function saveCompleted() {
  localStorage.setItem("completedRides", JSON.stringify([...state.completed]));
}

function saveRiders() {
  localStorage.setItem("riders", JSON.stringify(state.riders));
}

function getInitialParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    route: params.get("route"),
    tab: params.get("tab"),
    vibe: params.get("vibe"),
    energy: params.get("energy"),
    date: params.get("date"),
  };
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.selectedRouteId !== "stone-arch-boom") params.set("route", state.selectedRouteId);
  if (state.activeTab !== "schedule") params.set("tab", state.activeTab);
  if (state.activeVibe !== "all") params.set("vibe", state.activeVibe);
  if (energyFilter.value !== "all") params.set("energy", energyFilter.value);
  if (dateInput.value !== formatDateValue(clampDate(new Date()))) params.set("date", dateInput.value);
  const next = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
  window.history.replaceState(null, "", next);
}

function buildRouteUrl(routeId) {
  const url = new URL("https://sri299792458.github.io/gopher-summer-rides/");
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

function getRideDate(weekStart, day) {
  const date = new Date(`${weekStart}T12:00:00`);
  date.setDate(date.getDate() + dayOffsets[day]);
  return date;
}

function formatRideDate(weekStart, day) {
  const date = getRideDate(weekStart, day);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSelectedScheduleSlot(routeId) {
  for (const week of schedule) {
    for (const [day, scheduledRouteId] of Object.entries(week.rides)) {
      if (scheduledRouteId === routeId) {
        return { week, day, date: getRideDate(week.start, day) };
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

function buildRideText(route) {
  const slot = getSelectedScheduleSlot(route.id);
  const when = slot ? `${slot.day}, ${formatRideDate(slot.week.start, slot.day)}` : "summer 2026";
  const stops = route.stops.join(", ");
  return `Gopher Summer Rides: ${route.name} on ${when}. ${route.miles} approx mi, ${route.energy}, ${route.surface}. Stops: ${stops}. Plan: https://sri299792458.github.io/gopher-summer-rides/`;
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast(successMessage);
  } catch {
    showToast("Copy failed. Select the text manually.");
  }
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

function buildCalendarIcs() {
  const events = schedule.flatMap((week) =>
    Object.entries(week.rides).map(([day, routeId]) => {
      const route = routeById.get(routeId);
      const date = getRideDate(week.start, day);
      const startTime = rideStartTimes[day];
      const start = formatIcsDate(date, startTime);
      const end = addMinutesToIcs(date, startTime, route.minutes);
      const description = `${route.miles} approximate miles. ${route.note} Stops: ${route.stops.join(", ")}. Check official sources before rolling.`;
      return [
        "BEGIN:VEVENT",
        `UID:gopher-summer-rides-${week.week}-${day}-${route.id}@gopher-summer-rides`,
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
  const entries = Object.entries(week.rides)
    .map(([day, routeId]) => ({ day, route: routeById.get(routeId) }))
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
    .map(({ day, route }) => {
      const key = rideKey(week.week, day, route.id);
      const done = state.completed.has(key);
      return `
        <article class="ride-card">
          <div class="day-pill">${day}</div>
          <button type="button" class="route-select-link" data-route="${route.id}">
            <h3>${route.name}</h3>
            <p class="meta-line">
              <span>${route.miles} approx mi</span>
              <span>${route.surface}</span>
              <span class="badge">${route.energy}</span>
            </p>
          </button>
          <button class="ride-action ${done ? "is-done" : ""}" type="button" data-done-key="${key}" title="Toggle done" aria-label="Mark ${route.name} ${done ? "incomplete" : "complete"}" aria-pressed="${done}">
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
      const rows = Object.entries(week.rides)
        .map(([day, routeId]) => {
          const route = routeById.get(routeId);
          const key = rideKey(week.week, day, route.id);
          return `
            <button type="button" class="week-row" data-route="${route.id}">
              <span>${day}</span>
              <strong>${route.name}</strong>
              <span>${state.completed.has(key) ? "Done" : `${formatRideDate(week.start, day)} - ${route.miles} mi`}</span>
            </button>
          `;
        })
        .join("");
      return `
        <article class="schedule-week ${week.week === currentWeek ? "is-current" : ""}">
          <h3>Week ${week.week} <span class="meta-line">${formatWeekRange(week.start)} - ${weekThemes[week.week]}</span></h3>
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
  const completedDetails = [...state.completed]
    .map((key) => {
      const routeId = key.split("-").slice(2).join("-");
      return routeById.get(routeId);
    })
    .filter(Boolean);

  const totalMiles = completedDetails.reduce((sum, route) => sum + route.miles, 0);
  const longest = completedDetails.reduce((max, route) => Math.max(max, route.miles), 0);
  const percent = Math.round((state.completed.size / totalScheduledRides) * 100);
  doneCount.textContent = `${state.completed.size}/${totalScheduledRides} done`;
  milesDone.textContent = totalMiles;
  ridesDone.textContent = state.completed.size;
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
  const slot = getSelectedScheduleSlot(route.id);
  const scheduledText = slot ? `${slot.day}, ${formatRideDate(slot.week.start, slot.day)}` : "Backup ride";
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
      <div class="action-grid">
        <button class="inline-action" type="button" data-copy-ride="${route.id}">
          <i data-lucide="messages-square"></i>
          Copy ride text
        </button>
        <button class="inline-action" type="button" data-copy-route-link="${route.id}">
          <i data-lucide="link"></i>
          Copy route link
        </button>
        <a class="inline-action" href="${getGoogleMapsUrl(route)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="map-pin"></i>
          Map search
        </a>
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
  state.selectedRouteId = routeId;
  renderSelectedRoute();
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
    const copyRideButton = event.target.closest("[data-copy-ride]");
    const copyRouteLinkButton = event.target.closest("[data-copy-route-link]");

    if (doneButton) {
      const key = doneButton.dataset.doneKey;
      if (state.completed.has(key)) {
        state.completed.delete(key);
      } else {
        state.completed.add(key);
      }
      saveCompleted();
      renderAll();
      return;
    }

    if (copyRideButton) {
      const route = routeById.get(copyRideButton.dataset.copyRide);
      copyText(buildRideText(route), "Ride text copied.");
      return;
    }

    if (copyRouteLinkButton) {
      copyText(buildRouteUrl(copyRouteLinkButton.dataset.copyRouteLink), "Route link copied.");
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

  document.querySelector("#downloadCalendarButton").addEventListener("click", downloadCalendar);

  document.querySelector("#copyLiveLinkButton").addEventListener("click", () => {
    copyText("https://sri299792458.github.io/gopher-summer-rides/", "Live link copied.");
  });

  document.querySelector("#randomRideButton").addEventListener("click", () => {
    const pool = energyFilter.value === "all" ? routes : routes.filter((route) => route.energy === energyFilter.value);
    const next = pool[Math.floor(Math.random() * pool.length)];
    selectRoute(next.id);
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    state.completed.clear();
    saveCompleted();
    renderAll();
  });

  riderInputs.forEach((input, index) => {
    input.value = state.riders[index] || `Student ${index + 1}`;
    input.addEventListener("input", () => {
      state.riders[index] = input.value;
      saveRiders();
    });
  });
}

function boot() {
  const params = getInitialParams();
  const today = clampDate(new Date());
  dateInput.value = params.date || formatDateValue(today);
  if (!dateInput.validity.valid) dateInput.value = formatDateValue(today);
  if (["all", "easy", "steady", "big"].includes(params.energy)) energyFilter.value = params.energy;
  if (params.route && routeById.has(params.route)) state.selectedRouteId = params.route;
  if (params.vibe && ["all", "water", "city", "green", "destination"].includes(params.vibe)) state.activeVibe = params.vibe;
  if (params.tab && ["schedule", "routes", "crew", "share"].includes(params.tab)) state.activeTab = params.tab;
  initMap();
  initEvents();
  renderAll();
  setActiveTab(state.activeTab);
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const isActive = button.dataset.vibe === state.activeVibe;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

boot();
})();
