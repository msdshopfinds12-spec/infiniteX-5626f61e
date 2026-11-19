import { useState } from "react";
import { CheckCircle2, Circle, Clock3, Play, ShieldCheck, XCircle } from "lucide-react";
import { createTask, transitionTask, type TaskRecord } from "../lib/task-lifecycle.mjs";

function makeSamples(): TaskRecord[] {
  const now = new Date().toISOString();
  return [
    createTask({ id: "task-demo-architecture", title: "Review application architecture", createdAt: now }),
    createTask({ id: "task-demo-quality", title: "Prepare quality assurance checklist", createdAt: now }),
  ];
}

function nextAction(task: TaskRecord): { command: string; actor: "system" | "user"; label: string } | null {
  switch (task.state) {
    case "queued": return { command: "begin_planning", actor: "system", label: "Start planning" };
    case "planning": return { command: "request_approval", actor: "system", label: "Request approval" };
    case "awaiting_approval": return null;
    case "approved": return { command: "begin_execution", actor: "system", label: "Preview execution state" };
    case "running": return { command: "complete", actor: "system", label: "Complete simulation" };
    default: return null;
  }
}

export default function TaskCenter() {
  const [tasks, setTasks] = useState<TaskRecord[]>(makeSamples);
  const [message, setMessage] = useState("Local simulation only. No AI model, external tool, API, or background job is executed.");
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);

  function apply(taskId: string, command: string, actor: "system" | "user") {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
    try {
      const updated = transitionTask(target, command, {
        expectedVersion: target.version,
        actor,
        at: new Date(Math.max(Date.now(), Date.parse(target.updatedAt))).toISOString(),
      });
      setTasks((current) => current.map((task) =>
        task.id === taskId && task.version === target.version ? updated : task
      ));
      setMessage(`${target.title}: local state changed to ${updated.state}. No external action was performed.`);
    } catch {
      setMessage("The requested transition was rejected. Refresh the task state and try a valid action.");
    }
  }

  const counts = {
    total: tasks.length,
    waiting: tasks.filter((task) => task.state === "awaiting_approval").length,
    completed: tasks.filter((task) => task.state === "succeeded").length,
  };

  return (
    <section className="task-center" aria-label="Local task workspace">
      <div className="task-center-banner">
        <div className="task-center-banner-icon"><ShieldCheck size={18} aria-hidden="true" /></div>
        <div>
          <strong>Approval-gated task simulation</strong>
          <p>Practice the task lifecycle safely. These controls only change local in-memory demo state.</p>
        </div>
        <span className="badge badge-neutral">NO EXECUTION</span>
      </div>

      <div className="task-summary" aria-label="Task summary">
        <div><span>Total demo tasks</span><strong>{counts.total}</strong></div>
        <div><span>Awaiting approval</span><strong>{counts.waiting}</strong></div>
        <div><span>Completed simulations</span><strong>{counts.completed}</strong></div>
      </div>

      <p className="task-feedback" role="status" aria-live="polite">{message}</p>

      <div className="task-list">
        {tasks.map((task) => {
          const action = nextAction(task);
          const terminal = ["succeeded", "failed", "cancelled"].includes(task.state);
          return (
            <article className="task-card" key={task.id}>
              <div className="task-card-head">
                <div className="task-card-title">
                  <span className={`task-state-icon state-${task.state}`} aria-hidden="true">
                    {task.state === "succeeded" ? <CheckCircle2 size={18} /> : task.state === "cancelled" || task.state === "failed" ? <XCircle size={18} /> : task.state === "awaiting_approval" ? <Clock3 size={18} /> : <Circle size={18} />}
                  </span>
                  <div><h3>{task.title}</h3><span className="task-id">{task.id}</span></div>
                </div>
                <span className={`task-state-pill state-pill-${task.state}`}>{task.state.replaceAll("_", " ")}</span>
              </div>

              <div className="task-progress" aria-label={`Task state: ${task.state}`}>
                {["queued", "planning", "awaiting_approval", "approved", "running", "succeeded"].map((state, index) => (
                  <span key={state} className={index <= ["queued", "planning", "awaiting_approval", "approved", "running", "succeeded"].indexOf(task.state) ? "task-progress-step reached" : "task-progress-step"} title={state} />
                ))}
              </div>

              <div className="task-card-meta">
                <span>Version {task.version}</span>
                <span>{task.events.length} state events</span>
                <span>Approval: {task.approval.replaceAll("_", " ")}</span>
              </div>

              <div className="task-actions">
                {task.state === "awaiting_approval" ? (
                  <>
                    <button className="btn btn-primary" type="button" onClick={() => apply(task.id, "approve", "user")}>Approve simulation</button>
                    <button className="btn btn-ghost" type="button" onClick={() => apply(task.id, "reject", "user")}>Reject</button>
                  </>
                ) : action ? (
                  <button className="btn btn-primary" type="button" onClick={() => apply(task.id, action.command, action.actor)}>
                    {action.command === "begin_execution" ? <Play size={14} aria-hidden="true" /> : null}
                    {action.label}
                  </button>
                ) : null}
                {!terminal && task.state !== "awaiting_approval" && task.state !== "running" ? (
                  <button className="btn btn-ghost" type="button" onClick={() => apply(task.id, "cancel", "user")}>Cancel demo task</button>
                ) : null}
                <button className="btn btn-ghost" type="button" aria-expanded={historyTaskId === task.id} onClick={() => setHistoryTaskId((current) => current === task.id ? null : task.id)}>
                  {historyTaskId === task.id ? "Hide history" : "View history"}
                </button>
              </div>

              {historyTaskId === task.id && (
                <ol className="task-history" aria-label={`State history for ${task.id}`}>
                  <li><span>Created</span><time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString()}</time></li>
                  {task.events.map((event) => (
                    <li key={event.sequence}><span>{event.from} → {event.to}</span><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time></li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
