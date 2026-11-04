const element = (selector) => document.querySelector(selector);
const elements = (selector) => [...document.querySelectorAll(selector)];

const state = {
  report: null,
  sites: [],
  view: "overview",
  cursors: [null],
  page: 0,
};

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = new Date();
const rangeStart = new Date(today.getFullYear(), today.getMonth() - 6, 1);
element("#from").value = localIsoDate(rangeStart);
element("#to").value = localIsoDate(today);

async function getJson(path) {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

function showNotice(message, kind = "") {
  const notice = element("#notice");
  notice.textContent = message;
  notice.className = `notice ${kind}`.trim();
}

function hideNotice() {
  element("#notice").className = "notice hidden";
}

function formatMinutes(value) {
  if (value == null) return "—";
  if (value < 60) return `${value}m`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function formatPercent(numerator, denominator) {
  return denominator === 0 ? "—" : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function siteName(siteId) {
  return (
    state.sites.find((site) => site.id === Number(siteId))?.name ??
    `Site ${siteId}`
  );
}

function appendCell(row, value, className) {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function appendBadge(row, value) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `badge ${value == null ? "null" : value ? "yes" : "no"}`;
  badge.textContent = value == null ? "—" : value ? "Yes" : "No";
  cell.append(badge);
  row.append(cell);
}

function showEmptyRow(body, columnCount, message) {
  const row = document.createElement("tr");
  const cell = appendCell(row, message, "empty-row");
  cell.colSpan = columnCount;
  body.replaceChildren(row);
}

function rowsForOverview() {
  const siteId = element("#overview-site").value;
  return siteId
    ? state.report.requests.filter((row) => row.site_id === Number(siteId))
    : state.report.requests;
}

function renderOverview() {
  const rows = rowsForOverview();
  const responded = rows.filter((row) => row.response_business_minutes != null);
  const targeted = rows.filter((row) => row.within_target != null);
  const completed = rows.filter((row) => row.completed_late != null);
  const responseTotal = responded.reduce(
    (total, row) => total + row.response_business_minutes,
    0,
  );

  element("#metric-requests").textContent = rows.length.toLocaleString();
  element("#metric-response").textContent = formatMinutes(
    responded.length ? Math.round(responseTotal / responded.length) : null,
  );
  element("#metric-target").textContent = formatPercent(
    targeted.filter((row) => row.within_target).length,
    targeted.length,
  );
  element("#metric-late").textContent = formatPercent(
    completed.filter((row) => row.completed_late).length,
    completed.length,
  );

  const responders = new Map();
  for (const row of rows) {
    if (row.responder_id == null) continue;
    const current = responders.get(row.responder_id) ?? {
      name: row.responder ?? `Staff ${row.responder_id}`,
      requests: 0,
      within: 0,
      late: 0,
    };
    current.requests += 1;
    if (row.within_target === true) current.within += 1;
    if (row.completed_late === true) current.late += 1;
    responders.set(row.responder_id, current);
  }

  const body = element("#responder-rows");
  body.replaceChildren();
  for (const responder of [...responders.values()].sort(
    (left, right) => right.requests - left.requests,
  )) {
    const row = document.createElement("tr");
    appendCell(row, responder.name);
    appendCell(row, responder.requests.toLocaleString());
    appendCell(row, responder.within.toLocaleString());
    appendCell(row, responder.late.toLocaleString());
    body.append(row);
  }
  if (body.children.length === 0) showEmptyRow(body, 4, "No responder data in this range.");
}

function fillFilterOptions() {
  const reportSiteIds = new Set(
    state.report.requests.map((row) => row.site_id),
  );
  const sites = state.sites.filter((site) => reportSiteIds.has(site.id));
  const responders = new Map();
  for (const row of state.report.requests) {
    if (row.responder_id != null) responders.set(row.responder_id, row.responder);
  }

  for (const selector of ["#overview-site", "#site-filter"]) {
    const select = element(selector);
    const current = select.value;
    select.replaceChildren(new Option("All sites", ""));
    for (const site of sites) {
      select.add(new Option(site.name, String(site.id)));
    }
    select.value = current;
  }

  const responderSelect = element("#responder-filter");
  const currentResponder = responderSelect.value;
  responderSelect.replaceChildren(new Option("All responders", ""));
  for (const [id, name] of [...responders].sort((left, right) =>
    (left[1] ?? "").localeCompare(right[1] ?? ""),
  )) {
    responderSelect.add(new Option(name ?? `Staff ${id}`, String(id)));
  }
  responderSelect.value = currentResponder;
}

async function loadReport() {
  showNotice("Loading SLA report…");
  const parameters = new URLSearchParams({
    from: element("#from").value,
    to: element("#to").value,
  });
  try {
    state.report = await getJson(`/api/sla-report?${parameters}`);
    fillFilterOptions();
    renderOverview();
    hideNotice();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function loadSites() {
  const result = await getJson("/api/sites");
  state.sites = result.data;
}

function requestParameters() {
  const parameters = new URLSearchParams({
    from: element("#from").value,
    to: element("#to").value,
    sort: element("#sort-filter").value,
    limit: "50",
  });
  for (const [selector, name] of [
    ["#site-filter", "site_id"],
    ["#responder-filter", "responder_id"],
    ["#target-filter", "within_target"],
    ["#late-filter", "late"],
  ]) {
    const value = element(selector).value;
    if (value) parameters.set(name, value);
  }
  const cursor = state.cursors[state.page];
  if (cursor) parameters.set("cursor", cursor);
  return parameters;
}

async function loadRequests() {
  showNotice("Loading requests…");
  try {
    const result = await getJson(`/api/requests?${requestParameters()}`);
    const body = element("#request-rows");
    body.replaceChildren();
    for (const request of result.data) {
      const row = document.createElement("tr");
      appendCell(row, `#${request.id}`);
      appendCell(row, siteName(request.site_id));
      appendCell(row, request.responder ?? "—");
      appendCell(row, formatMinutes(request.response_business_minutes));
      appendBadge(row, request.within_target);
      appendBadge(row, request.completed_late);
      body.append(row);
    }
    if (body.children.length === 0) showEmptyRow(body, 6, "No requests match these filters.");

    if (result.next_cursor) state.cursors[state.page + 1] = result.next_cursor;
    else state.cursors.length = state.page + 1;
    element("#previous-page").disabled = state.page === 0;
    element("#next-page").disabled = result.next_cursor == null;
    element("#page-number").textContent = `Page ${state.page + 1}`;
    hideNotice();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function resetRequestWalk() {
  state.page = 0;
  state.cursors = [null];
}

async function checkReadiness() {
  try {
    const response = await fetch("/ready");
    const body = await response.json();
    const status = element("#sync-status");
    status.classList.toggle("ready", body.ready === true);
    status.lastElementChild.textContent = body.ready ? "Live data" : "Initial sync running";
  } catch {
    element("#sync-status").lastElementChild.textContent = "Service unavailable";
  }
}

elements(".nav-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    elements(".nav-button").forEach((item) => item.classList.toggle("active", item === button));
    elements(".view").forEach((view) => view.classList.toggle("active", view.id === `${state.view}-view`));
    element("#page-title").textContent = state.view === "overview" ? "SLA overview" : "Request browser";
    element("#page-description").textContent = state.view === "overview"
      ? "Response and completion performance across all sites."
      : "Filter, sort, and review individual SLA outcomes.";
    if (state.view === "requests") loadRequests();
  });
});

element("#overview-site").addEventListener("change", renderOverview);
elements("#requests-view select").forEach((select) => {
  select.addEventListener("change", () => {
    resetRequestWalk();
    loadRequests();
  });
});
element("#refresh").addEventListener("click", async () => {
  resetRequestWalk();
  await loadSites();
  await loadReport();
  if (state.view === "requests") await loadRequests();
  checkReadiness();
});
element("#previous-page").addEventListener("click", () => {
  if (state.page > 0) state.page -= 1;
  loadRequests();
});
element("#next-page").addEventListener("click", () => {
  state.page += 1;
  loadRequests();
});

async function bootstrap() {
  checkReadiness();
  try {
    await loadSites();
    await loadReport();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

bootstrap();
