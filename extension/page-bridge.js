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

  function parseJsonLike(value) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    if (value && typeof value === "object") {
      return value;
    }

    return null;
  }

  function extractGraphqlDetails(url, body) {
    const parsedBody = parseJsonLike(body);
    const looksLikeGraphql = Boolean(
      (typeof url === "string" && /graphql/i.test(url)) ||
      (parsedBody && (parsedBody.query || parsedBody.operationName))
    );

    if (!looksLikeGraphql) {
      return null;
    }

    return {
      operationName: parsedBody && parsedBody.operationName ? String(parsedBody.operationName) : undefined,
      queryPreview: parsedBody && parsedBody.query ? String(parsedBody.query).slice(0, 500) : undefined,
      variables: parsedBody && parsedBody.variables ? parsedBody.variables : undefined
    };
  }

  async function readResponsePreview(response) {
    try {
      const cloned = response.clone();
      const contentType = cloned.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await cloned.json();
      }
      return (await cloned.text()).slice(0, 1500);
    } catch {
      return null;
    }
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
      const graphql = extractGraphqlDetails(url, init.body);

      try {
        const response = await originalFetch.apply(this, args);
        const responsePreview = graphql || !response.ok ? await readResponsePreview(response) : null;
        if (!response.ok) {
          emit("fetch-error", {
            url,
            method,
            status: response.status,
            statusText: response.statusText,
            durationMs: Date.now() - startedAt,
            graphql,
            responsePreview
          });
        } else if (graphql) {
          emit("graphql-observation", {
            url,
            method,
            status: response.status,
            durationMs: Date.now() - startedAt,
            graphql,
            responsePreview
          });
        }
        return response;
      } catch (error) {
        emit("fetch-exception", {
          url,
          method,
          durationMs: Date.now() - startedAt,
          error: serializeError(error),
          graphql
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
      url: String(url || ""),
      graphql: extractGraphqlDetails(String(url || ""), undefined)
    };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const startedAt = Date.now();
    const graphql = this.__engagedMeta && this.__engagedMeta.graphql ? this.__engagedMeta.graphql : extractGraphqlDetails(this.__engagedMeta && this.__engagedMeta.url, body);
    this.addEventListener("loadend", function onLoadEnd() {
      if (this.status >= 400 || this.status === 0) {
        emit("xhr-error", {
          url: this.__engagedMeta && this.__engagedMeta.url,
          method: this.__engagedMeta && this.__engagedMeta.method,
          status: this.status,
          statusText: this.statusText,
          durationMs: Date.now() - startedAt,
          graphql,
          responsePreview: typeof this.responseText === "string" ? this.responseText.slice(0, 1500) : undefined
        });
      } else if (graphql) {
        emit("graphql-observation", {
          url: this.__engagedMeta && this.__engagedMeta.url,
          method: this.__engagedMeta && this.__engagedMeta.method,
          status: this.status,
          durationMs: Date.now() - startedAt,
          graphql,
          responsePreview: typeof this.responseText === "string" ? this.responseText.slice(0, 1500) : undefined
        });
      }
    });
    return originalSend.call(this, body);
  };

  emit("bridge-ready", {
    href: location.href
  });
})();
