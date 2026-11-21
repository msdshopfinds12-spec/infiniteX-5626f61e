import {
  WorkflowLeaseError,
  type LeaseIdentity,
  type WorkflowLease,
} from "./workflow-lease-contract.ts";

export type LeaseHeartbeat = (identity: LeaseIdentity) => Promise<WorkflowLease>;
export type Scheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};
export type SupervisorOptions = {
  heartbeat: LeaseHeartbeat;
  lease: WorkflowLease;
  leaseDurationSeconds?: number;
  heartbeatIntervalMs?: number;
  scheduler?: Scheduler;
  onLeaseLost?: (error: WorkflowLeaseError) => void;
};

const defaultScheduler: Scheduler = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Single-flight lease heartbeat supervisor.
 * A heartbeat transport failure is treated as ambiguous and fails closed:
 * work is aborted; the lease is never locally "recovered" by retrying blindly.
 */
export class WorkflowLeaseSupervisor {
  readonly signal: AbortSignal;
  #controller = new AbortController();
  #heartbeat: LeaseHeartbeat;
  #scheduler: Scheduler;
  #timer: unknown = null;
  #inFlight: Promise<void> | null = null;
  #terminal = false;
  #started = false;
  #lease: WorkflowLease;
  #intervalMs: number;
  #onLeaseLost?: (error: WorkflowLeaseError) => void;

  constructor(options: SupervisorOptions) {
    if (typeof options.heartbeat !== "function") throw new WorkflowLeaseError("LEASE_INVALID");
    this.#lease = options.lease;
    this.#heartbeat = options.heartbeat;
    this.#scheduler = options.scheduler ?? defaultScheduler;
    this.#onLeaseLost = options.onLeaseLost;
    const duration = options.leaseDurationSeconds ?? 90;
    if (!Number.isInteger(duration) || duration < 30 || duration > 900) {
      throw new WorkflowLeaseError("LEASE_INVALID");
    }
    const interval = options.heartbeatIntervalMs ?? Math.max(5_000, Math.floor(duration * 1000 / 3));
    if (!Number.isInteger(interval) || interval < 1_000 || interval >= duration * 1000) {
      throw new WorkflowLeaseError("LEASE_INVALID");
    }
    this.#intervalMs = interval;
    this.signal = this.#controller.signal;
  }

  get lease(): WorkflowLease { return this.#lease; }
  get isTerminal(): boolean { return this.#terminal; }

  start(): void {
    if (this.#terminal) throw new WorkflowLeaseError("LEASE_LOST");
    if (this.#started) return;
    this.#started = true;
    this.#schedule();
  }

  async heartbeatNow(): Promise<void> {
    if (this.#terminal) throw new WorkflowLeaseError("LEASE_LOST");
    if (this.#inFlight) return await this.#inFlight;
    this.#inFlight = this.#renew();
    try { await this.#inFlight; } finally { this.#inFlight = null; }
  }

  async release(): Promise<void> {
    if (this.#terminal) return;
    this.#terminal = true;
    this.#clearTimer();
    if (!this.signal.aborted) this.#controller.abort(new WorkflowLeaseError("LEASE_CANCELLED"));
    // Do not allow a late heartbeat result to revive the terminal supervisor.
    if (this.#inFlight) await this.#inFlight.catch(() => undefined);
  }

  async #renew(): Promise<void> {
    try {
      const renewed = await this.#heartbeat(this.#lease);
      if (this.#terminal) return;
      if (renewed.runId !== this.#lease.runId ||
          renewed.ownerId !== this.#lease.ownerId ||
          renewed.attempt !== this.#lease.attempt ||
          renewed.leaseToken !== this.#lease.leaseToken ||
          !Number.isFinite(Date.parse(renewed.leaseUntil))) {
        throw new WorkflowLeaseError("LEASE_INVALID");
      }
      this.#lease = Object.freeze({ ...renewed });
    } catch (cause) {
      const error = cause instanceof WorkflowLeaseError
        ? cause
        : new WorkflowLeaseError("LEASE_TRANSPORT_AMBIGUOUS", cause);
      this.#terminate(error);
      throw error;
    }
  }

  #schedule(): void {
    if (this.#terminal || !this.#started) return;
    this.#timer = this.#scheduler.setTimeout(() => {
      this.#timer = null;
      if (this.#terminal) return;
      void this.heartbeatNow().then(() => this.#schedule()).catch(() => undefined);
    }, this.#intervalMs);
  }

  #clearTimer(): void {
    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #terminate(error: WorkflowLeaseError): void {
    if (this.#terminal) return;
    this.#terminal = true;
    this.#clearTimer();
    if (!this.signal.aborted) this.#controller.abort(error);
    try { this.#onLeaseLost?.(error); } catch { /* observer errors cannot restore a lease */ }
  }
}
