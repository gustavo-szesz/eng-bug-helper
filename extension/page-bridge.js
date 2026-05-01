(function installBridge() {
  if (window.__engagedBugSnapshotBridgeInstalled) {
    return;
  }
  window.__engagedBugSnapshotBridgeInstalled = true;

  function serializeError(input) {
    if (!input) {
      return { message: "Unknown error" };
    }
    if (typeof input === "string") {
      return { message: input };
    }
    if (input instanceof Error) {
      return {
        name: input.name,
        message: input.message,
        stack: input.stack
      };
    }
    return { message: String(input) };
  }

  function emit(type, payload) {
    window.dispatchEvent(
      new CustomEvent("engaged-bugsnap-event", {
        detail: {
          type,
          payload,
          timestamp: new Date().toISOString()
        }
      })
    );
  }

  function safeMethod(method) {
    return method ? String(method).toUpperCase() : "GET";
  }

  window.addEventListener("error", (event) => {
    emit("runtime-error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: serializeError(event.error)
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    emit("unhandled-rejection", {
      reason: serializeError(event.reason)
    });
  });

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function patchedFetch(...args) {
      const startedAt = Date.now();
      const input = args[0];
      const init = args[1] || {};
      const method = safeMethod(init.method);
      const url = typeof input === "string" ? input : input && input.url;

      try {
        const response = await originalFetch.apply(this, args);
        if (!response.ok) {
          emit("fetch-error", {
            url,
            method,
            status: response.status,
            statusText: response.statusText,
            durationMs: Date.now() - startedAt
          });
        }
        return response;
      } catch (error) {
        emit("fetch-exception", {
          url,
          method,
          durationMs: Date.now() - startedAt,
          error: serializeError(error)
        });
        throw error;
      }
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__engagedMeta = {
      method: safeMethod(method),
      url: String(url || "")
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const startedAt = Date.now();
    this.addEventListener("loadend", function onLoadEnd() {
      if (this.status >= 400 || this.status === 0) {
        emit("xhr-error", {
          url: this.__engagedMeta && this.__engagedMeta.url,
          method: this.__engagedMeta && this.__engagedMeta.method,
          status: this.status,
          statusText: this.statusText,
          durationMs: Date.now() - startedAt
        });
      }
    });
    return originalSend.call(this, body);
  };

  emit("bridge-ready", {
    href: location.href
  });
})();
