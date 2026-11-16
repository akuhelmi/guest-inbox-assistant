import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ComposePanel } from "./compose-ui";
import { MessageRow } from "./components";
import { agentState, applyCard, isAi, providerLabel } from "./lib/agent";
import { addExtra, extraPayload, loadExtra, saveExtra } from "./lib/extra";
import { countByFilter, filterMessages } from "./lib/inbox";
import {
  type Proposal,
  type Threads,
  type Staffer,
  addHostTurn,
  addReply,
  addTurns,
  agreePlan,
  channelLabel,
  ensureThread,
  loadThreads,
  resolveStep,
  resultText,
  saveThreads,
  setProposal,
  syncArrival,
  threadFor,
} from "./lib/proposals";
import {
  QUEUE_VIEWS,
  type QueueView,
  inView,
  nextInQueue,
  queueSort,
  shiftStats,
} from "./lib/queue";
import {
  type DemoState,
  EMPTY_STATE,
  STATUS_LABELS,
  loadState,
  messageKey,
  saveState,
  addTask,
  confirmTask,
  reassignTask,
  setStatus,
  statusOf,
  toggleTask,
  waitInfo,
} from "./lib/workflow";
import type { AgentReply, AgentTurn, ComposeResult, Filter, Message, Meta, Property } from "./types";
import {
  type Team,
  anchorOf,
  arrivalForTask,
  arrivalSentence,
  assign,
  clock,
  daySlots,
  escalate,
  notifyText,
  personLabel,
  teamLines,
  updateOpening,
} from "./lib/team";
import { TasksView, TeamDay, WaitChip } from "./workflow-ui";
import { MessageWorkspace } from "./workspace-ui";

type View = "inbox" | "tasks";

function errorReply(message: string): AgentReply {
  return {
    text: `Sorry, that didn't work: ${message}`,
    cards: [],
    highlight: [],
    focus: null,
    by: "error",
    ai_left_today: null,
    note: null,
  };
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All topics" },
  { key: "urgent", label: "Urgent" },
  { key: "needs_host", label: "Needs host" },
  { key: "check_in", label: "Check-in" },
  { key: "complaint", label: "Complaint" },
  { key: "maintenance", label: "Maintenance" },
  { key: "booking_change", label: "Booking change" },
  { key: "general_question", label: "General question" },
];

export default function App() {
  // Saved demo messages from the API, plus the ones this visitor added (browser only).
  const [seeded, setSeeded] = useState<Message[]>([]);
  const [extra, setExtra] = useState<Message[]>(() => loadExtra(browserStorage()));
  const messages = useMemo(() => [...extra, ...seeded], [extra, seeded]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoState>(() => {
    const saved = loadState(browserStorage());
    return saved.startedAt ? saved : { ...saved, startedAt: Date.now() };
  });
  const [team, setTeam] = useState<Team>({ people: [], jobs: [] });
  const [threads, setThreads] = useState<Threads>(() => loadThreads(browserStorage()));
  const [busy, setBusy] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);
  const [aiLeft, setAiLeft] = useState<number | null>(null);
  const [view, setView] = useState<View>("inbox");
  const [queueView, setQueueView] = useState<QueueView>("todo");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  // Phones show one pane at a time: the inbox, a message, or New guest message.
  const [askOpen, setAskOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => saveState(browserStorage(), demo), [demo]);
  useEffect(() => saveExtra(browserStorage(), extra), [extra]);
  useEffect(() => saveThreads(browserStorage(), threads), [threads]);

  // Keep the waiting times moving.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([api.messages(), api.meta(), api.properties(), api.team()])
      .then(([msgs, m, props, t]) => {
        setSeeded(msgs);
        setMeta(m);
        setProperties(props);
        setTeam(t);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const stats = useMemo(() => shiftStats(messages, demo, now), [messages, demo, now]);
  const counts = useMemo(() => countByFilter(messages), [messages]);
  const queue = useMemo(
    () =>
      queueSort(filterMessages(messages, filter), demo, now).filter((m) =>
        inView(m, demo, queueView),
      ),
    [messages, filter, demo, now, queueView],
  );
  const viewCounts = useMemo(() => {
    const c: Record<QueueView, number> = { todo: 0, replied: 0, done: 0, all: messages.length };
    for (const m of messages) {
      const s = statusOf(m, demo).status;
      c[s === "new" ? "todo" : s] += 1;
    }
    return c;
  }, [messages, demo]);
  const slots = useMemo(
    () => daySlots(team, demo.tasks, anchorOf(demo, now)),
    [team, demo, now],
  );
  const staff: Staffer = (task, m) => {
    if (!team.people.length) return { person: "", label: "" };
    const a = assign(team, slots, task, m.property_id, Date.now(), {
      pick: task.person || undefined,
    });
    return { person: a.person, label: personLabel(team, a.person) };
  };
  const open = messages.find((m) => m.id === openId) ?? null;
  const next = open ? nextInQueue(messages, demo, open.id, now) : null;

  function openMessage(id: number) {
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    setThreads((t) =>
      syncArrival(ensureThread(t, m, demo, staff), m, demo, arrivalForTask(demo.tasks, m)),
    );
    setView("inbox");
    setAskOpen(false);
    setOpenId(id);
  }

  function goNext() {
    const next = nextInQueue(messages, demo, openId, now);
    if (next) openMessage(next.id);
    else {
      setOpenId(null);
      setToast("Inbox clear: every guest has a reply.");
    }
  }

  function approveProposals(m: Message, picked: Proposal[]) {
    const at = Date.now();
    for (const p of picked) {
      if (p.kind === "task" && p.task && team.people.length) {
        // The team logic picks (or checks) the person and their timing.
        const a = assign(team, slots, p.task, m.property_id, at, {
          pick: p.task.person || undefined,
        });
        const taskId = `${messageKey(m)}:${at}`;
        setDemo((d) => addTask(d, m, p.task!, at, a));
        // The reply that follows tells the guest who is coming and when (D26).
        setThreads((t) =>
          syncArrival(
            resolveStep(t, m, demo, p.pid, "approved", resultText(p, m.channel), {
              role: "assistant",
              text: `${a.note} ${notifyText(team, a)}`.trim(),
              by: "saved",
              escalation: a.person === "host" ? undefined : taskId,
            }),
            m,
            demo,
            arrivalSentence(a, m),
          ),
        );
        continue;
      }
      setDemo((d) => applyCard(d, p, messages, { task: p.task ?? undefined }, at));
      setThreads((t) => resolveStep(t, m, demo, p.pid, "approved", resultText(p, m.channel)));
    }
  }

  /** Demo only: the person didn't answer, so the job passes to the next one. */
  function noAnswer(m: Message, taskId: string) {
    const task = demo.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const at = Date.now();
    const { assignment, text } = escalate(team, slots, task, task.propertyId ?? m.property_id, at);
    setDemo((d) => reassignTask(d, taskId, assignment, at));
    setThreads((t) =>
      syncArrival(
        addTurns(t, m, demo, [
          { role: "host", text: `Simulate: no answer from ${task.personName ?? "them"}`, action: true },
          {
            role: "assistant",
            text,
            by: "saved",
            escalation: assignment.person === "host" ? undefined : taskId,
          },
        ]),
        m,
        demo,
        arrivalSentence(assignment, m),
        { followUp: updateOpening(m), now: at },
      ),
    );
  }

  function confirmed(m: Message, taskId: string) {
    const task = demo.tasks.find((t) => t.id === taskId);
    if (!task) return;
    setDemo((d) => confirmTask(d, taskId));
    setThreads((t) =>
      addTurns(t, m, demo, [
        { role: "host", text: `Simulate: ${task.personName} confirms`, action: true },
        {
          role: "assistant",
          text: `${task.personName} confirmed: on the way, arrives about ${clock(task.arrivesAt ?? Date.now())}.`,
          by: "saved",
        },
      ]),
    );
  }

  async function askAbout(m: Message, text: string) {
    const thread = threadFor(threads, m, demo);
    const history: AgentTurn[] = thread.turns.slice(-8).map((x) => ({ role: x.role, text: x.text }));
    setThreads((t) => addHostTurn(t, m, demo, text));
    setWsBusy(true);
    const arrival = arrivalForTask(demo.tasks, m);
    const lines = teamLines(team, slots, Date.now());
    if (arrival) {
      // Tell the AI who is already on the way, so a new reply says it too.
      lines.push(`On the way for #${m.id}: ${arrival.text}`.slice(0, 200));
    }
    try {
      const reply = await api.agent(
        text,
        history,
        agentState(messages, demo),
        m.id,
        lines,
        extraPayload(extra, demo),
      );
      setThreads((t) =>
        syncArrival(addReply(t, m, demo, reply, Date.now(), staff), m, demo, arrival),
      );
      if (reply.ai_left_today !== null) setAiLeft(reply.ai_left_today);
    } catch (e) {
      setThreads((t) => addReply(t, m, demo, errorReply((e as Error).message)));
    } finally {
      setWsBusy(false);
    }
  }

  async function compose(brief: string, propertyId: number | null) {
    setBusy(true);
    try {
      const result = await api.compose(brief, propertyId);
      if (result.ai_left_today !== null) setAiLeft(result.ai_left_today);
      return result;
    } catch (e) {
      setToast(`Could not write the message: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function addComposed(result: ComposeResult) {
    const received = new Date().toISOString().replace("Z", "");
    const next = addExtra(extra, { ...result.message, received_at: received });
    setExtra(next);
    const added = next[0];
    // Open it straight away, with its review and plan.
    setThreads((t) => ensureThread(t, added, demo, staff));
    setView("inbox");
    setAskOpen(false);
    setOpenId(added.id);
  }

  function reset() {
    setDemo({ ...EMPTY_STATE, startedAt: Date.now() });
    setExtra([]);
    setThreads({});
    setOpenId(null);
    setToast(null);
  }

  const aiLabel = meta
    ? isAi(meta.provider)
      ? `AI replies left today: ${aiLeft ?? meta.agent_limit_per_day}`
      : "Quick commands (no AI key)"
    : "";

  return (
    <div className={`page page-full${open || askOpen ? " page-focus" : ""}`}>
      <header className="header">
        <div>
          <h1>Guest Inbox Assistant</h1>
          <p className="muted">
            Every guest message arrives sorted and reviewed by AI, with a plan. Open one, agree to
            the plan, then go through it step by step.
          </p>
        </div>
        <div className="header-tags">
          <span className="tag">Demo · fake data</span>
          {meta && <span className="tag tag-ai">AI: {providerLabel(meta.provider)}</span>}
        </div>
      </header>

      {loadError && <p className="error">Could not load the inbox: {loadError}</p>}

      <section className="shiftbar" aria-label="Shift">
        <div className="stats">
          <span className="stat">
            <strong>{stats.waiting}</strong> waiting
          </span>
          <span className="stat stat-urgent">
            <strong>{stats.urgent}</strong> urgent
          </span>
          <span className="stat stat-overdue">
            <strong>{stats.overdue}</strong> overdue
          </span>
          <span className="stat stat-host">
            <strong>{stats.needsHost}</strong> need you
          </span>
          <span className="stat">
            <strong>{stats.openTasks}</strong> open tasks
          </span>
        </div>
        <div className="shiftbar-actions">
          <button
            type="button"
            className="btn btn-secondary phone-only"
            onClick={() => setAskOpen(true)}
          >
            New guest message
          </button>
          <button
            type="button"
            className="link small"
            onClick={reset}
            title="Clear your statuses, tasks, added messages and threads (saved only in this browser)"
          >
            Reset demo
          </button>
        </div>
      </section>

      {toast && (
        <p className="toast" role="status">
          {toast}{" "}
          <button type="button" className="link small" onClick={() => setToast(null)}>
            Close
          </button>
        </p>
      )}

      <main className={`shell2${open ? " has-open" : askOpen ? " ask-open" : ""}`}>
        <section className="queue-col">
          <div className="tabs">
            <div role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                className={`tab${view === "inbox" ? " tab-on" : ""}`}
                aria-selected={view === "inbox"}
                onClick={() => setView("inbox")}
              >
                Inbox <span className="tab-badge">{stats.waiting}</span>
              </button>
              <button
                type="button"
                role="tab"
                className={`tab${view === "tasks" ? " tab-on" : ""}`}
                aria-selected={view === "tasks"}
                onClick={() => setView("tasks")}
              >
                Tasks <span className="tab-badge">{stats.openTasks}</span>
              </button>
            </div>
          </div>

          {view === "tasks" ? (
            <section className="tasks-panel">
              <TeamDay team={team} slots={slots} properties={properties} now={now} />
              <h3 className="tasks-head">Tasks</h3>
              <TasksView
                tasks={demo.tasks}
                onToggle={(id) => setDemo((s) => toggleTask(s, id))}
                onOpen={(m) => openMessage(m.id)}
                now={now}
                findMessage={(t) => messages.find((m) => messageKey(m) === t.messageKey)}
              />
            </section>
          ) : (
            <>
              <div className="list-head" role="group" aria-label="Show">
                {QUEUE_VIEWS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className={`list-head-btn${queueView === v.key ? " list-head-on" : ""}`}
                    onClick={() => setQueueView(v.key)}
                    aria-pressed={queueView === v.key}
                  >
                    {v.label}
                    <span className="list-head-count">{viewCounts[v.key]}</span>
                  </button>
                ))}
              </div>
              <nav className="filters filters-compact" aria-label="Filter by topic">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`filter${filter === f.key ? " filter-on" : ""}${f.key === "urgent" ? " filter-urgent" : ""}${f.key === "needs_host" ? " filter-host" : ""}`}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                  >
                    {f.label} <span className="count">{counts[f.key]}</span>
                  </button>
                ))}
              </nav>
              <ul className="list" aria-label="Guest messages">
                {queue.map((m) => {
                  const s = statusOf(m, demo).status;
                  return (
                    <MessageRow
                      key={m.id}
                      message={m}
                      selected={m.id === openId}
                      onSelect={() => openMessage(m.id)}
                      extra={
                        <>
                          <span className={`channel channel-${m.channel}`}>
                            {channelLabel(m.channel)}
                          </span>
                          <span className={`status status-${s}`}>{STATUS_LABELS[s]}</span>
                          <WaitChip wait={waitInfo(m, demo, now)} />
                        </>
                      }
                    />
                  );
                })}
                {queue.length === 0 && messages.length > 0 && (
                  <li className="muted empty">
                    {queueView === "todo" ? "Nothing waiting here. Nice." : "No messages here."}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        <aside className="panel-col">
          {open ? (
            <MessageWorkspace
              key={open.id}
              message={open}
              property={properties.find((p) => p.id === open.property_id)}
              status={statusOf(open, demo).status}
              wait={waitInfo(open, demo, now)}
              thread={threadFor(threads, open, demo)}
              team={team}
              tasks={demo.tasks}
              assignFor={(task) =>
                team.people.length
                  ? assign(team, slots, task, open.property_id, now, {
                      pick: task.person || undefined,
                    })
                  : null
              }
              onNoAnswer={(id) => noAnswer(open, id)}
              onConfirm={(id) => confirmed(open, id)}
              busy={wsBusy}
              aiLabel={aiLabel}
              onClose={() => {
                setOpenId(null);
              }}
              onNext={next ? goNext : null}
              onAgree={() => setThreads((t) => agreePlan(t, open, demo))}
              onApprove={(p) => approveProposals(open, [p])}
              onChange={(p, change) => setThreads((t) => setProposal(t, open, demo, p.pid, change))}
              onDismiss={(p) => setThreads((t) => resolveStep(t, open, demo, p.pid, "dismissed"))}
              onStatus={(s) => setDemo((d) => setStatus(d, open, s))}
              onAsk={(text) => void askAbout(open, text)}
            />
          ) : (
            <ComposePanel
              properties={properties}
              busy={busy}
              aiLabel={aiLabel}
              maxChars={meta?.max_message_chars ?? 1000}
              onWrite={compose}
              onAdd={addComposed}
              onClose={() => setAskOpen(false)}
            />
          )}
        </aside>
      </main>

      <footer className="footer muted small">
        Demo app with invented properties and guests. Nothing is ever sent to a guest or a team
        member. AI-assisted build, human-reviewed.
      </footer>
    </div>
  );
}
