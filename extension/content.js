(function bootstrap() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-bridge.js");
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();

function collectContext() {
  return {
    href: location.href,
    pathname: location.pathname,
    search: location.search,
    referrer: document.referrer,
    title: document.title,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
    cookiesEnabled: navigator.cookieEnabled,
    visibilityState: document.visibilityState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height
    },
    capturedAt: new Date().toISOString()
  };
}

window.addEventListener("engaged-bugsnap-event", (event) => {
  const detail = event.detail || {};
  chrome.runtime.sendMessage({
    type: "BUG_EVENT",
    eventType: detail.type || "unknown",
    payload: detail.payload || {},
    timestamp: detail.timestamp || new Date().toISOString()
  });
});

chrome.runtime.sendMessage({
  type: "PAGE_CONTEXT",
  payload: collectContext()
});

window.addEventListener("beforeunload", () => {
  chrome.runtime.sendMessage({
    type: "PAGE_CONTEXT",
    payload: collectContext()
  });
});
