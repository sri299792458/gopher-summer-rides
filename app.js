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
const seasonProgress = document.querySelector("#seasonProgress");
const meterFill = document.querySelector("#meterFill");
const riderInputs = [document.querySelector("#riderOne"), document.querySelector("#riderTwo"), document.querySelector("#riderThree")];

const summerStart = new Date("2026-05-18T12:00:00");
const summerEnd = new Date("2026-08-09T12:00:00");
const totalScheduledRides = schedule.reduce((sum, week) => sum + Object.keys(week.rides).length, 0);
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

function renderWeek() {
  const week = getWeekForDate(dateInput.value);
  weekLabel.textContent = `Week ${week.week} / ${formatWeekRange(week.start)}`;
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
          <button class="ride-action ${done ? "is-done" : ""}" type="button" data-done-key="${key}" title="Toggle done" aria-label="Toggle ${route.name} done" aria-pressed="${done}">
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
              <span>${state.completed.has(key) ? "Done" : `${route.miles} mi`}</span>
            </button>
          `;
        })
        .join("");
      return `
        <article class="schedule-week ${week.week === currentWeek ? "is-current" : ""}">
          <h3>Week ${week.week} <span class="meta-line">${formatWeekRange(week.start)}</span></h3>
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
}

function renderSelectedRoute() {
  const route = routeById.get(state.selectedRouteId);
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
      <p class="data-note">${route.distanceMethod}. ${route.geometryPrecision}.</p>
    </div>
    <div>
      <p class="eyebrow">Stops</p>
      <div class="stop-list">${route.stops.map((stop) => `<span>${stop}</span>`).join("")}</div>
      <div class="source-links">
        ${routeSources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>`).join("")}
      </div>
    </div>
  `;
  drawRoute(route);
  renderRoutes();
  renderIcons();
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

function initEvents() {
  document.body.addEventListener("click", (event) => {
    const routeButton = event.target.closest("[data-route]");
    const doneButton = event.target.closest("[data-done-key]");
    const tabButton = event.target.closest("[data-tab]");
    const vibeButton = event.target.closest("[data-vibe]");

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

    if (routeButton) {
      selectRoute(routeButton.dataset.route);
      return;
    }

    if (tabButton) {
      document.querySelectorAll(".tab").forEach((button) => {
        button.classList.remove("is-active");
        button.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
      tabButton.classList.add("is-active");
      tabButton.setAttribute("aria-selected", "true");
      document.querySelector(`#${tabButton.dataset.tab}Panel`).classList.add("is-active");
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
    }
  });

  dateInput.addEventListener("change", renderAll);
  energyFilter.addEventListener("change", renderWeek);

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
  const today = clampDate(new Date());
  dateInput.value = formatDateValue(today);
  initMap();
  initEvents();
  renderAll();
}

boot();
})();
