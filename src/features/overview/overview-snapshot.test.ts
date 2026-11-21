import assert from "node:assert/strict";
import test from "node:test";
import {
  readOverviewSnapshot,
} from "./overview-snapshot.ts";
import type { WorkflowReadService } from "../workflows/workflow-read-service.ts";
import type { ProjectReadService } from "../projects/project-read-service.ts";

test("overview reads bounded workflow and project metadata concurrently", async () => {
  const calls: string[] = [];
  const workflows = {
    listOwnWorkflows: async (options?: { limit?: number }) => {
      calls.push(`workflows:${options?.limit}`);
      return { status: "success" as const, data: [{ id: "w1" }, { id: "w2" }] };
    },
  } as unknown as WorkflowReadService;
  const projects = {
    listOwnProjects: async (options?: { limit?: number }) => {
      calls.push(`projects:${options?.limit}`);
      return { status: "success" as const, data: [{ id: "p1" }] };
    },
  } as unknown as ProjectReadService;

  const snapshot = await readOverviewSnapshot(workflows, projects);

  assert.deepEqual(snapshot, {
    workflowCount: 2,
    projectCount: 1,
    workflowError: null,
    projectError: null,
  });
  assert.deepEqual(calls.sort(), ["projects:100", "workflows:100"]);
});

test("one unavailable source does not hide the other source count", async () => {
  const workflows = {
    listOwnWorkflows: async () => ({ status: "error" as const, code: "query_failed" as const }),
  } as unknown as WorkflowReadService;
  const projects = {
    listOwnProjects: async () => ({ status: "success" as const, data: [{ id: "p1" }, { id: "p2" }] }),
  } as unknown as ProjectReadService;

  const snapshot = await readOverviewSnapshot(workflows, projects);

  assert.equal(snapshot.workflowCount, null);
  assert.equal(snapshot.workflowError, "query_failed");
  assert.equal(snapshot.projectCount, 2);
  assert.equal(snapshot.projectError, null);
});

test("missing read services are explicitly unavailable, never treated as zero", async () => {
  const snapshot = await readOverviewSnapshot(null, null);

  assert.equal(snapshot.workflowCount, null);
  assert.equal(snapshot.projectCount, null);
  assert.equal(snapshot.workflowError, "service_unavailable");
  assert.equal(snapshot.projectError, "service_unavailable");
});

test("unexpected adapter rejection is isolated to its own source", async () => {
  const workflows = {
    listOwnWorkflows: async () => { throw new Error("private transport detail"); },
  } as unknown as WorkflowReadService;
  const projects = {
    listOwnProjects: async () => ({ status: "success" as const, data: [] }),
  } as unknown as ProjectReadService;

  const snapshot = await readOverviewSnapshot(workflows, projects);

  assert.equal(snapshot.workflowCount, null);
  assert.equal(snapshot.workflowError, "request_failed");
  assert.equal(snapshot.projectCount, 0);
  assert.equal(snapshot.projectError, null);
});
