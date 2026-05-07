const statusEl = document.getElementById("status");
const endpointUrlEl = document.getElementById("endpointUrl");
const endpointTokenEl = document.getElementById("endpointToken");
const autoSendEl = document.getElementById("autoSend");
const snapshotOutputEl = document.getElementById("snapshotOutput");
const openReportBtnEl = document.getElementById("openReportBtn");

let lastSnapshot = null;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// TAB NAVIGATION
function switchTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".tab-button").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
  event.target.classList.add("active");
}

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// OPEN REPORT PAGE
function openReportPage() {
  if (!lastSnapshot) {
    setStatus("Create a snapshot first", true);
    return;
  }

  // Open report.html in new tab
  const reportUrl = chrome.runtime.getURL("report.html");
  chrome.tabs.create({ url: reportUrl }, (tab) => {
    // Send snapshot to report page
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, {
        type: "SNAPSHOT_FOR_REPORT",
        snapshot: lastSnapshot
      });
    }, 500);
  });
}

async function refreshStatus() {
  const result = await sendMessage({ type: "GET_STATUS" });
  if (!result?.ok) {
    setStatus(`Error: ${result?.error || "unknown"}`, true);
    return;
  }
  endpointUrlEl.value = result.settings.endpointUrl || "";
  endpointTokenEl.value = result.settings.endpointToken || "";
  autoSendEl.checked = !!result.settings.autoSend;
  setStatus(`Tab ${result.tabId || "-"} | Events: ${result.eventCount}`);
}

async function saveSettings() {
  const payload = {
    endpointUrl: endpointUrlEl.value.trim(),
    endpointToken: endpointTokenEl.value.trim(),
    autoSend: autoSendEl.checked
  };
  const result = await sendMessage({ type: "SAVE_SETTINGS", payload });
  if (!result?.ok) {
    setStatus(`Error saving: ${result?.error || "unknown"}`, true);
    return;
  }
  setStatus("Settings saved");
}

function renderSnapshot(snapshot) {
  lastSnapshot = snapshot;
  snapshotOutputEl.value = JSON.stringify(snapshot, null, 2);
}

async function createSnapshotNow() {
  const result = await sendMessage({ type: "CREATE_SNAPSHOT_FOR_ACTIVE_TAB" });
  if (!result?.ok) {
    setStatus(`Error: ${result?.error || "unknown"}`, true);
    return;
  }
  renderSnapshot(result.snapshot);
  setStatus(`Snapshot created`);
  await refreshStatus();
}

async function sendLastSnapshot() {
  const result = await sendMessage({ type: "SEND_LAST_SNAPSHOT_FOR_ACTIVE_TAB" });
  if (!result?.ok) {
    setStatus(`Error: ${result?.error || "unknown"}`, true);
    return;
  }
  const sent = result.delivery?.sent;
  if (sent) {
    setStatus(`Snapshot sent`);
  } else {
    setStatus(`Failed to send`, true);
  }
}

// EVENT LISTENERS
document.getElementById("saveSettings").addEventListener("click", saveSettings);
document.getElementById("createSnapshot").addEventListener("click", createSnapshotNow);
document.getElementById("sendLast").addEventListener("click", sendLastSnapshot);
openReportBtnEl.addEventListener("click", openReportPage);

refreshStatus();
