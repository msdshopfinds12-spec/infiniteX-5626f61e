import {beforeEach,describe,expect,it,vi} from "vitest";
import {inTenantTransaction} from "../src/repositories/tenant-context.js";
import {
  cancelQueuedTask,
  createTask,
  getTask,
  listTasks,
  TaskAgentNotFoundError,
  TaskIdempotencyConflictError,
  TaskIdempotencyLookupError,
} from "../src/repositories/task-repository.js";

vi.mock("../src/repositories/tenant-context.js", () => ({
  inTenantTransaction: vi.fn(),
}));

const query = vi.fn();
const client = {query};
const identity = {tenantId: "tenant-1", userId: "user-1"};

beforeEach(() => {
  query.mockReset();
  vi.mocked(inTenantTransaction).mockImplementation(async (_issuer, _subject, work) =>
    work(client as never, identity),
  );
});

describe("createTask", () => {
  it("creates a task when the idempotency key is new", async () => {
    const task = {id: "task-1", status: "queued", input: {kind: "demo"}};
    query.mockResolvedValueOnce({rows: [task]});

    const result = await createTask("issuer", "subject", {
      input: {kind: "demo"},
      idempotencyKey: "request-123",
    });

    expect(result).toEqual({task, created: true});
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([
      identity.tenantId,
      null,
      "request-123",
      JSON.stringify({kind: "demo"}),
      identity.userId,
    ]);
  });

  it("returns the original task for an identical retry", async () => {
    const task = {
      id: "task-1",
      agent_id: null,
      idempotency_key: "request-123",
      status: "queued",
      input: {kind: "demo"},
      request_matches: true,
    };
    query
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [task]});

    const result = await createTask("issuer", "subject", {
      input: {kind: "demo"},
      idempotencyKey: "request-123",
    });

    expect(result).toEqual({
      task: {
        id: "task-1",
        agent_id: null,
        idempotency_key: "request-123",
        status: "queued",
        input: {kind: "demo"},
      },
      created: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects reuse of a key with a different input payload", async () => {
    query
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [{id: "task-1", request_matches: false}]});

    await expect(createTask("issuer", "subject", {
      input: {kind: "different"},
      idempotencyKey: "request-123",
    })).rejects.toBeInstanceOf(TaskIdempotencyConflictError);
  });

  it("rejects reuse of a key with a different agent", async () => {
    query
      .mockResolvedValueOnce({rows: [{id: "agent-1"}]})
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [{id: "task-1", request_matches: false}]});

    await expect(createTask("issuer", "subject", {
      agentId: "agent-1",
      input: {kind: "demo"},
      idempotencyKey: "request-123",
    })).rejects.toBeInstanceOf(TaskIdempotencyConflictError);
  });

  it("rejects an agent that is not owned by the authenticated tenant", async () => {
    query.mockResolvedValueOnce({rows: []});

    await expect(createTask("issuer", "subject", {
      agentId: "foreign-agent",
      input: {kind: "demo"},
      idempotencyKey: "request-123",
    })).rejects.toBeInstanceOf(TaskAgentNotFoundError);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it("fails explicitly if a conflict lookup unexpectedly finds no task", async () => {
    query
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: []});

    await expect(createTask("issuer", "subject", {
      input: {kind: "demo"},
      idempotencyKey: "request-123",
    })).rejects.toBeInstanceOf(TaskIdempotencyLookupError);
  });
});

describe("tenant-scoped task operations", () => {
  it("lists tasks with an explicit tenant predicate", async () => {
    query.mockResolvedValueOnce({rows: []});
    await listTasks("issuer", "subject");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE tenant_id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([identity.tenantId]);
  });

  it("reads a task with tenant and task identifiers", async () => {
    query.mockResolvedValueOnce({rows: [{id: "task-1"}]});
    await getTask("issuer", "subject", "task-1");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE tenant_id = $1 AND id = $2");
    expect(query.mock.calls[0]?.[1]).toEqual([identity.tenantId, "task-1"]);
  });

  it("cancels only a queued task inside the authenticated tenant", async () => {
    query.mockResolvedValueOnce({rows: [{id: "task-1", status: "cancelled"}]});
    await cancelQueuedTask("issuer", "subject", "task-1");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE tenant_id = $1 AND id = $2 AND status = 'queued'");
    expect(query.mock.calls[0]?.[1]).toEqual([identity.tenantId, "task-1"]);
  });
});
