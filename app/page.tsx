"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleCheck,
  Clock3,
  Code2,
  Copy,
  FileText,
  GitBranch,
  Hash,
  Layers3,
  Link2,
  ListTodo,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  adrMarkdown,
  summaryMarkdown,
  time,
  type Meeting,
  type Decision,
  type Action,
  type Delivery,
  type Destination,
  type IntegrationStatus,
} from "@/lib/types";
import { sampleMeetings } from "@/lib/sample";

type View = "meetings" | "decisions" | "actions" | "integrations";
type ModalState =
  | { type: "import" }
  | { type: "editDecision"; meeting: Meeting; item: Decision }
  | { type: "editAction"; meeting: Meeting; item: Action }
  | { type: "adr"; meeting: Meeting; item: Decision }
  | { type: "publish"; meeting: Meeting }
  | { type: "help" }
  | null;
const emptyStatus: IntegrationStatus = {
  linear: false,
  github: false,
  slack: false,
  notion: false,
  meetstream: false,
  ai: false,
};
const names: Record<Destination, string> = {
  linear: "Linear",
  github: "GitHub",
  slack: "Slack",
  notion: "Notion",
};
const integrationsInfo = [
  {
    id: "linear",
    name: "Linear",
    description:
      "Turn approved action items into assigned issues, with the full context attached.",
    tag: "Issue tracking",
    letter: "◒",
    color: "#625de4",
    env: "LINEAR_API_KEY, LINEAR_TEAM_ID, LINEAR_ASSIGNEES",
    url: "https://linear.app/settings/api",
  },
  {
    id: "github",
    name: "GitHub",
    description:
      "Keep execution close to your code with assigned, evidence-linked GitHub issues.",
    tag: "Development",
    letter: "github",
    color: "#262b35",
    env: "GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_ASSIGNEES",
    url: "https://github.com/settings/personal-access-tokens",
  },
  {
    id: "slack",
    name: "Slack",
    description:
      "Share a concise summary of the decisions and next steps with your team.",
    tag: "Communication",
    letter: "slack",
    color: "#90238c",
    env: "SLACK_WEBHOOK_URL",
    url: "https://api.slack.com/apps",
  },
  {
    id: "notion",
    name: "Notion",
    description:
      "Publish accepted architecture decisions to your team’s knowledge base.",
    tag: "Documentation",
    letter: "N",
    color: "#25262b",
    env: "NOTION_API_KEY, NOTION_PARENT_PAGE_ID",
    url: "https://www.notion.so/profile/integrations",
  },
  {
    id: "meetstream",
    name: "MeetStream",
    description:
      "Bring speaker-attributed, timestamped transcripts directly from your meetings.",
    tag: "Meeting infrastructure",
    letter: "wave",
    color: "#6654c0",
    env: "MEETSTREAM_API_KEY",
    url: "https://app.meetstream.ai/api-key",
  },
  {
    id: "ai",
    name: "Anthropic",
    description:
      "Extract contextual decisions and commitments with Claude. Rules work without a key.",
    tag: "Intelligence",
    letter: "✳",
    color: "#ad7054",
    env: "ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional)",
    url: "https://console.anthropic.com/",
  },
] as const;
function Github({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.13.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 .1 1.63 2.02 3.28 1.45.1-.72.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.55 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.31-2.63 5.26-5.14 5.54.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}
function Avatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "xs" | "md";
}) {
  const colors = ["lavender", "peach", "mint", "blue"];
  const color =
    colors[Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % 4];
  return (
    <span title={name} className={`avatar ${size} ${color}`}>
      {name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function AppIcon({ id }: { id: string }) {
  return (
    <span className={`app-icon ${id}`}>
      {id === "github" ? (
        <Github size={22} />
      ) : id === "slack" ? (
        <Hash size={25} />
      ) : id === "notion" ? (
        <b>N</b>
      ) : id === "meetstream" ? (
        <AudioLines size={23} />
      ) : id === "ai" ? (
        <span>✳</span>
      ) : (
        <span>◒</span>
      )}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button
          aria-label="Close dialog"
          className="icon-button"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Waveform({ small = false }: { small?: boolean }) {
  return (
    <div className={`waveform ${small ? "small" : ""}`} aria-hidden="true">
      {Array.from({ length: small ? 18 : 55 }, (_, i) => (
        <i
          key={i}
          style={{
            height: `${14 + Math.abs(Math.sin(i * 1.83) * Math.cos(i * 0.26)) * 68}%`,
            opacity: 0.3 + Math.abs(Math.sin(i * 0.44)) * 0.7,
          }}
        />
      ))}
    </div>
  );
}
function dateLabel(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
function download(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await r.json()) as {
    meetings: Meeting[];
    meeting: Meeting;
    deliveries: Delivery[];
    integrations: IntegrationStatus;
    signedIn: boolean;
    error?: string;
    transcript: string;
    duplicate: boolean;
    sent: number;
    skipped: number;
  };
  if (!r.ok) throw new Error(data.error || "The request failed. Try again.");
  return data;
}

export default function Trace() {
  const [meetings, setMeetings] = useState<Meeting[]>(sampleMeetings),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [connections, setConnections] = useState(emptyStatus),
    [view, setView] = useState<View>("meetings"),
    [selected, setSelected] = useState<string | null>(null),
    [segment, setSegment] = useState<string | null>(null),
    [tab, setTab] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState<ModalState>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!mobileNav) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLAnchorElement>(".sidebar .brand")?.focus(),
    );
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNav(false);
    };
    const closeOnDesktop = () => {
      if (innerWidth > 760) setMobileNav(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
      cancelAnimationFrame(frame);
      document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
    };
  }, [mobileNav]);

  async function load() {
    setError("");
    try {
      const data = await api("/api/workspace");
      setMeetings(data.meetings);
      setDeliveries(data.deliveries);
      setConnections(data.integrations);
      setSignedIn(data.signedIn);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const readUrl = () => {
      const p = new URLSearchParams(location.search);
      setSelected(p.get("meeting"));
      setSegment(p.get("segment"));
    };
    readUrl();
    window.addEventListener("popstate", readUrl);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("popstate", readUrl);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (segment && selected) {
      document
        .getElementById(`segment-${segment}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [segment, selected, loading]);
  const current = meetings.find((m) => m.id === selected);
  function navigate(next: View) {
    setView(next);
    setSelected(null);
    setSearch("");
    setFilter("all");
    setMobileNav(false);
    history.pushState({}, "", "/");
  }
  function openMeeting(m: Meeting) {
    setSelected(m.id);
    setView("meetings");
    setTab("overview");
    setSegment(null);
    history.pushState({}, "", `/?meeting=${encodeURIComponent(m.id)}`);
    window.scrollTo(0, 0);
  }
  function showEvidence(m: Meeting, id: string) {
    setSelected(m.id);
    setView("meetings");
    setSegment(id);
    requestAnimationFrame(() =>
      document
        .getElementById(`segment-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
    history.pushState(
      {},
      "",
      `/?meeting=${encodeURIComponent(m.id)}&segment=${encodeURIComponent(id)}`,
    );
  }
  async function persist(m: Meeting) {
    if (!signedIn) {
      setError("Sign in to save your changes.");
      return;
    }
    setBusy(true);
    try {
      const data = await api(`/api/meetings/${encodeURIComponent(m.id)}`, {
        method: "PUT",
        body: JSON.stringify(m),
      });
      setMeetings((prev) =>
        prev.map((x) => (x.id === m.id ? data.meeting : x)),
      );
      return data.meeting as Meeting;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approveAll(m: Meeting) {
    const result = await persist({
      ...m,
      decisions: m.decisions.map((d) => ({ ...d, approved: true })),
      actions: m.actions.map((a) => ({ ...a, approved: true })),
      reviewed: true,
    });
    if (result)
      setToast(
        m.source === "sample"
          ? "Sample meeting reviewed. Import a real transcript to publish."
          : "Meeting reviewed. Your approved outputs are ready to publish.",
      );
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard");
    } catch {
      setError("Clipboard access is unavailable. Use Download instead.");
    }
  }
  const outstanding = meetings.filter((m) => !m.reviewed),
    latest = outstanding[0] || meetings[0];
  const allDecisions = meetings.flatMap((m) =>
      m.decisions.map((item) => ({ meeting: m, item })),
    ),
    allActions = meetings.flatMap((m) =>
      m.actions.map((item) => ({ meeting: m, item })),
    );
  const visibleMeetings = meetings.filter(
    (m) =>
      (filter !== "review" || !m.reviewed) &&
      (filter !== "real" || m.source !== "sample") &&
      `${m.title} ${m.project} ${m.summary}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const published = deliveries.filter((d) => d.status === "sent").length;
  function evidence(m: Meeting, ids: string[]) {
    return (
      <div className="evidence-links">
        {ids.map((id) => {
          const s = m.segments.find((s) => s.id === id);
          return s ? (
            <button
              key={id}
              onClick={() => showEvidence(m, id)}
              title={`Read ${s.speaker} at ${time(s.start)}`}
            >
              <AudioLines size={12} />
              {time(s.start)}
            </button>
          ) : null;
        })}
        <span>From the transcript</span>
      </div>
    );
  }
  function decisionCard(m: Meeting, d: Decision, compact = false) {
    return (
      <article className="decision-card" key={`${m.id}-${d.id}`}>
        <div className="card-top">
          <span className={`badge ${d.approved ? "green" : "purple"}`}>
            <GitBranch size={11} />
            {d.approved ? "Accepted" : "Decision draft"}
          </span>
          <button
            className="icon-button"
            title="Edit decision"
            aria-label={`Edit ${d.title}`}
            onClick={() =>
              setModal({ type: "editDecision", meeting: m, item: d })
            }
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
        <h3>{d.title}</h3>
        <p>{compact ? d.context.slice(0, 140) : d.context}</p>
        {evidence(m, d.evidence)}
        <div className="card-bottom">
          <button
            className="text-button"
            onClick={() => setModal({ type: "adr", meeting: m, item: d })}
          >
            <FileText size={14} />
            View ADR draft
          </button>
          <button
            disabled={busy || loading}
            className={`approve-button ${d.approved ? "accepted" : ""}`}
            onClick={() =>
              persist({
                ...m,
                reviewed: false,
                decisions: m.decisions.map((x) =>
                  x.id === d.id ? { ...x, approved: !x.approved } : x,
                ),
              })
            }
          >
            <Check size={13} />
            {d.approved ? "Accepted" : "Accept decision"}
          </button>
        </div>
      </article>
    );
  }
  function actionRow(m: Meeting, a: Action) {
    const sent = deliveries.filter(
      (d) => d.meetingId === m.id && d.itemId === a.id && d.status === "sent",
    );
    return (
      <article
        key={`${m.id}-${a.id}`}
        className={`action-row ${a.completed ? "complete" : ""}`}
      >
        <button
          className={`task-check ${a.completed ? "checked" : ""}`}
          aria-label={`${a.completed ? "Reopen" : "Complete"} ${a.title}`}
          disabled={busy || loading}
          onClick={() =>
            persist({
              ...m,
              actions: m.actions.map((x) =>
                x.id === a.id ? { ...x, completed: !x.completed } : x,
              ),
            })
          }
        >
          {a.completed && <Check size={12} />}
        </button>
        <div className="action-body">
          <button
            className="action-title"
            onClick={() =>
              setModal({ type: "editAction", meeting: m, item: a })
            }
          >
            {a.title}
          </button>
          {!current && (
            <button className="meeting-context" onClick={() => openMeeting(m)}>
              {m.title}
            </button>
          )}
          {evidence(m, a.evidence)}
          {sent.map((d) => (
            <a
              className="external-link"
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noreferrer"
            >
              {names[d.destination]} <ArrowRight size={12} />
            </a>
          ))}
        </div>
        <span
          className={`priority ${a.priority.toLowerCase()}`}
          title={`${a.priority} priority`}
        >
          <i />
          <i />
          <i />
        </span>
        <span className="action-owner">
          {a.owner ? (
            <>
              <Avatar name={a.owner} size="xs" />
              <span>{a.owner.split(" ")[0]}</span>
            </>
          ) : (
            <span className="unassigned">Unassigned</span>
          )}
        </span>
        <button
          className={`mini-approve ${a.approved ? "accepted" : ""}`}
          disabled={busy || loading}
          aria-label={`${a.approved ? "Unapprove" : "Approve"} ${a.title}`}
          onClick={() =>
            persist({
              ...m,
              reviewed: false,
              actions: m.actions.map((x) =>
                x.id === a.id ? { ...x, approved: !x.approved } : x,
              ),
            })
          }
        >
          {a.approved ? <Check size={14} /> : <span>Approve</span>}
        </button>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <aside id="sidebar" className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("meetings");
          }}
          className="brand"
          aria-label="Trace home"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          trace<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">
            <Code2 size={18} />
          </span>
          <div>
            <strong>Engineering</strong>
            <span>Team workspace</span>
          </div>
          <span className="workspace-status" title="Workspace active" />
        </div>
        <span className="nav-label">Workspace</span>
        <nav aria-label="Main navigation">
          {(
            [
              {
                id: "meetings",
                label: "Meetings",
                icon: AudioLines,
                count: meetings.length,
              },
              {
                id: "decisions",
                label: "Decisions",
                icon: GitBranch,
                count: allDecisions.length,
              },
              {
                id: "actions",
                label: "Action items",
                icon: ListTodo,
                count: allActions.filter((x) => !x.item.completed).length,
              },
              { id: "integrations", label: "Integrations", icon: Layers3 },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={`nav-item ${view === n.id ? "active" : ""}`}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {"count" in n && <span className="nav-count">{n.count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-projects">
          <span className="nav-label">Projects</span>
          {["Platform", "Frontend", "Infrastructure", "Product"].map((p, i) => (
            <button
              key={p}
              className="project-nav"
              onClick={() => {
                navigate("meetings");
                setSearch(p);
              }}
            >
              <span className={`project-dot dot-${i}`} />
              {p}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="open-source-note">
            <span>
              <GitBranch size={16} />
              Built in the open
            </span>
            <p>
              Your meetings. Your decisions.
              <br />
              Your infrastructure.
            </p>
            <a
              href="https://github.com/Arjun220905/engineering-decision-agent"
              target="_blank"
              rel="noreferrer"
            >
              Explore the source
              <ArrowRight size={13} />
            </a>
          </div>
          <button
            className="bottom-link"
            onClick={() => setModal({ type: "help" })}
          >
            <CircleHelp size={17} />
            Help & documentation
          </button>
          <button
            className="bottom-link"
            onClick={() => navigate("integrations")}
          >
            <Settings2 size={17} />
            Workspace settings
          </button>
          <div className="profile">
            <Avatar name="Engineering Team" size="md" />
            <div>
              <strong>Engineering team</strong>
              <span>
                {signedIn ? "Personal workspace" : "Explore the demo"}
              </span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="app-main" inert={mobileNav}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="sidebar"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span className="breadcrumb-icon">
              <Layers3 size={16} />
            </span>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <button onClick={() => navigate(view)}>
              {view === "actions"
                ? "Action items"
                : view[0].toUpperCase() + view.slice(1)}
            </button>
            {current && (
              <>
                <ChevronRight size={13} />
                <strong>{current.title}</strong>
              </>
            )}
          </div>
          <div className="topbar-end">
            <span className="private-label">
              <ShieldCheck size={13} />
              Private workspace
            </span>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => setModal({ type: "help" })}
            >
              <CircleHelp size={18} />
            </button>
            <Avatar name="Engineering Team" />
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              onClick={() => {
                setError("");
                if (!signedIn)
                  location.href = "/signin-with-chatgpt?return_to=/";
              }}
            >
              {signedIn ? "Dismiss" : "Sign in"}
              <X size={14} />
            </button>
          </div>
        )}
        {!signedIn && !loading && (
          <div className="demo-banner">
            <Sparkles size={13} />
            <span>
              You’re exploring a sample workspace. Sign in to save your work.
            </span>
            <a href="/signin-with-chatgpt?return_to=/" target="_top">
              Sign in
              <ArrowRight size={13} />
            </a>
          </div>
        )}
        {loading ? (
          <main className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <p>Opening your workspace…</p>
          </main>
        ) : current ? (
          <main className="detail-page">
            <button className="back-link" onClick={() => navigate("meetings")}>
              <ArrowLeft size={14} />
              All meetings
            </button>
            <div className="detail-heading">
              <div>
                <div className="heading-kicker">
                  <span className="project-chip">
                    <span className="project-dot dot-0" />
                    {current.project}
                  </span>
                  {current.source === "sample" && (
                    <span className="sample-label">Sample meeting</span>
                  )}
                </div>
                <h1>{current.title}</h1>
                <div className="meeting-meta">
                  <span>
                    <CalendarDays size={14} />
                    {dateLabel(current.date)},{" "}
                    {new Date(current.date).getFullYear()}
                  </span>
                  <span>
                    <Clock3 size={14} />
                    {Math.ceil(current.duration / 60)} min
                  </span>
                  <span>
                    <Video size={14} />
                    {current.platform}
                  </span>
                  <div className="avatar-stack">
                    {Array.from(new Set(current.segments.map((s) => s.speaker)))
                      .slice(0, 4)
                      .map((n) => (
                        <Avatar name={n} key={n} size="xs" />
                      ))}
                  </div>
                </div>
              </div>
              <button
                className="button primary"
                onClick={() => setModal({ type: "publish", meeting: current })}
              >
                <CheckCheck size={16} />
                Review & publish
              </button>
            </div>
            <div className="review-layout">
              <section className="review-content">
                <div className="summary-box">
                  <div className="section-icon">
                    <Sparkles size={16} />
                    <h2>Meeting at a glance</h2>
                    <span className="extraction-label">
                      {current.extraction === "sample"
                        ? "Curated sample"
                        : current.extraction === "ai"
                          ? "AI draft"
                          : "Rule-based draft"}
                    </span>
                  </div>
                  <p>{current.summary}</p>
                  <div className="summary-stats">
                    <span>
                      <GitBranch size={14} />
                      <b>{current.decisions.length}</b> decisions
                    </span>
                    <span>
                      <ListTodo size={14} />
                      <b>{current.actions.length}</b> action items
                    </span>
                    <span>
                      <CircleHelp size={14} />
                      <b>{current.questions.length}</b> open questions
                    </span>
                  </div>
                </div>
                <div
                  className="detail-tabs"
                  role="group"
                  aria-label="Meeting outputs"
                >
                  {[
                    "overview",
                    "decisions",
                    "actions",
                    "questions",
                    "activity",
                  ].map((t) => (
                    <button
                      aria-pressed={tab === t}
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                    >
                      {t === "actions"
                        ? "Action items"
                        : t[0].toUpperCase() + t.slice(1)}
                      {t === "decisions" && (
                        <span>{current.decisions.length}</span>
                      )}
                    </button>
                  ))}
                </div>
                {(tab === "overview" || tab === "decisions") && (
                  <section className="output-section">
                    <div className="section-heading">
                      <h2>
                        <GitBranch size={17} />
                        Decisions
                        <span className="count-pill">
                          {current.decisions.length}
                        </span>
                      </h2>
                      <span className="muted">
                        Every decision has a source.
                      </span>
                    </div>
                    <div className="decision-list">
                      {current.decisions.map((d) => decisionCard(current, d))}
                    </div>
                    {!current.decisions.length && (
                      <div className="empty-small">
                        No explicit decisions found. Review the transcript for
                        any missing context.
                      </div>
                    )}
                  </section>
                )}
                {(tab === "overview" || tab === "actions") && (
                  <section className="output-section">
                    <div className="section-heading">
                      <h2>
                        <ListTodo size={17} />
                        Action items
                        <span className="count-pill">
                          {current.actions.length}
                        </span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() =>
                          download(
                            "action-items.json",
                            JSON.stringify(current.actions, null, 2),
                            "application/json",
                          )
                        }
                      >
                        <ArrowDownToLine size={14} />
                        Export
                      </button>
                    </div>
                    <div className="actions-list">
                      {current.actions.map((a) => actionRow(current, a))}
                    </div>
                    {!current.actions.length && (
                      <div className="empty-small">
                        No explicit commitments found in this transcript.
                      </div>
                    )}
                  </section>
                )}
                {(tab === "overview" || tab === "questions") &&
                  current.questions.length > 0 && (
                    <section className="output-section">
                      <div className="section-heading">
                        <h2>
                          <CircleHelp size={17} />
                          Open questions
                        </h2>
                      </div>
                      {current.questions.map((q, i) => (
                        <div className="question-row" key={i}>
                          <span>?</span>
                          <p>{q}</p>
                        </div>
                      ))}
                    </section>
                  )}
                {tab === "questions" && !current.questions.length && (
                  <div className="empty-small">
                    No open questions were extracted.
                  </div>
                )}
                {tab === "activity" && (
                  <section className="output-section">
                    <div className="section-heading">
                      <h2>Publishing activity</h2>
                    </div>
                    {deliveries
                      .filter((d) => d.meetingId === current.id)
                      .map((d) => (
                        <div key={d.id} className="delivery-row">
                          <AppIcon id={d.destination} />
                          <div>
                            <strong>{names[d.destination]}</strong>
                            <p>
                              {d.status === "sent"
                                ? "Published"
                                : d.status === "pending"
                                  ? "Publishing or awaiting reconciliation"
                                  : "Check destination before retrying"}
                            </p>
                            {d.error && <small>{d.error}</small>}
                          </div>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noreferrer">
                              Open
                              <ArrowRight size={12} />
                            </a>
                          )}
                        </div>
                      ))}
                    {!deliveries.some((d) => d.meetingId === current.id) && (
                      <div className="empty-small">
                        No external actions yet. Approved outputs appear here
                        after publishing.
                      </div>
                    )}
                  </section>
                )}
                <div className="review-footer">
                  <ShieldCheck size={15} />
                  <span>Drafts stay here until you review and publish.</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        "meeting.json",
                        JSON.stringify(current, null, 2),
                        "application/json",
                      )
                    }
                  >
                    Export meeting
                    <ArrowDownToLine size={13} />
                  </button>
                </div>
              </section>
              <aside className="transcript-panel">
                <div className="transcript-title">
                  <h2>
                    <AudioLines size={17} />
                    Source transcript
                  </h2>
                  <span className="badge green">
                    <span className="tiny-dot" />
                    Evidence
                  </span>
                </div>
                <div className="transcript-subtitle">
                  The context behind every next step.
                </div>
                <div className="transcript-wave">
                  <Waveform small />
                  <span>{time(current.duration)}</span>
                </div>
                <div className="transcript-scroll">
                  {current.segments.map((s) => (
                    <article
                      id={`segment-${s.id}`}
                      key={s.id}
                      className={`transcript-turn ${segment === s.id ? "highlight" : ""}`}
                    >
                      <div>
                        <Avatar name={s.speaker} size="xs" />
                        <strong>{s.speaker}</strong>
                        <button
                          title="Copy link to this moment"
                          onClick={() => {
                            showEvidence(current, s.id);
                            copy(
                              `${location.origin}/?meeting=${encodeURIComponent(current.id)}&segment=${encodeURIComponent(s.id)}`,
                            );
                          }}
                        >
                          {time(s.start)}
                        </button>
                      </div>
                      <p>{s.text}</p>
                    </article>
                  ))}
                </div>
                <div className="transcript-foot">
                  <ShieldCheck size={12} />
                  Speaker-attributed · Timestamp-linked
                </div>
              </aside>
            </div>
          </main>
        ) : selected ? (
          <main className="empty-state">
            <FileText size={32} />
            <h1>Meeting not found</h1>
            <p>This meeting may belong to another workspace.</p>
            <button className="button" onClick={() => navigate("meetings")}>
              Back to meetings
            </button>
          </main>
        ) : view === "meetings" ? (
          <main className="dashboard">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  A little clarity. A lot of progress.
                </div>
                <h1>
                  Meetings, moving forward<span className="heading-dot">.</span>
                </h1>
                <p>Turn what was said into what happens next.</p>
              </div>
              <button
                className="button primary"
                onClick={() => setModal({ type: "import" })}
              >
                <Plus size={16} />
                Import meeting
              </button>
            </div>
            <div className="overview-strip">
              <span>
                <span className="status-dot" />
                Your workspace at a glance
              </span>
              <div>
                <span>
                  <b>{meetings.length}</b> meetings
                </span>
                <span>
                  <b>{allDecisions.length}</b> decisions captured
                </span>
                <span>
                  <b>{allActions.filter((x) => !x.item.completed).length}</b>{" "}
                  next steps
                </span>
              </div>
            </div>
            {latest && (
              <section className="featured-meeting">
                <div className="featured-content">
                  <div className="featured-kicker">
                    <span className="tiny-dot" />
                    {latest.reviewed
                      ? "Pick up where you left off"
                      : "Ready for your review"}
                    <span className="sample-label">
                      {latest.source === "sample"
                        ? "Sample meeting"
                        : "New transcript"}
                    </span>
                  </div>
                  <h2>{latest.title}</h2>
                  <p>{latest.summary}</p>
                  <div className="featured-bottom">
                    <div className="featured-pills">
                      <span>
                        <GitBranch size={13} />
                        {latest.decisions.length} decisions
                      </span>
                      <span>
                        <ListTodo size={13} />
                        {latest.actions.length} action items
                      </span>
                    </div>
                    <button
                      className="button dark"
                      onClick={() => openMeeting(latest)}
                    >
                      Review meeting
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="featured-art">
                  <div className="wave-label">
                    <AudioLines size={13} />A conversation with a next step
                  </div>
                  <Waveform />
                  <div className="art-output">
                    <span>
                      <GitBranch size={13} />
                      Decisions
                      <Check size={12} />
                    </span>
                    <span>
                      <ListTodo size={13} />
                      Action items
                      <Check size={12} />
                    </span>
                    <span>
                      <FileText size={13} />
                      ADR drafts
                      <Check size={12} />
                    </span>
                  </div>
                </div>
              </section>
            )}
            <div className="dashboard-grid">
              <section className="meetings-section">
                <div className="section-heading meetings-heading">
                  <h2>
                    Your meetings
                    <span className="count-pill">{meetings.length}</span>
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => setModal({ type: "import" })}
                  >
                    <Plus size={14} />
                    Add meeting
                  </button>
                </div>
                <div className="list-toolbar">
                  <div className="filter-tabs">
                    {[
                      { id: "all", label: "All meetings" },
                      { id: "review", label: "Needs review" },
                      { id: "real", label: "Imported" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        className={filter === f.id ? "active" : ""}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.label}
                        {f.id === "review" && outstanding.length > 0 && (
                          <span>{outstanding.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      ref={searchRef}
                      aria-label="Search meetings"
                      placeholder="Search meetings…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                </div>
                <div className="meeting-list">
                  {visibleMeetings.map((m, i) => (
                    <button
                      className="meeting-row"
                      key={m.id}
                      onClick={() => openMeeting(m)}
                    >
                      <span className={`meeting-icon icon-${i % 4}`}>
                        <AudioLines size={21} />
                      </span>
                      <span className="meeting-info">
                        <strong>{m.title}</strong>
                        <span>
                          <span className={`project-dot dot-${i % 4}`} />
                          {m.project}
                          <i />
                          {dateLabel(m.date)}
                          <i />
                          {Math.ceil(m.duration / 60)} min
                        </span>
                      </span>
                      <span className="row-outputs">
                        <span>
                          <GitBranch size={12} />
                          {m.decisions.length}
                        </span>
                        <span>
                          <ListTodo size={12} />
                          {m.actions.length}
                        </span>
                      </span>
                      <span
                        className={`meeting-status ${m.reviewed ? "reviewed" : "needs-review"}`}
                      >
                        {m.reviewed ? (
                          <Check size={11} />
                        ) : (
                          <span className="tiny-dot" />
                        )}
                        {m.reviewed ? "Reviewed" : "Needs review"}
                      </span>
                      <ChevronRight size={15} className="row-chevron" />
                    </button>
                  ))}
                </div>
                {!visibleMeetings.length && (
                  <div className="empty-state">
                    <Search size={28} />
                    <h3>
                      {filter === "real"
                        ? "Your next meeting starts here"
                        : "No meetings found"}
                    </h3>
                    <p>
                      {filter === "real"
                        ? "Import a transcript to turn a real conversation into next steps."
                        : "Try another search or clear your filters."}
                    </p>
                    <button
                      className="button"
                      onClick={() => {
                        if (filter === "real") setModal({ type: "import" });
                        else {
                          setSearch("");
                          setFilter("all");
                        }
                      }}
                    >
                      {filter === "real" ? "Import meeting" : "Clear filters"}
                    </button>
                  </div>
                )}
                <div className="list-foot">
                  <ShieldCheck size={12} />
                  <span>
                    Every output is linked to the moment that matters.
                  </span>
                  <span>{visibleMeetings.length} meetings</span>
                </div>
              </section>
              <aside className="dashboard-rail">
                <section className="attention-panel">
                  <div className="section-heading">
                    <h2>
                      <span className="attention-dot" />
                      Needs a next step
                    </h2>
                    <span className="count-pill">{outstanding.length}</span>
                  </div>
                  {outstanding.length ? (
                    <>
                      <div className="attention-icon">
                        <GitBranch size={20} />
                      </div>
                      <h3>A decision is only the beginning.</h3>
                      <p>
                        {latest?.decisions.filter((d) => !d.approved).length}{" "}
                        draft decisions are waiting for a second look. Give your
                        team a clear way forward.
                      </p>
                      <button
                        className="text-button purple-text"
                        onClick={() => openMeeting(outstanding[0])}
                      >
                        Review decisions
                        <ArrowRight size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <CircleCheck size={24} className="green-text" />
                      <h3>You’re all caught up.</h3>
                      <p>
                        Every meeting has been reviewed. Keep the momentum
                        going.
                      </p>
                    </>
                  )}
                </section>
                <section className="connected-panel">
                  <div className="section-heading">
                    <h2>Connect the dots</h2>
                    <Link2 size={15} />
                  </div>
                  <p>
                    Bring decisions to the tools
                    <br />
                    where your team builds.
                  </p>
                  <div className="integration-stack">
                    {["linear", "github", "slack", "notion"].map((id) => (
                      <AppIcon key={id} id={id} />
                    ))}
                  </div>
                  <button
                    className="button full"
                    onClick={() => navigate("integrations")}
                  >
                    Manage integrations
                    <ArrowRight size={13} />
                  </button>
                  <span className="connection-caption">
                    {
                      Object.entries(connections).filter(
                        ([k, v]) =>
                          ["linear", "github", "slack", "notion"].includes(k) &&
                          v,
                      ).length
                    }{" "}
                    of 4 connected
                  </span>
                </section>
              </aside>
            </div>
            <footer className="workspace-footer">
              <span>
                <span className="brand-mark mini">
                  <i />
                  <i />
                  <i />
                </span>
                Powered by{" "}
                <a
                  href="https://meetstream.ai"
                  target="_blank"
                  rel="noreferrer"
                >
                  MeetStream
                </a>
              </span>
              <span>Good conversations. Clear decisions. Real progress.</span>
              <span>
                Open source, by design <Github size={12} />
              </span>
            </footer>
          </main>
        ) : view === "decisions" || view === "actions" ? (
          <main className="collection-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">From conversation to commitment</div>
                <h1>
                  {view === "decisions"
                    ? "A record of the why."
                    : "A clear way forward."}
                </h1>
                <p>
                  {view === "decisions"
                    ? "Engineering decisions, with the context that makes them useful."
                    : "Owned work, grounded in what your team agreed."}
                </p>
              </div>
              <button
                className="button"
                onClick={() =>
                  download(
                    `${view}.json`,
                    JSON.stringify(
                      view === "decisions" ? allDecisions : allActions,
                      null,
                      2,
                    ),
                    "application/json",
                  )
                }
              >
                <ArrowDownToLine size={15} />
                Export {view === "decisions" ? "decisions" : "action items"}
              </button>
            </div>
            <div className="list-toolbar collection-toolbar">
              <div className="filter-tabs">
                {[
                  { id: "all", label: "All" },
                  {
                    id: "pending",
                    label: view === "decisions" ? "Drafts" : "To do",
                  },
                  {
                    id: "done",
                    label: view === "decisions" ? "Accepted" : "Completed",
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    className={filter === f.id ? "active" : ""}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="search-box">
                <Search size={15} />
                <input
                  ref={searchRef}
                  aria-label={`Search ${view}`}
                  placeholder={`Search ${view === "actions" ? "action items" : "decisions"}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {view === "decisions" ? (
              <div className="decisions-grid">
                {allDecisions
                  .filter(
                    ({ item }) =>
                      (filter === "all" ||
                        (filter === "done" ? item.approved : !item.approved)) &&
                      `${item.title} ${item.context}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map(({ meeting, item }) => (
                    <div key={`${meeting.id}-${item.id}`}>
                      <button
                        className="collection-context"
                        onClick={() => openMeeting(meeting)}
                      >
                        <AudioLines size={13} />
                        {meeting.title}
                        <ChevronRight size={12} />
                      </button>
                      {decisionCard(meeting, item, true)}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="actions-list collection-actions">
                {allActions
                  .filter(
                    ({ item }) =>
                      (filter === "all" ||
                        (filter === "done"
                          ? item.completed
                          : !item.completed)) &&
                      `${item.title} ${item.owner}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map(({ meeting, item }) => actionRow(meeting, item))}
              </div>
            )}
            {(view === "decisions"
              ? allDecisions.filter(
                  ({ item }) =>
                    (filter === "all" ||
                      (filter === "done" ? item.approved : !item.approved)) &&
                    `${item.title} ${item.context}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
              : allActions.filter(
                  ({ item }) =>
                    (filter === "all" ||
                      (filter === "done" ? item.completed : !item.completed)) &&
                    `${item.title} ${item.owner}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
            ).length === 0 && (
              <div className="empty-state">
                <Search size={26} />
                <h3>
                  No matching{" "}
                  {view === "actions" ? "action items" : "decisions"}
                </h3>
                <p>Try another search or clear your filters.</p>
                <button
                  className="button"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </main>
        ) : (
          <main className="integrations-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">A workflow that stays connected</div>
                <h1>Less busywork. More building.</h1>
                <p>Take your decisions wherever the work happens.</p>
              </div>
              <span className="badge green">
                <ShieldCheck size={12} />
                Credentials stay on your server
              </span>
            </div>
            <div className="integration-notice">
              <Link2 size={18} />
              <div>
                <strong>One review. A connected workflow.</strong>
                <p>
                  Connect your tools, review the drafts, then choose what to
                  publish. Trace remembers every delivery.
                </p>
              </div>
            </div>
            <div className="integrations-grid">
              {integrationsInfo.map((info) => (
                <article className="integration-card" key={info.id}>
                  <div className="integration-card-head">
                    <AppIcon id={info.id} />
                    <span
                      className={`badge ${connections[info.id] ? "green" : "neutral"}`}
                    >
                      {connections[info.id] ? (
                        <>
                          <span className="tiny-dot" />
                          Connected
                        </>
                      ) : (
                        <>Not connected</>
                      )}
                    </span>
                  </div>
                  <h2>
                    {info.name}
                    <span>{info.tag}</span>
                  </h2>
                  <p>{info.description}</p>
                  <details>
                    <summary>
                      {connections[info.id]
                        ? "View configuration"
                        : "Set up integration"}
                      <ChevronDown size={14} />
                    </summary>
                    <div className="setup-details">
                      <p>
                        Set these environment variables on your server, then
                        restart or redeploy:
                      </p>
                      <code>{info.env}</code>
                      {(info.id === "linear" || info.id === "github") && (
                        <p>
                          Map transcript speaker names to account IDs in the
                          assignees JSON. Trace checks every owner before
                          creating issues.
                        </p>
                      )}
                      <a href={info.url} target="_blank" rel="noreferrer">
                        Open {info.name} settings
                        <ArrowRight size={12} />
                      </a>
                    </div>
                  </details>
                </article>
              ))}
            </div>
            <div className="integration-security">
              <ShieldCheck size={21} />
              <div>
                <strong>You stay in control.</strong>
                <p>
                  No automatic external actions. No credentials in the browser.
                  No duplicate deliveries on retry.
                </p>
              </div>
              <button className="text-button" onClick={load}>
                Refresh connections
                <Activity size={14} />
              </button>
            </div>
            {published > 0 && (
              <p className="muted">
                {published} outputs published across your tools.
              </p>
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal?.type === "import" && (
        <ImportModal
          signedIn={signedIn}
          connections={connections}
          onClose={() => setModal(null)}
          onImported={(m, duplicate) => {
            setMeetings((prev) =>
              prev.some((x) => x.id === m.id) ? prev : [m, ...prev],
            );
            setModal(null);
            openMeeting(m);
            setToast(
              duplicate
                ? "This transcript is already in your workspace. No duplicate created."
                : "Meeting imported. Your drafts are ready for review.",
            );
          }}
        />
      )}
      {modal?.type === "editDecision" && (
        <EditDecisionModal
          error={error}
          meeting={modal.meeting}
          item={modal.item}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            const m = meetings.find((m) => m.id === modal.meeting.id)!;
            if (
              await persist({
                ...m,
                reviewed: false,
                decisions: m.decisions.map((x) => (x.id === d.id ? d : x)),
              })
            ) {
              setModal(null);
              setToast("Decision saved");
            }
          }}
        />
      )}
      {modal?.type === "editAction" && (
        <EditActionModal
          error={error}
          meeting={modal.meeting}
          item={modal.item}
          busy={busy}
          onClose={() => setModal(null)}
          onSave={async (a) => {
            const m = meetings.find((m) => m.id === modal.meeting.id)!;
            if (
              await persist({
                ...m,
                reviewed: false,
                actions: m.actions.map((x) => (x.id === a.id ? a : x)),
              })
            ) {
              setModal(null);
              setToast("Action item saved");
            }
          }}
        />
      )}
      {modal?.type === "adr" && (
        <Modal
          title="Architecture decision record"
          onClose={() => setModal(null)}
          wide
        >
          <div className="modal-body">
            <span className="badge purple">
              {modal.item.approved ? "Accepted" : "Proposed"} · Editable draft
            </span>
            <pre className="adr-preview">
              {adrMarkdown(
                modal.meeting,
                modal.item,
                typeof location !== "undefined" ? location.origin : "",
              )}
            </pre>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={() =>
                copy(adrMarkdown(modal.meeting, modal.item, location.origin))
              }
            >
              <Copy size={14} />
              Copy Markdown
            </button>
            <button
              className="button"
              onClick={() => {
                const m = modal;
                setModal({
                  type: "editDecision",
                  meeting: m.meeting,
                  item: m.item,
                });
              }}
            >
              Edit draft
            </button>
            <button
              className="button primary"
              onClick={() =>
                download(
                  `${modal.item.id}.md`,
                  adrMarkdown(modal.meeting, modal.item, location.origin),
                )
              }
            >
              <ArrowDownToLine size={14} />
              Download ADR
            </button>
          </div>
        </Modal>
      )}
      {modal?.type === "publish" && (
        <PublishModal
          meeting={meetings.find((m) => m.id === modal.meeting.id)!}
          connections={connections}
          deliveries={deliveries}
          busy={busy}
          onClose={() => setModal(null)}
          onApprove={approveAll}
          onPublish={async (destinations) => {
            setBusy(true);
            try {
              const m = meetings.find((m) => m.id === modal.meeting.id)!;
              const data = await api("/api/publish", {
                method: "POST",
                body: JSON.stringify({
                  meetingId: m.id,
                  revision: m.revision,
                  destinations,
                }),
              });
              setDeliveries(data.deliveries);
              setToast(
                `${data.sent} outputs published. ${data.skipped} previous deliveries skipped.`,
              );
              return data;
            } catch (e) {
              throw e;
            } finally {
              setBusy(false);
            }
          }}
          onCopy={() =>
            copy(
              summaryMarkdown(
                meetings.find((m) => m.id === modal.meeting.id)!,
                location.origin,
              ),
            )
          }
        />
      )}
      {modal?.type === "help" && (
        <Modal
          title="A conversation, carried forward"
          onClose={() => setModal(null)}
        >
          <div className="modal-body help-body">
            <p>
              Trace turns engineering meetings into decisions, ADR drafts and
              owned action items. Every output links back to its source.
            </p>
            <ol>
              <li>
                <b>Bring the conversation.</b> Import a timestamped transcript
                or fetch one from MeetStream.
              </li>
              <li>
                <b>Make it accurate.</b> Check the evidence, edit the drafts and
                confirm owners.
              </li>
              <li>
                <b>Move the work forward.</b> Publish approved outputs to your
                connected tools, or export Markdown and JSON.
              </li>
            </ol>
            <div className="inline-note">
              <ShieldCheck size={17} />
              Sample meetings are fictional and cannot be published externally.
              Rule-based extraction finds explicit agreements; configure Claude
              for contextual extraction.
            </div>
            <a
              className="button full"
              href="https://github.com/Arjun220905/engineering-decision-agent"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={16} />
              Read the documentation
              <ArrowRight size={14} />
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ImportModal({
  onClose,
  onImported,
  signedIn,
  connections,
}: {
  onClose: () => void;
  onImported: (m: Meeting, d: boolean) => void;
  signedIn: boolean;
  connections: IntegrationStatus;
}) {
  const [source, setSource] = useState("paste"),
    [title, setTitle] = useState(""),
    [project, setProject] = useState("Platform"),
    [transcript, setTranscript] = useState(""),
    [transcriptId, setTranscriptId] = useState(""),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [useAI, setUseAI] = useState(connections.ai),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!signedIn) {
      location.href = "/signin-with-chatgpt?return_to=/";
      return;
    }
    setBusy(true);
    setError("");
    try {
      let content = transcript;
      if (source === "meetstream") {
        const data = await api("/api/import", {
          method: "POST",
          body: JSON.stringify({ transcriptId }),
        });
        content = data.transcript;
      }
      const data = await api("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          title,
          project,
          transcript: content,
          date: new Date(`${date}T12:00:00`).toISOString(),
          useAI,
        }),
      });
      onImported(data.meeting, data.duplicate);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Bring a meeting to Trace"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <p className="modal-intro">
            Start with the conversation. We’ll help with the next steps.
          </p>
          <div className="source-tabs">
            <button
              type="button"
              className={source === "paste" ? "active" : ""}
              onClick={() => setSource("paste")}
            >
              <FileText size={15} />
              Paste or upload
            </button>
            <button
              type="button"
              className={source === "meetstream" ? "active" : ""}
              onClick={() => setSource("meetstream")}
            >
              <AudioLines size={15} />
              From MeetStream
            </button>
          </div>
          <label className="field">
            Meeting title
            <input
              required
              maxLength={200}
              placeholder="e.g. API v2 architecture review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Project
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                {[
                  "Platform",
                  "Frontend",
                  "Infrastructure",
                  "Product",
                  "Engineering",
                ].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Meeting date
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          {source === "paste" ? (
            <label className="field">
              Transcript
              <span className="field-hint">
                Include timestamps and speaker names, or upload MeetStream JSON.
              </span>
              <textarea
                required
                rows={8}
                placeholder={
                  "[00:12] Alex: We decided to use cursor-based pagination.\n[01:05] Sarah: I’ll write the specification."
                }
                value={transcript}
                maxLength={500000}
                onChange={(e) => setTranscript(e.target.value)}
              />
              <span className="upload-label">
                <ArrowDownToLine size={14} />
                Upload .txt or .json
                <input
                  type="file"
                  aria-label="Upload transcript"
                  accept=".txt,.json,.md,text/plain,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 500000) {
                        setError("Choose a file under 500 KB.");
                        return;
                      }
                      setTranscript(await file.text());
                      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                />
              </span>
            </label>
          ) : (
            <label className="field">
              MeetStream transcript ID
              <span className="field-hint">
                Use the transcript ID from your bot’s details, rather than the
                bot ID.
              </span>
              <input
                required
                placeholder="Paste transcript ID"
                value={transcriptId}
                onChange={(e) => setTranscriptId(e.target.value)}
              />
              {!connections.meetstream && (
                <span className="field-error">
                  Connect MeetStream in Integrations before importing by ID.
                </span>
              )}
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useAI}
              disabled={!connections.ai}
              onChange={(e) => setUseAI(e.target.checked)}
            />
            <span>
              Use Claude for contextual extraction
              <small>
                {connections.ai
                  ? "Creates grounded drafts with source evidence."
                  : "Not connected. Explicit decisions and commitments will be extracted with rules."}
              </small>
            </span>
            <Sparkles size={16} />
          </label>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span className="footer-hint">
            <ShieldCheck size={13} />
            Nothing is sent to your team.
          </span>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={
              busy || (source === "meetstream" && !connections.meetstream)
            }
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Sparkles size={15} />
            )}{" "}
            {busy
              ? "Preparing drafts…"
              : signedIn
                ? "Create meeting drafts"
                : "Sign in to import"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EditDecisionModal({
  item,
  meeting,
  onClose,
  onSave,
  busy,
  error,
}: {
  item: Decision;
  meeting: Meeting;
  onClose: () => void;
  onSave: (d: Decision) => void;
  busy: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState({ ...item });
  return (
    <Modal title="Edit decision" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <div className="modal-body">
          {(["title", "context", "rationale", "consequences"] as const).map(
            (field) => (
              <label className="field" key={field}>
                {field[0].toUpperCase() + field.slice(1)}
                {field === "title" ? (
                  <input
                    required
                    maxLength={300}
                    value={draft[field]}
                    onChange={(e) =>
                      setDraft({ ...draft, [field]: e.target.value })
                    }
                  />
                ) : (
                  <textarea
                    required
                    rows={3}
                    maxLength={4000}
                    value={draft[field]}
                    onChange={(e) =>
                      setDraft({ ...draft, [field]: e.target.value })
                    }
                  />
                )}
              </label>
            ),
          )}
          <p className="field-hint">
            Evidence preserved:{" "}
            {item.evidence
              .map((id) =>
                time(meeting.segments.find((s) => s.id === id)!.start),
              )
              .join(", ")}
            . Saving resets the meeting review.
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            Save decision
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EditActionModal({
  item,
  meeting,
  onClose,
  onSave,
  busy,
  error,
}: {
  item: Action;
  meeting: Meeting;
  onClose: () => void;
  onSave: (a: Action) => void;
  busy: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState({ ...item });
  return (
    <Modal title="Edit action item" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <div className="modal-body">
          <label className="field">
            Title
            <input
              required
              maxLength={300}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="field">
            Description
            <textarea
              rows={4}
              maxLength={4000}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <label className="field">
            Owner
            <select
              value={draft.owner}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            >
              <option value="">Unassigned</option>
              {Array.from(new Set(meeting.segments.map((s) => s.speaker))).map(
                (n) => (
                  <option key={n}>{n}</option>
                ),
              )}
            </select>
          </label>
          <div className="form-grid">
            <label className="field">
              Priority
              <select
                value={draft.priority}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    priority: e.target.value as Action["priority"],
                  })
                }
              >
                {["High", "Medium", "Low"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Due date
              <input
                type="date"
                value={draft.due}
                onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              />
            </label>
          </div>
          <p className="field-hint">
            Leave the due date empty when no deadline was agreed.
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Check size={15} />
            Save action item
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PublishModal({
  meeting: m,
  connections,
  deliveries,
  busy,
  onClose,
  onApprove,
  onPublish,
  onCopy,
}: {
  meeting: Meeting;
  connections: IntegrationStatus;
  deliveries: Delivery[];
  busy: boolean;
  onClose: () => void;
  onApprove: (m: Meeting) => Promise<void>;
  onPublish: (
    d: Destination[],
  ) => Promise<{ sent: number; skipped: number; deliveries: Delivery[] }>;
  onCopy: () => void;
}) {
  const [destinations, setDestinations] = useState<Destination[]>([]),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      sent: number;
      skipped: number;
      deliveries: Delivery[];
    } | null>(null);
  const approved = [...m.decisions, ...m.actions].filter(
    (x) => x.approved,
  ).length;
  const related = (result?.deliveries || deliveries).filter(
    (d) => d.meetingId === m.id,
  );
  return (
    <Modal
      title="From reviewed to ready"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <p className="modal-intro">
          Confirm the decisions and owners before they leave this workspace.
        </p>
        <div className="publish-summary">
          <span>
            <GitBranch size={17} />
            <b>
              {m.decisions.filter((d) => d.approved).length}/
              {m.decisions.length}
            </b>{" "}
            decisions accepted
          </span>
          <span>
            <ListTodo size={17} />
            <b>
              {m.actions.filter((a) => a.approved).length}/{m.actions.length}
            </b>{" "}
            actions approved
          </span>
        </div>
        <button
          className={`review-confirm ${m.reviewed ? "confirmed" : ""}`}
          disabled={busy}
          onClick={() => onApprove(m)}
        >
          <span className="review-checkbox">
            {m.reviewed && <Check size={14} />}
          </span>
          <span>
            <strong>
              {m.reviewed ? "Meeting reviewed" : "Accept all & mark reviewed"}
            </strong>
            <small>
              {m.reviewed
                ? "You can now export or publish approved outputs."
                : "I checked the evidence, wording and task owners."}
            </small>
          </span>
          <ShieldCheck size={18} />
        </button>
        {m.source === "sample" ? (
          <div className="inline-note">
            <Sparkles size={18} />
            <p>
              This is a fictional sample meeting. Try the review flow and export
              a summary. Import a real transcript to publish to your team.
            </p>
          </div>
        ) : (
          <>
            <h3 className="form-section-title">Choose where the work goes</h3>
            {(["linear", "github", "slack", "notion"] as Destination[]).map(
              (dest) => (
                <label
                  className={`destination-row ${!connections[dest] ? "disabled" : ""}`}
                  key={dest}
                >
                  <AppIcon id={dest} />
                  <span>
                    <strong>{names[dest]}</strong>
                    <small>
                      {dest === "slack"
                        ? "One meeting summary"
                        : dest === "notion"
                          ? "An ADR page for each accepted decision"
                          : "An assigned issue for each approved action"}
                    </small>
                  </span>
                  {connections[dest] ? (
                    <input
                      type="checkbox"
                      checked={destinations.includes(dest)}
                      onChange={(e) =>
                        setDestinations((prev) =>
                          e.target.checked
                            ? [...prev, dest]
                            : prev.filter((x) => x !== dest),
                        )
                      }
                    />
                  ) : (
                    <span className="muted">Not connected</span>
                  )}
                </label>
              ),
            )}
          </>
        )}
        <div className="publish-safety">
          <ShieldCheck size={14} />
          Previous deliveries are skipped. Uncertain outcomes are held for
          review.
        </div>
        {related.length > 0 && (
          <div className="publish-results">
            {related.map((d) => (
              <div key={d.id}>
                <span
                  className={`tiny-dot ${d.status === "sent" ? "green-dot" : "amber-dot"}`}
                />
                <span>
                  {names[d.destination]} ·{" "}
                  {d.itemId === "summary"
                    ? "Meeting summary"
                    : m.actions.find((a) => a.id === d.itemId)?.title ||
                      m.decisions.find((a) => a.id === d.itemId)?.title}
                  <small>
                    {d.status === "sent"
                      ? "Published"
                      : d.status === "pending"
                        ? "Pending — check destination before any manual retry"
                        : d.error ||
                          "Outcome uncertain — reconcile before retrying"}
                  </small>
                </span>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        {result && (
          <p role="status" className="success-text">
            {result.sent} published. {result.skipped} previous deliveries
            skipped.
          </p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="button" onClick={onCopy} disabled={!approved}>
          <Copy size={14} />
          Copy summary
        </button>
        {m.source === "sample" ? (
          <button
            className="button primary"
            disabled={busy || m.reviewed}
            onClick={() => onApprove(m)}
          >
            <CheckCheck size={15} />
            {m.reviewed ? "Reviewed" : "Mark reviewed"}
          </button>
        ) : (
          <button
            className="button primary"
            disabled={busy || !m.reviewed || !destinations.length || !approved}
            onClick={async () => {
              setError("");
              try {
                setResult(await onPublish(destinations));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <ArrowRight size={15} />
            )}
            Publish approved outputs
          </button>
        )}
      </div>
    </Modal>
  );
}
