// Element references
const reportTitleEl = document.getElementById("reportTitle");
const orgIdEl = document.getElementById("orgId");
const clientNameEl = document.getElementById("clientName");
const usefulLinksEl = document.getElementById("usefulLinks");
const mentionsEl = document.getElementById("mentions");
const descriptionEl = document.getElementById("description");
const generateBtnEl = document.getElementById("generateBtn");
const resetBtnEl = document.getElementById("resetBtn");
const copyBtnEl = document.getElementById("copyBtn");
const previewContainerEl = document.getElementById("previewContainer");
const statusMessageEl = document.getElementById("statusMessage");
const snapshotInfoEl = document.getElementById("snapshotInfo");
const graphqlInfoEl = document.getElementById("graphqlInfo");
const graphqlErrorsListEl = document.getElementById("graphqlErrorsList");

let lastSnapshot = null;
let lastThreadText = "";

// Storage keys
const STORAGE_PREFIX = "engaged_incident_report_";

function showStatus(message, type = "success") {
  statusMessageEl.textContent = message;
  statusMessageEl.classList.remove("success", "error");
  statusMessageEl.classList.add(type, "show");
  setTimeout(() => statusMessageEl.classList.remove("show"), 4000);
}

function extractOrgIdFromUrl(url) {
  const match = url.match(/\/org\/([a-f0-9]+)/i);
  return match ? match[1] : "";
}

function loadFromStorage() {
  const stored = {};
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      const fieldName = key.replace(STORAGE_PREFIX, "");
      stored[fieldName] = localStorage.getItem(key);
    }
  }
  return stored;
}

function saveToStorage() {
  localStorage.setItem(STORAGE_PREFIX + "title", reportTitleEl.value);
  localStorage.setItem(STORAGE_PREFIX + "orgId", orgIdEl.value);
  localStorage.setItem(STORAGE_PREFIX + "clientName", clientNameEl.value);
  localStorage.setItem(STORAGE_PREFIX + "usefulLinks", usefulLinksEl.value);
  localStorage.setItem(STORAGE_PREFIX + "mentions", mentionsEl.value);
  localStorage.setItem(STORAGE_PREFIX + "description", descriptionEl.value);
}

function clearStorage() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

function restoreFromStorage() {
  const stored = loadFromStorage();
  if (stored.title) reportTitleEl.value = stored.title;
  if (stored.orgId) orgIdEl.value = stored.orgId;
  if (stored.clientName) clientNameEl.value = stored.clientName;
  if (stored.usefulLinks) usefulLinksEl.value = stored.usefulLinks;
  if (stored.mentions) mentionsEl.value = stored.mentions;
  if (stored.description) descriptionEl.value = stored.description;
}

function renderSnapshotInfo() {
  if (!lastSnapshot) {
    snapshotInfoEl.innerHTML = `<strong>Warning:</strong> No incident data loaded. Create a snapshot in the extension popup first.`;
    return;
  }

  const tabUrl = lastSnapshot.tab?.url || "N/A";
  const tabTitle = lastSnapshot.tab?.title || "N/A";
  const eventCount = lastSnapshot.eventCount || 0;
  const errorCount = lastSnapshot.summary?.errorCount || 0;
  const networkCount = lastSnapshot.summary?.networkCount || 0;
  const graphqlErrorCount = lastSnapshot.summary?.graphqlErrorCount || 0;

  snapshotInfoEl.innerHTML = `
    <strong>Incident ID:</strong> ${lastSnapshot.id}<br/>
    <strong>Page:</strong> ${tabTitle}<br/>
    <strong>URL:</strong> ${tabUrl.slice(0, 70)}${tabUrl.length > 70 ? "..." : ""}<br/>
    <strong>Events captured:</strong> ${eventCount} (${errorCount} errors, ${networkCount} network, ${graphqlErrorCount} GraphQL)
  `;

  // Auto-fill OrgId from URL
  if (!orgIdEl.value) {
    const autoOrgId = extractOrgIdFromUrl(tabUrl);
    if (autoOrgId) {
      orgIdEl.value = autoOrgId;
    }
  }

  // Auto-fill title from snapshot
  if (!reportTitleEl.value && lastSnapshot.context?.title) {
    reportTitleEl.value = lastSnapshot.context.title;
  }

  // Show GraphQL errors if present
  renderGraphqlErrors();
}

function extractGraphqlErrors() {
  if (!lastSnapshot || !lastSnapshot.events) return [];

  return lastSnapshot.events
    .filter(event => event.type && event.type.includes("graphql"))
    .map(event => ({
      operation: event.payload?.operationName || "Unknown",
      query: event.payload?.query ? event.payload.query.substring(0, 100) : "N/A",
      status: event.payload?.status || "Unknown",
      error: event.payload?.error || event.payload?.response?.error || "Error occurred"
    }))
    .filter(err => err.status && err.status >= 400);
}

function renderGraphqlErrors() {
  const graphqlErrors = extractGraphqlErrors();
  
  if (graphqlErrors.length === 0) {
    graphqlInfoEl.classList.remove("show");
    return;
  }

  graphqlInfoEl.classList.add("show");
  graphqlErrorsListEl.innerHTML = graphqlErrors
    .map(err => `
      <div class="graphql-error-item">
        <strong>Operation:</strong> ${err.operation}<br/>
        <strong>Status:</strong> ${err.status}<br/>
        <strong>Error:</strong> ${err.error}
      </div>
    `)
    .join("");
}

function generateThreadPreview() {
  if (!lastSnapshot) {
    showStatus("No incident data available", "error");
    return;
  }

  saveToStorage();

  const title = reportTitleEl.value.trim() || "Incident Report";
  const orgId = orgIdEl.value.trim();
  const clientName = clientNameEl.value.trim();
  const links = usefulLinksEl.value
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  const mentions = mentionsEl.value
    .trim()
    .split(/[,\n]/)
    .map((m) => m.trim())
    .filter((m) => m);
  const description = descriptionEl.value.trim() || "Incident captured by monitoring system";

  // Build report
  const lines = [
    `Incident Report: ${title}`,
    "",
    `Status: OPEN`,
    `Severity: HIGH`,
    ""
  ];

  if (orgId) {
    lines.push(`Organization ID: ${orgId}`);
  }
  if (clientName) {
    lines.push(`Client: ${clientName}`);
  }

  lines.push(`Incident ID: ${lastSnapshot.id}`);
  lines.push(`Captured: ${new Date(lastSnapshot.createdAt).toLocaleString("en-US")}`);
  lines.push("");

  // Add stakeholders
  if (mentions.length > 0) {
    lines.push(`Stakeholders: ${mentions.join(", ")}`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Summary:");
  lines.push(description);
  lines.push("");

  // Add GraphQL errors if present
  const graphqlErrors = extractGraphqlErrors();
  if (graphqlErrors.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("GraphQL Errors:");
    graphqlErrors.forEach((err, i) => {
      lines.push(`${i + 1}. Operation: ${err.operation}`);
      lines.push(`   Status: ${err.status}`);
      lines.push(`   Error: ${err.error}`);
      lines.push("");
    });
  }

  // Add technical details
  lines.push("---");
  lines.push("");
  lines.push("Technical Information:");
  lines.push(`Total Events: ${lastSnapshot.eventCount}`);
  if (lastSnapshot.summary?.errorCount > 0) {
    lines.push(`Runtime Errors: ${lastSnapshot.summary.errorCount}`);
  }
  if (lastSnapshot.summary?.networkCount > 0) {
    lines.push(`Network Calls: ${lastSnapshot.summary.networkCount}`);
  }
  lines.push(`Page: ${lastSnapshot.tab?.title || "N/A"}`);
  lines.push(`URL: ${lastSnapshot.tab?.url || "N/A"}`);

  // Add reference links
  if (links.length > 0) {
    lines.push("");
    lines.push("Reference Links:");
    links.forEach((link) => {
      lines.push(`- ${link}`);
    });
  }

  lastThreadText = lines.join("\n");

  // Render preview
  previewContainerEl.innerHTML = `
    <div class="preview-label">Formatted Report</div>
    <div class="slack-preview">${escapeHtml(lastThreadText)}</div>
  `;

  copyBtnEl.disabled = false;
  showStatus("Report generated successfully");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function reset() {
  reportTitleEl.value = "";
  orgIdEl.value = "";
  clientNameEl.value = "";
  usefulLinksEl.value = "";
  mentionsEl.value = "";
  descriptionEl.value = "";
  previewContainerEl.innerHTML = `<div class="empty-state">Complete the form and click "Generate Report" to see the formatted output</div>`;
  copyBtnEl.disabled = true;
  clearStorage();
  showStatus("Form cleared");
}

function clearStorage() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

function restoreFromStorage() {
  const stored = loadFromStorage();
  if (stored.title) reportTitleEl.value = stored.title;
  if (stored.orgId) orgIdEl.value = stored.orgId;
  if (stored.clientName) clientNameEl.value = stored.clientName;
  if (stored.usefulLinks) usefulLinksEl.value = stored.usefulLinks;
  if (stored.mentions) mentionsEl.value = stored.mentions;
  if (stored.description) descriptionEl.value = stored.description;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
generateBtnEl.addEventListener("click", generateThreadPreview);
resetBtnEl.addEventListener("click", reset);
copyBtnEl.addEventListener("click", copyToClipboard);

// Auto-save on input
[reportTitleEl, orgIdEl, clientNameEl, usefulLinksEl, mentionsEl, descriptionEl].forEach((el) => {
  el.addEventListener("blur", saveToStorage);
});

// Listen for snapshot from extension
chrome.runtime.onMessage?.addListener?.((message, sender, sendResponse) => {
  if (message?.type === "SNAPSHOT_FOR_REPORT") {
    lastSnapshot = message.snapshot;
    renderSnapshotInfo();
    showStatus("Incident data received");
    sendResponse({ ok: true });
  }
});

// Load snapshot from sessionStorage (fallback)
function loadSnapshotFromSession() {
  const stored = sessionStorage.getItem("engaged_snapshot");
  if (stored) {
    try {
      lastSnapshot = JSON.parse(stored);
      renderSnapshotInfo();
      sessionStorage.removeItem("engaged_snapshot");
    } catch {
      // ignore
    }
  }
}

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  restoreFromStorage();
  loadSnapshotFromSession();

  // If no snapshot yet, ask extension
  if (!lastSnapshot) {
    chrome.runtime.sendMessage?.({ type: "GET_LAST_SNAPSHOT" }, (response) => {
      if (response?.ok && response?.snapshot) {
        lastSnapshot = response.snapshot;
        renderSnapshotInfo();
      }
    });
  } else {
    renderSnapshotInfo();
  }
});
