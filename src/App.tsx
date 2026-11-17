import { useMemo, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, Check, CircleAlert, Code2, GitBranch,
  Layers3, LockKeyhole, Play, Plus, ShieldCheck, Sparkles, Workflow, Zap,
} from "lucide-react";
import AgentList from "./components/AgentList";
import LogStream, { demoLogEntries } from "./components/LogStream";
import PipelineBoard, { demoPipelines } from "./components/PipelineBoard";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { useTheme } from "./hooks/useTheme";
import { getIntegrationSummary } from "./lib/agentRegistry";
import { canExecuteRemoteAction, getExecutionMode, requiresHumanApproval } from "./lib/workflowPolicy";
import type { LogEntry, Pipeline, ViewKey } from "./types";

const pageTitles: Record<ViewKey, string> = {
  overview: "Overview",
  agents: "AI agent registry",
  pipelines: "Workflow studio",
  activity: "Activity log",
  security: "Security & approvals",
  integrations: "Repository integrations",
};

function getClockTime() {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date());
}

export default function App() {
  const [view, setView] = useState<ViewKey>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [notice, setNotice] = useState("");
  const [runCount, setRunCount] = useState(0);
  const [pipelines, setPipelines] = useState<Pipeline[]>(demoPipelines);
  const [activity, setActivity] = useState<LogEntry[]>(demoLogEntries);
  const { theme, toggleTheme } = useTheme();

  const summary = getIntegrationSummary();
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredPipelines = useMemo(
    () => pipelines.filter((pipeline) =>
      [pipeline.name, pipeline.branch, ...pipeline.stages.map((stage) => stage.name)]
        .join(" ").toLowerCase().includes(normalizedSearch)
    ),
    [pipelines, normalizedSearch]
  );

  const filteredActivity = useMemo(
    () => activity.filter((entry) =>
      [entry.source, entry.level, entry.message].join(" ").toLowerCase().includes(normalizedSearch)
    ),
    [activity, normalizedSearch]
  );

  function addLocalEvent(message: string, source = "local-demo") {
    const entry: LogEntry = {
      id: "event-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      time: getClockTime(),
      level: "info",
      source,
      message,
    };
    setActivity((current) => [entry, ...current]);
  }

  function runLocalDemo() {
    setRunCount((count) => count + 1);
    addLocalEvent("A local-only workflow simulation was started. No remote action was sent.");
    setNotice("Local simulation recorded. No AI provider, repository, database, or deployment was contacted.");
  }

  function createLocalWorkflow() {
    const nextNumber = pipelines.length + 1;
    const nextPipeline: Pipeline = {
      id: "local-workflow-" + nextNumber,
      name: "New local workflow " + nextNumber,
      branch: "local/draft-" + nextNumber,
      stages: [
        { name: "Inspect", status: "demo" },
        { name: "Plan", status: "planned" },
        { name: "Build", status: "blocked" },
        { name: "Human approval", status: "blocked" },
      ],
    };
    setPipelines((current) => [nextPipeline, ...current]);
    addLocalEvent("Created a local workflow draft. It has not been sent to GitHub Actions.");
    setNotice("Local workflow draft created. It does not change your GitHub repository.");
    setView("pipelines");
  }

  function showNotification() {
    setNotice("No live notification provider is connected. This workspace is in local demo mode.");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar view={view} onChange={setView} />
      <div className="main-area">
        <TopBar
          title={pageTitles[view]}
          view={view}
          theme={theme}
          onToggleTheme={toggleTheme}
          searchValue={searchTerm}
          onSearch={setSearchTerm}
          onNotify={showNotification}
        />

        <main className="content" id="main-content">
          {notice && (
            <div className="notice-banner" role="status">
              <CircleAlert size={17} />
              <p>{notice}</p>
              <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button>
            </div>
          )}

          {view === "overview" && (
            <>
              <section className="hero-panel">
                <div className="hero-glow" aria-hidden="true" />
                <div className="hero-copy">
                  <div className="hero-kicker"><Sparkles size={14} /> APPROVAL-FIRST ENGINEERING</div>
                  <h2>Build with clarity.<br /><span>Ship with confidence.</span></h2>
                  <p>One control plane for AI-assisted engineering—inspect, plan, validate, and review before any real change is allowed.</p>
                  <div className="hero-actions">
                    <button className="button button-primary" type="button" onClick={runLocalDemo}>
                      <Play size={15} fill="currentColor" /> Run local demo
                    </button>
                    <button className="button button-secondary" type="button" onClick={() => setView("integrations")}>
                      Explore integrations <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="hero-status" aria-hidden="true">
                  <div className="orbit orbit-one" /><div className="orbit orbit-two" />
                  <div className="hero-core"><Zap size={31} /></div>
                  <span className="orbit-label label-top">PLAN</span>
                  <span className="orbit-label label-right">TEST</span>
                  <span className="orbit-label label-bottom">REVIEW</span>
                  <span className="orbit-label label-left">APPROVE</span>
                </div>
                <div className="hero-footer">
                  <span className="state-pill state-demo"><span className="state-dot" /> LOCAL DEMO MODE</span>
                  <span className="hero-footer-note">Remote execution disabled by default</span>
                </div>
              </section>

              <section className="stats-grid" aria-label="Workspace status">
                <article className="stat-card">
                  <span className="stat-icon icon-violet"><Bot size={18} /></span>
                  <div><strong>{summary.total}</strong><span>Candidate AI adapters</span></div>
                  <small>Registry only</small>
                </article>
                <article className="stat-card">
                  <span className="stat-icon icon-cyan"><Layers3 size={18} /></span>
                  <div><strong>{summary.connected}</strong><span>Verified connections</span></div>
                  <small>None connected</small>
                </article>
                <article className="stat-card">
                  <span className="stat-icon icon-blue"><Workflow size={18} /></span>
                  <div><strong>{runCount}</strong><span>Local demo runs</span></div>
                  <small>Session only</small>
                </article>
                <article className="stat-card">
                  <span className="stat-icon icon-amber"><LockKeyhole size={18} /></span>
                  <div><strong>Required</strong><span>Human approval</span></div>
                  <small>Before writes or release</small>
                </article>
              </section>

              <section className="section-heading">
                <div><span className="section-eyebrow">CONTROL CENTER</span><h2>Engineering workspace</h2></div>
                <span className="state-pill state-muted">DATA LABELLED AS DEMO</span>
              </section>

              <section className="overview-grid">
                <article className="surface-card">
                  <div className="card-heading">
                    <div><span className="section-icon"><Bot size={17} /></span><div><h3>AI agent registry</h3><p>Repository candidates, not live agents</p></div></div>
                    <button className="text-action" type="button" onClick={() => setView("agents")}>View all <ArrowUpRight size={14} /></button>
                  </div>
                  <AgentList compact searchTerm={searchTerm} />
                </article>

                <article className="surface-card">
                  <div className="card-heading">
                    <div><span className="section-icon"><ShieldCheck size={17} /></span><div><h3>Execution guardrails</h3><p>Safe defaults for this workspace</p></div></div>
                    <button className="text-action" type="button" onClick={() => setView("security")}>Review <ArrowUpRight size={14} /></button>
                  </div>
                  <div className="guardrail-list">
                    <div><span className="guardrail-icon"><Check size={15} /></span><span><strong>Remote execution</strong><small>Disabled until verified</small></span><em>OFF</em></div>
                    <div><span className="guardrail-icon"><Check size={15} /></span><span><strong>Credentials</strong><small>Server-side only</small></span><em>POLICY</em></div>
                    <div><span className="guardrail-icon"><Check size={15} /></span><span><strong>Repository writes</strong><small>Human approval required</small></span><em>GATED</em></div>
                  </div>
                </article>
              </section>

              <section className="surface-card">
                <div className="card-heading">
                  <div><span className="section-icon"><GitBranch size={17} /></span><div><h3>Workflow previews</h3><p>Illustrative local pipeline stages</p></div></div>
                  <button className="text-action" type="button" onClick={() => setView("pipelines")}>Open studio <ArrowUpRight size={14} /></button>
                </div>
                <PipelineBoard pipelines={filteredPipelines.slice(0, 2)} />
              </section>
            </>
          )}

          {view === "agents" && (
            <section className="surface-card page-card">
              <div className="section-intro">
                <span className="section-icon"><Bot size={18} /></span>
                <div><h2>AI agent registry</h2><p>These are repository integration candidates. None is connected or executing from this interface.</p></div>
              </div>
              <AgentList searchTerm={searchTerm} />
            </section>
          )}

          {view === "pipelines" && (
            <section className="surface-card page-card">
              <div className="section-intro">
                <span className="section-icon"><Workflow size={18} /></span>
                <div><h2>Workflow studio</h2><p>Create local drafts and inspect the approval path. No GitHub workflow is triggered.</p></div>
                <button className="button button-primary" type="button" onClick={createLocalWorkflow}><Plus size={15} /> New local draft</button>
              </div>
              <PipelineBoard pipelines={filteredPipelines} expanded />
            </section>
          )}

          {view === "activity" && (
            <section className="surface-card page-card">
              <div className="section-intro">
                <span className="section-icon"><GitBranch size={18} /></span>
                <div><h2>Local activity</h2><p>Session events only. These are not production logs or remote telemetry.</p></div>
                <span className="state-pill state-demo">DEMO DATA</span>
              </div>
              <LogStream entries={filteredActivity} />
            </section>
          )}

          {view === "security" && (
            <>
              <section className="security-banner">
                <div className="security-banner-icon"><ShieldCheck size={24} /></div>
                <div><span className="section-eyebrow">SECURITY POSTURE</span><h2>Policy-first. Verification pending.</h2><p>This UI does not have access to production telemetry, secrets, or backend security checks.</p></div>
                <span className="state-pill state-warning">NOT VERIFIED</span>
              </section>
              <section className="surface-card page-card">
                <h3 className="surface-title">Enforced application boundaries</h3>
                <div className="policy-grid">
                  <article><LockKeyhole size={18} /><strong>Server-side secrets</strong><p>Provider keys must stay in trusted server environments. Never ship them in browser bundles.</p><span className="policy-status">POLICY DEFINED</span></article>
                  <article><ShieldCheck size={18} /><strong>Human approval</strong><p>Repository writes, merges, deployments, migrations, and billing actions require explicit approval.</p><span className="policy-status">POLICY DEFINED</span></article>
                  <article><Code2 size={18} /><strong>Bounded code repair</strong><p>AI may propose patches and tests. It cannot self-approve, merge, or deploy its own changes.</p><span className="policy-status">POLICY DEFINED</span></article>
                  <article><CircleAlert size={18} /><strong>Runtime verification</strong><p>Authentication, authorization, RLS, API validation, and production logs remain unverified here.</p><span className="policy-status policy-warning">NOT VERIFIED</span></article>
                </div>
              </section>
            </>
          )}

          {view === "integrations" && (
            <section className="surface-card page-card">
              <div className="section-intro">
                <span className="section-icon"><Layers3 size={18} /></span>
                <div><h2>AI repository integrations</h2><p>Candidate adapter map. This is an inventory view—not a live connector or execution engine.</p></div>
                <span className="state-pill state-muted">{summary.notConnected} NOT CONNECTED</span>
              </div>
              <div className="integration-flow">
                <div><span>01</span><strong>Repository inventory</strong><small>Read-only inspection</small></div>
                <ArrowRight size={16} />
                <div><span>02</span><strong>Adapter contract</strong><small>Typed capabilities</small></div>
                <ArrowRight size={16} />
                <div><span>03</span><strong>Server gateway</strong><small>Secrets stay server-side</small></div>
                <ArrowRight size={16} />
                <div><span>04</span><strong>Human approval</strong><small>Before write actions</small></div>
              </div>
              <AgentList searchTerm={searchTerm} />
              <div className="integration-footnote"><CircleAlert size={15} /> Live API access, repository permissions, provider credentials, and end-to-end integration tests have not been configured.</div>
            </section>
          )}

          <footer className="app-footer">
            <span><span className="footer-dot" /> InfiniteX engineering control plane</span>
            <span>Execution mode: {getExecutionMode()} · Remote actions: {canExecuteRemoteAction() ? "enabled" : "disabled"}</span>
            <span>Approval required for writes: {requiresHumanApproval("write") ? "yes" : "no"}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
