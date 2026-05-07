const MAX_EVENTS = 200;
const tabBuffers = new Map();
let lastSnapshot = null;

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  const stamp = nowIso().replace(/[-:.TZ]/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `bug-${stamp}-${rand}`;
}

const SENSITIVE_KEY = /(authorization|token|secret|password|api[-_]?key|email|phone|cpf|cnpj)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const DIGIT_ID_PATTERN = /\b\d{9,14}\b/g;

function sanitizeString(value) {
  return value
    .replace(BEARER_PATTERN, "Bearer ***")
    .replace(EMAIL_PATTERN, "***@$2")
    .replace(DIGIT_ID_PATTERN, "***");
}

function sanitize(value, keyHint = "") {
  if (SENSITIVE_KEY.test(keyHint)) {
    return "***REDACTED***";
  }
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitize(v, k);
    }
    return out;
  }
  return value;
}

function ensureBuffer(tabId) {
  if (!tabBuffers.has(tabId)) {
    tabBuffers.set(tabId, { events: [], context: {} });
  }
  return tabBuffers.get(tabId);
}

function pushEvent(tabId, event) {
  const buffer = ensureBuffer(tabId);
  buffer.events.push(sanitize(event));
  if (buffer.events.length > MAX_EVENTS) {
    buffer.events.splice(0, buffer.events.length - MAX_EVENTS);
  }
}

function updateContext(tabId, context) {
  const buffer = ensureBuffer(tabId);
  buffer.context = {
    ...buffer.context,
    ...sanitize(context)
  };
}

async function getSettings() {
  const defaults = {
    endpointUrl: "",
    endpointToken: "",
    autoSend: true
  };
  const stored = await chrome.storage.local.get(defaults);
  return { ...defaults, ...stored };
}

function isErrorLikeEvent(type) {
  return ["runtime-error", "unhandled-rejection", "fetch-error", "fetch-exception", "xhr-error"].includes(type);
}

function buildSnapshot(tab, trigger) {
  const tabId = tab.id;
  const buffer = ensureBuffer(tabId);
  const errorEvents = buffer.events.filter((event) => /error|rejection/i.test(event.type));
  const networkEvents = buffer.events.filter((event) => /fetch|xhr|graphql|network/i.test(event.type));
  const graphqlErrors = buffer.events.filter((event) => /graphql.*error|fetch-error.*graphql|xhr-error.*graphql/i.test(event.type));
  return {
    id: createId(),
    createdAt: nowIso(),
    source: "engaged-browser-extension-beta",
    trigger,
    tab: sanitize({
      id: tabId,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl
    }),
    context: sanitize(buffer.context),
    userAgent: sanitize(buffer.context.userAgent || ""),
    events: sanitize(buffer.events),
    eventCount: buffer.events.length,
    summary: {
      errorCount: errorEvents.length,
      networkCount: networkEvents.length,
      graphqlErrorCount: graphqlErrors.length,
      lastEventType: buffer.events.length > 0 ? buffer.events[buffer.events.length - 1].type : null
    }
  };
}

async function saveLastSnapshot(tabId, snapshot) {
  lastSnapshot = snapshot;
  await chrome.storage.local.set({
    [`lastSnapshot:${tabId}`]: snapshot,
    lastSnapshotGlobal: snapshot
  });
}

async function postSnapshot(snapshot) {
  const settings = await getSettings();
  if (!settings.endpointUrl) {
    return { sent: false, reason: "Missing endpoint URL" };
  }

  const headers = { "Content-Type": "application/json" };
  if (settings.endpointToken) {
    headers.Authorization = `Bearer ${settings.endpointToken}`;
  }

  const response = await fetch(settings.endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(snapshot)
  });

  const text = await response.text();
  return {
    sent: response.ok,
    status: response.status,
    body: text.slice(0, 1500)
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function createSnapshotForActiveTab(trigger = "manual") {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found");
  }
  const snapshot = buildSnapshot(tab, trigger);
  await saveLastSnapshot(tab.id, snapshot);
  return { tabId: tab.id, snapshot };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "BUG_EVENT") {
      const tabId = sender.tab?.id;
      if (typeof tabId === "number") {
        pushEvent(tabId, {
          type: message.eventType || "unknown",
          timestamp: message.timestamp || nowIso(),
          payload: message.payload || {}
        });

        if (isErrorLikeEvent(message.eventType)) {
          const settings = await getSettings();
          if (settings.autoSend) {
            const tab = sender.tab;
            const snapshot = buildSnapshot(tab, `auto:${message.eventType}`);
            await saveLastSnapshot(tab.id, snapshot);
            const delivery = await postSnapshot(snapshot).catch((error) => ({
              sent: false,
              reason: String(error)
            }));
            sendResponse({ ok: true, autoSnapshot: snapshot.id, delivery });
            return;
          }
        }
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "PAGE_CONTEXT") {
      const tabId = sender.tab?.id;
      if (typeof tabId === "number") {
        updateContext(tabId, message.payload || {});
      }
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "GET_STATUS") {
      const tab = await getActiveTab();
      const tabId = tab?.id;
      const buffer = typeof tabId === "number" ? ensureBuffer(tabId) : { events: [] };
      const settings = await getSettings();
      sendResponse({
        ok: true,
        tabId,
        eventCount: buffer.events.length,
        settings
      });
      return;
    }

    if (message?.type === "SAVE_SETTINGS") {
      await chrome.storage.local.set({
        endpointUrl: message.payload?.endpointUrl || "",
        endpointToken: message.payload?.endpointToken || "",
        autoSend: !!message.payload?.autoSend
      });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "CREATE_SNAPSHOT_FOR_ACTIVE_TAB") {
      const result = await createSnapshotForActiveTab("manual");
      sendResponse({ ok: true, ...result });
      return;
    }

    if (message?.type === "SEND_LAST_SNAPSHOT_FOR_ACTIVE_TAB") {
      const tab = await getActiveTab();
      if (!tab || typeof tab.id !== "number") {
        sendResponse({ ok: false, error: "No active tab found" });
        return;
      }
      const key = `lastSnapshot:${tab.id}`;
      const data = await chrome.storage.local.get([key]);
      const snapshot = data[key];
      if (!snapshot) {
        sendResponse({ ok: false, error: "No snapshot for active tab" });
        return;
      }
      const delivery = await postSnapshot(snapshot).catch((error) => ({
        sent: false,
        reason: String(error)
      }));
      sendResponse({ ok: true, snapshotId: snapshot.id, delivery });
      return;
    }

    if (message?.type === "GET_LAST_SNAPSHOT") {
      if (lastSnapshot) {
        sendResponse({ ok: true, snapshot: lastSnapshot });
      } else {
        sendResponse({ ok: false, error: "No snapshot available" });
      }
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabBuffers.delete(tabId);
});
