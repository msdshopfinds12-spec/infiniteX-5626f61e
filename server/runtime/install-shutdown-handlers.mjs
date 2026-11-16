import { createShutdownController } from "./shutdown.mjs";

/**
 * Attach SIGINT/SIGTERM handlers without terminating the process directly.
 * The host process remains responsible for final exit policy.
 */
export function installShutdownHandlers(server, {
  processLike = process,
  timeoutMs = 10_000,
  logger = () => {},
} = {}) {
  if (
    !processLike ||
    typeof processLike.once !== "function" ||
    typeof processLike.removeListener !== "function"
  ) {
    throw new TypeError("processLike must support once() and removeListener()");
  }
  if (typeof logger !== "function") {
    throw new TypeError("logger must be a function");
  }

  const controller = createShutdownController(server, {
    timeoutMs,
    onTimeout: () => {
      try {
        logger({ event: "shutdown_timeout" });
      } catch {
        // Logging must not interfere with connection cleanup.
      }
    },
  });

  let signalHandled = false;

  const cleanup = () => {
    processLike.removeListener("SIGINT", onSignal);
    processLike.removeListener("SIGTERM", onSignal);
  };

  const onSignal = (signal) => {
    if (signalHandled) return;
    signalHandled = true;
    cleanup();

    try {
      logger({ event: "shutdown_started", signal });
    } catch {
      // Logging must not block shutdown.
    }

    controller.shutdown().then((result) => {
      if (!result.closed) processLike.exitCode = 1;
      try {
        logger({
          event: "shutdown_completed",
          closed: result.closed,
          timedOut: result.timedOut,
        });
      } catch {
        // Logging must not alter the shutdown result.
      }
    }).catch(() => {
      processLike.exitCode = 1;
    });
  };

  processLike.once("SIGINT", onSignal);
  processLike.once("SIGTERM", onSignal);

  return Object.freeze({ dispose: cleanup });
}
