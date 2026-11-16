/**
 * Bounded, idempotent shutdown coordination for Node HTTP servers.
 * The caller owns signal registration; importing this module has no process side effects.
 */
export function createShutdownController(server, {
  timeoutMs = 10_000,
  onTimeout = () => {},
} = {}) {
  if (!server || typeof server.close !== "function") {
    throw new TypeError("server must expose close(callback)");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new RangeError("timeoutMs must be an integer between 1 and 120000");
  }
  if (typeof onTimeout !== "function") {
    throw new TypeError("onTimeout must be a function");
  }

  let shutdownPromise;

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise((resolve) => {
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        try {
          server.closeAllConnections?.();
        } catch {
          // Forced-close errors must not escape the shutdown coordinator.
        }
        try {
          onTimeout();
        } catch {
          // Observability callbacks must not prevent shutdown completion.
        }
      }, timeoutMs);
      timer.unref?.();

      try {
        server.close((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            closed: !error,
            timedOut,
            error: error ?? null,
          });
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ closed: false, timedOut, error });
        return;
      }

      // A best-effort idle-connection close must not override close() outcome.
      try {
        server.closeIdleConnections?.();
      } catch {
        // The server close callback remains authoritative.
      }
    });

    return shutdownPromise;
  }

  return Object.freeze({ shutdown });
}
