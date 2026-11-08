"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Lightbulb,
  Loader2,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Upload,
  X,
} from "lucide-react";
import {
  FOUNDER_STORAGE_KEY,
  founderPatchSchema,
  appendFounderMessage,
  approveFounderProject,
  brandLogoSvg,
  brandTokensCss,
  brandTokensJson,
  buildHandoffMarkdown,
  createFounderProject,
  getFounderReadiness,
  isFounderApproved,
  parseFounderProject,
  productBriefMarkdown,
  selectFounderIdea,
  selectFounderName,
  updateFounderProject,
} from "@/lib/founder";
import type { FounderPatch, FounderProject, FounderStage } from "@/lib/founder";
import { HOSTED_STUDIO, MAC_DOWNLOAD_URL, assetPath } from "@/lib/hosting";
import { downloadFile, safeUrl, STORAGE_KEY, parseImport } from "@/lib/studio";
import { AgentSettings, useAgentConnection } from "./agent-settings";
import { founderFromExploration } from "@/lib/founder-migration";
import type { StudioProject } from "@/lib/studio-types";
import type { FounderProvider } from "./agent-settings";
import "./founder.css";

type PendingDraft = {
  projectId: string;
  revision: number;
  patch: FounderPatch;
};
type BuildJob = {
  id: string;
  projectId: string;
  projectRevision: number;
  projectTitle: string;
  provider: string;
  model: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  directory: string;
  logs: string[];
  error: string | null;
};
const STAGES: {
  id: FounderStage;
  short: string;
  title: string;
  subtitle: string;
  prompt: string;
  suggestions: string[];
}[] = [
  {
    id: "discover",
    short: "Discover",
    title: "Find something worth building.",
    subtitle:
      "Start with a frustration, a curiosity, or a person you want to help.",
    prompt:
      "You don’t need a polished idea. Tell me what keeps bothering you, what you know well, or who you would love to help. We’ll explore different directions and choose one worth pursuing.",
    suggestions: [
      "Help me find ideas from my skills and interests",
      "Challenge my idea and suggest three different directions",
      "Help me choose a specific first customer",
    ],
  },
  {
    id: "research",
    short: "Research",
    title: "What is already out there?",
    subtitle: "Understand the market before deciding what deserves to exist.",
    prompt:
      "Let’s look at direct competitors, the substitutes people already use, and the gaps worth investigating. Current research needs real sources. A gap is a hypothesis until customers help us test it.",
    suggestions: [
      "Research current competitors and substitutes",
      "What could make this meaningfully different?",
      "Which assumptions should I test with customers first?",
    ],
  },
  {
    id: "product",
    short: "Product",
    title: "Make the idea tangible.",
    subtitle:
      "Define what people can do, why it matters, and what success looks like.",
    prompt:
      "Picture the first person using this. What brought them here? What should they accomplish? We’ll turn that into a focused product brief: the experience, capabilities, and boundaries. Implementation choices come later with the builder.",
    suggestions: [
      "Draft the product brief from our chosen direction",
      "Walk through the first-time user experience",
      "Make the first version smaller and more valuable",
    ],
  },
  {
    id: "brand",
    short: "Name & brand",
    title: "Give your idea a character.",
    subtitle: "A memorable name, a clear promise, and a visual starting point.",
    prompt:
      "Let’s find names that fit the audience and the promise. We can compare options, choose a tone, and create a starter identity with a wordmark, monogram, colors, and type. Names still need availability checks before launch.",
    suggestions: [
      "Suggest five distinctive names with their rationale",
      "Develop a coherent brand direction for my chosen name",
      "Critique the name and make the promise clearer",
    ],
  },
  {
    id: "review",
    short: "Review",
    title: "Does it all fit together?",
    subtitle:
      "Review the decisions, open questions, product, and brand before building.",
    prompt:
      "Let’s review this as a founder and a skeptical first customer. Does the product solve the chosen problem? Does the research support the difference? Are the scope and brand coherent? We’ll close gaps before you approve the brief.",
    suggestions: [
      "Critique this plan as a skeptical first customer",
      "Find contradictions across the research, product, and brand",
      "What must be resolved before handing this to a builder?",
    ],
  },
  {
    id: "build",
    short: "Build",
    title: "From a clear brief to a first version.",
    subtitle: "Give your chosen builder the approved product and brand.",
    prompt:
      "Your approved brief becomes the builder’s source of truth. Choose Codex or Claude, then start a build in its own new local folder. The builder decides how to implement the product and reports what it completed.",
    suggestions: [
      "Summarize the product for a builder",
      "What should I check when the first version is ready?",
    ],
  },
];
const uid = () => crypto.randomUUID();
const lines = (value: string) =>
  value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const titleFor = (project: FounderProject) =>
  project.brand.selectedName || project.title;
const filenameFor = (project: FounderProject) =>
  titleFor(project)
    .replace(/[^a-z0-9 -]/gi, "")
    .trim()
    .slice(0, 70) || "Whatloom project";
function ConversationText({ text }: { text: string }) {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (link && safeUrl(link[2]))
        return (
          <a
            key={index}
            href={safeUrl(link[2])!}
            target="_blank"
            rel="noreferrer"
          >
            {link[1]}
          </a>
        );
      return part;
    });
}
function Field({
  label,
  value,
  onChange,
  placeholder = "",
  multiline = false,
  hint = "",
  maxLength = 20000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="f-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          maxLength={maxLength}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}{" "}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const serialized = value.join("\n");
  const [editing, setEditing] = useState({
    base: serialized,
    value: serialized,
  });
  const draft = editing.base === serialized ? editing.value : serialized;
  return (
    <label className="f-field">
      <span>{label}</span>
      <textarea
        value={draft}
        rows={3}
        placeholder={placeholder}
        maxLength={20000}
        onChange={(e) => {
          setEditing({ base: serialized, value: e.target.value });
        }}
        onBlur={() => onChange(lines(draft))}
      />
      <small>One item per line. Saved when you leave this field.</small>
    </label>
  );
}
function DraftPreview({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value ? <p>{value}</p> : null;
  if (Array.isArray(value))
    return (
      <div className="f-draft-preview">
        {value.map((item, index) => (
          <div key={index}>
            <DraftPreview value={item} />
          </div>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="f-draft-preview">
        {Object.entries(value)
          .filter(
            ([key]) =>
              ![
                "id",
                "sourceIds",
                "selectedIdeaId",
                "verified",
                "checkedAt",
                "researchedAt",
              ].includes(key),
          )
          .map(([key, item]) => (
            <div key={key}>
              <dt>
                {key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (c) => c.toUpperCase())}
              </dt>
              <dd>
                <DraftPreview value={item} />
              </dd>
            </div>
          ))}
      </dl>
    );
  return null;
}
function Orbit() {
  return (
    <svg
      className="f-orbit"
      viewBox="0 0 260 260"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="130" cy="130" r="98" stroke="#C8D4B7" strokeDasharray="2 6" />
      <ellipse
        cx="130"
        cy="130"
        rx="85"
        ry="44"
        transform="rotate(-48 130 130)"
        fill="#D6E99F"
      />
      <ellipse
        cx="130"
        cy="130"
        rx="85"
        ry="44"
        transform="rotate(48 130 130)"
        fill="#DED7E8"
        fillOpacity=".9"
      />
      <path
        d="M62 186C52 142 88 78 131 55C180 80 210 133 201 186M45 130H215M130 32V228"
        stroke="#82966A"
        strokeDasharray="3 5"
      />
      <circle cx="130" cy="130" r="29" fill="#FAFBF5" stroke="#82966A" />
      <path d="M119 130L127 138L142 121" stroke="#7C965A" strokeWidth="2" />
      <circle cx="62" cy="186" r="5" fill="#8DA769" />
      <circle cx="201" cy="186" r="5" fill="#8DA769" />
      <circle cx="131" cy="55" r="5" fill="#8DA769" />
    </svg>
  );
}

export default function FounderStudio() {
  const [projects, setProjects] = useState<FounderProject[]>([]);
  const [earlierProjects, setEarlierProjects] = useState<StudioProject[]>([]);
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState<"home" | "project" | "projects">("home");
  const [loaded, setLoaded] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<FounderProvider>(
    HOSTED_STUDIO ? "guided" : "codex",
  );
  const [model, setModel] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [intent, setIntent] = useState<"find" | "shape" | "improve">("find");
  const [seed, setSeed] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStage, setBusyStage] = useState<FounderStage>("discover");
  const [drafts, setDrafts] = useState<Record<string, PendingDraft>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [jobs, setJobs] = useState<Record<string, BuildJob>>({});
  const [mobilePanel, setMobilePanel] = useState<"chat" | "document">("chat");
  const [sourceForm, setSourceForm] = useState(false);
  const [source, setSource] = useState({ title: "", url: "", note: "" });
  const [newIdea, setNewIdea] = useState({ title: "", description: "" });
  const [newName, setNewName] = useState({ name: "", rationale: "" });
  const [allMessages, setAllMessages] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const stageRailRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const recovery = useRef("");
  const connection = useAgentConnection(provider);
  const project = projects.find((p) => p.id === activeId);
  const stage = STAGES.find((s) => s.id === project?.stage) || STAGES[0];
  const readiness = project ? getFounderReadiness(project) : null;
  const approved = project ? isFounderApproved(project) : false;
  const pending = project ? drafts[project.id] : undefined;
  const job = project ? jobs[project.id] : undefined;
  const providerLabel =
    provider === "guided"
      ? "Guided notebook"
      : provider === "codex"
        ? "Codex"
        : "Claude";
  const selectedModelLabel =
    connection.models.find((m) => m.id === model)?.name || model;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOUNDER_STORAGE_KEY);
      recovery.current = raw || "";
      if (raw) {
        const values: unknown = JSON.parse(raw);
        if (!Array.isArray(values)) throw new Error();
        // Hydrate the external browser notebook after mount, keeping server output deterministic.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProjects(values.map(parseFounderProject));
      }
      try {
        const earlier = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(earlier))
          setEarlierProjects(earlier.map(parseImport));
      } catch {
        setNotice(
          "Some earlier explorations could not be read. They remain in the original workbench.",
        );
      }
      const selected = localStorage.getItem("whatloom.founder.provider");
      if (
        !HOSTED_STUDIO &&
        (selected === "codex" || selected === "claude" || selected === "guided")
      )
        setProvider(selected);
      try {
        const settings = JSON.parse(
          localStorage.getItem("whatloom.founder.models") || "{}",
        );
        if (selected && settings && typeof settings[selected] === "string")
          setModel(settings[selected]);
      } catch {
        /* Optional preferences must not block access to saved projects. */
      }
    } catch {
      setStorageBlocked(true);
      setError(
        "Saved work could not be read. Download a recovery copy before making changes.",
      );
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem("whatloom.founder.drafts") || "{}",
      );
      const restored: Record<string, PendingDraft> = {};
      if (saved && typeof saved === "object")
        for (const [id, value] of Object.entries(saved)) {
          const item = value as PendingDraft;
          if (item?.projectId === id && Number.isInteger(item.revision)) {
            const patch = founderPatchSchema.safeParse(item.patch);
            if (patch.success) restored[id] = { ...item, patch: patch.data };
          }
        }
      setDrafts(restored);
    } catch {
      /* Work remains available even if a suggestion could not be restored. */
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem("whatloom.founder.jobs") || "{}",
      );
      if (saved && typeof saved === "object") {
        const restored: Record<string, BuildJob> = {};
        for (const [id, value] of Object.entries(saved)) {
          const item = value as BuildJob;
          if (
            item?.projectId === id &&
            typeof item.id === "string" &&
            typeof item.directory === "string" &&
            typeof item.projectTitle === "string" &&
            Number.isInteger(item.projectRevision) &&
            ["queued", "running", "completed", "failed", "cancelled"].includes(
              item.status,
            ) &&
            Array.isArray(item.logs) &&
            item.logs.every((line) => typeof line === "string")
          )
            restored[id] = item;
        }
        setJobs(restored);
      }
    } catch {
      /* A build folder remains on disk even without its UI history. */
    }
    const syncRoute = () => {
      const hash = location.hash;
      if (hash.startsWith("#founder/")) {
        try {
          setActiveId(decodeURIComponent(hash.slice(9)));
          setView("project");
        } catch {
          setView("home");
        }
      } else if (hash === "#ventures") setView("projects");
      else if (hash === "#founder" || !hash) setView("home");
    };
    syncRoute();
    setLoaded(true);
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);
  useEffect(() => {
    if (!loaded || storageBlocked) return;
    try {
      localStorage.setItem(FOUNDER_STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // Report failures from the external storage write to prevent further data loss.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageBlocked(true);
      setError("This browser could not save more work. Export a backup now.");
    }
  }, [projects, loaded, storageBlocked]);
  useEffect(() => {
    if (!loaded || storageBlocked) return;
    try {
      localStorage.setItem("whatloom.founder.drafts", JSON.stringify(drafts));
      localStorage.setItem("whatloom.founder.jobs", JSON.stringify(jobs));
    } catch {
      // Surface an external storage failure in the current view.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice("Some progress could not be saved. Export your project.");
    }
  }, [drafts, jobs, loaded, storageBlocked]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("whatloom.founder.provider", provider);
      const settings = JSON.parse(
        localStorage.getItem("whatloom.founder.models") || "{}",
      );
      settings[provider] = model;
      localStorage.setItem("whatloom.founder.models", JSON.stringify(settings));
    } catch {
      /* Existing project save warning handles unavailable storage. */
    }
  }, [provider, model, loaded]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== FOUNDER_STORAGE_KEY || storageBlocked) return;
      try {
        const values: unknown = JSON.parse(event.newValue || "[]");
        if (Array.isArray(values)) {
          setProjects(values.map(parseFounderProject));
          setNotice("Your work was updated in another window.");
        }
      } catch {
        setNotice("Another window has work this version could not read.");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageBlocked]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [project?.messages.length, project?.stage, busy, pending, allMessages]);
  useEffect(() => {
    const rail = stageRailRef.current;
    const active = rail?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!rail || !active || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({
      left:
        rail.scrollLeft +
        active.getBoundingClientRect().left -
        rail.getBoundingClientRect().left -
        (rail.clientWidth - active.clientWidth) / 2,
    });
  }, [project?.id, project?.stage, view]);
  const jobId = job?.id;
  const jobStatus = job?.status;
  const jobProjectId = job?.projectId;
  useEffect(() => {
    if (
      !jobId ||
      !jobProjectId ||
      !jobStatus ||
      HOSTED_STUDIO ||
      !["running", "queued"].includes(jobStatus)
    )
      return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/build?id=${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!stopped && res.ok && data.job)
          setJobs((prev) => ({ ...prev, [jobProjectId]: data.job }));
        else if (!stopped && !res.ok) {
          setError(
            data.error ||
              "Build status is unavailable. The project folder is still on disk.",
          );
          clearInterval(timer);
        }
      } catch {
        /* A transient connection can recover on the next poll. */
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId, jobStatus, jobProjectId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  function setAgent(next: FounderProvider) {
    setProvider(next);
    setModel("");
    try {
      const saved = JSON.parse(
        localStorage.getItem("whatloom.founder.models") || "{}",
      );
      if (typeof saved[next] === "string") setModel(saved[next]);
    } catch {
      /* Default model remains selected. */
    }
  }
  function openProject(next: FounderProject) {
    setActiveId(next.id);
    setView("project");
    setSidebarOpen(false);
    setError("");
    setMessage("");
    setSourceForm(false);
    setAllMessages(false);
    setMobilePanel("chat");
    history.replaceState(null, "", `#founder/${encodeURIComponent(next.id)}`);
  }
  function goHome() {
    setView("home");
    setSidebarOpen(false);
    setError("");
    history.replaceState(null, "", "#founder");
  }
  function save(next: FounderProject) {
    setProjects((prev) => [next, ...prev.filter((p) => p.id !== next.id)]);
  }
  function mutate(fn: (current: FounderProject) => FounderProject) {
    if (!project || storageBlocked) return false;
    try {
      const next = fn(project);
      save(next);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That change could not be saved.",
      );
      return false;
    }
  }
  function patch(value: FounderPatch) {
    return mutate((current) => updateFounderProject(current, value));
  }
  function goStage(next: FounderStage) {
    if (!patch({ stage: next })) return;
    setMobilePanel("chat");
    setMessage("");
    setError("");
  }
  async function ask(text: string, current = project) {
    if (!current || !text.trim() || busyRef.current || storageBlocked) return;
    setError("");
    setMessage("");
    const prompt = text.trim();
    const withUser = appendFounderMessage(current, {
      role: "user",
      content: prompt,
      stage: current.stage,
    });
    save(withUser);
    if (provider === "guided" || HOSTED_STUDIO) {
      const guided = STAGES.find((s) => s.id === current.stage)!;
      const response = `Saved to your conversation.\n\n${guided.prompt}\n\nUse the brief beside this conversation to record your decisions.${HOSTED_STUDIO ? " Open the Mac app for AI brainstorming and current market research." : " Connect Codex or Claude when you want an AI thinking partner."}`;
      save(
        appendFounderMessage(withUser, {
          role: "assistant",
          content: response,
          stage: current.stage,
        }),
      );
      return;
    }
    if (
      connection.connection?.status !== "connected" ||
      connection.connection?.provider !== provider
    ) {
      setConnectOpen(true);
      setNotice(
        "Your thought is saved. Connect your AI, then use “Continue this thought”.",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setBusyStage(current.stage);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(model ? { model } : {}),
          project: withUser,
          message: prompt,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "AUTH_REQUIRED") setConnectOpen(true);
        throw new Error(
          data.error || "Your partner could not finish. Your message is saved.",
        );
      }
      setProjects((prev) =>
        prev.map((p) =>
          p.id === current.id
            ? appendFounderMessage(p, {
                role: "assistant",
                content: data.reply,
                stage: current.stage,
              })
            : p,
        ),
      );
      if (data.patch && Object.keys(data.patch).length)
        setDrafts((prev) => ({
          ...prev,
          [current.id]: {
            projectId: current.id,
            revision: current.revision,
            patch: data.patch,
          },
        }));
      if (Array.isArray(data.suggestions))
        setSuggestions((prev) => ({
          ...prev,
          [`${current.id}:${current.stage}`]: data.suggestions,
        }));
    } catch (err) {
      if (controller.signal.aborted)
        setNotice("Stopped. Your conversation is saved.");
      else
        setError(
          err instanceof Error
            ? err.message
            : "Your partner could not finish. Try again.",
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
      abortRef.current = null;
    }
  }
  function start() {
    if (!loaded || storageBlocked || busy) return;
    const current = createFounderProject(
      intent === "find" ? "" : seed.trim(),
      intent === "find" ? seed.trim() : "",
    );
    const opening =
      seed.trim() ||
      "Help me discover a worthwhile product idea. Start by asking about my skills, interests, and problems I have noticed.";
    save(current);
    openProject(current);
    void ask(
      `${intent === "find" ? "I’m looking for an idea. " : intent === "improve" ? "I want to improve an existing product. " : "I have a starting idea. "}${opening}`,
      current,
    );
    setSeed("");
  }
  function applyDraft() {
    if (!project || !pending) return;
    if (pending.revision !== project.revision) {
      setError(
        "Your brief changed after this suggestion was created. Ask for an updated draft so your edits stay intact.",
      );
      return;
    }
    try {
      const next = updateFounderProject(project, pending.patch);
      save(next);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[project.id];
        return copy;
      });
      setNotice(
        "Suggested changes added to your brief. Review and refine them as you go.",
      );
      setMobilePanel("document");
    } catch {
      setError(
        "This suggestion has an inconsistent reference. Ask your partner to revise the draft.",
      );
    }
  }
  function discardDraft() {
    if (project)
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[project.id];
        return copy;
      });
  }
  function exportProject() {
    if (project)
      downloadFile(
        `${filenameFor(project)}.whatloom-founder.json`,
        JSON.stringify(project, null, 2),
        "application/json",
      );
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("Choose a project backup smaller than 2 MB.");
      const imported = parseFounderProject(JSON.parse(await file.text()));
      const copy = {
        ...imported,
        id: uid(),
        approval: null,
        updatedAt: new Date().toISOString(),
      };
      save(copy);
      openProject(copy);
      setNotice("Imported a separate copy. Review it before building.");
    } catch (err) {
      setError(
        err instanceof Error && err.message.length < 200
          ? err.message
          : "This is not a readable founder project backup. Older explorations can be imported from the workbench.",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }
  function addSource() {
    if (!project) return;
    const url = safeUrl(source.url);
    if (!source.title.trim() || !url || !source.note.trim()) {
      setError(
        "Add a source title, a complete public URL, and what you learned.",
      );
      return;
    }
    const saved = patch({
      research: {
        ...project.research,
        sources: [
          ...project.research.sources,
          {
            id: uid(),
            title: source.title.trim(),
            url,
            note: source.note.trim(),
            checkedAt: new Date().toISOString(),
            verified: false,
          },
        ],
      },
    });
    if (!saved) return;
    setSource({ title: "", url: "", note: "" });
    setSourceForm(false);
    setError("");
  }
  function addIdea() {
    if (!project || !newIdea.title.trim()) return;
    const saved = patch({
      ideas: [
        ...project.ideas,
        {
          id: uid(),
          title: newIdea.title.trim(),
          description: newIdea.description.trim(),
        },
      ],
    });
    if (!saved) return;
    setNewIdea({ title: "", description: "" });
  }
  function addName() {
    if (!project || !newName.name.trim()) return;
    if (
      project.brand.names.some(
        (n) => n.name.toLowerCase() === newName.name.trim().toLowerCase(),
      )
    ) {
      setError("That name is already on your shortlist.");
      return;
    }
    const saved = patch({
      brand: {
        ...project.brand,
        names: [
          ...project.brand.names,
          {
            id: uid(),
            name: newName.name.trim(),
            rationale: newName.rationale.trim(),
          },
        ],
      },
    });
    if (!saved) return;
    setNewName({ name: "", rationale: "" });
  }
  async function build() {
    if (!project || !approved || busyRef.current) return;
    if (
      HOSTED_STUDIO ||
      provider === "guided" ||
      connection.connection?.status !== "connected" ||
      connection.connection?.provider !== provider
    ) {
      setConnectOpen(true);
      return;
    }
    setError("");
    busyRef.current = true;
    setBusy(true);
    setBusyStage("build");
    try {
      const response = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          provider,
          ...(model ? { model } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The builder could not start.");
      setJobs((prev) => ({ ...prev, [project.id]: data.job }));
      setNotice("The builder has your approved brief and brand assets.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The builder could not start.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function cancelBuild() {
    if (!job) return;
    try {
      const response = await fetch(
        `/api/build?id=${encodeURIComponent(job.id)}`,
        { method: "DELETE", headers: { "Content-Type": "application/json" } },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not stop the builder.");
      setJobs((prev) => ({ ...prev, [job.projectId]: data.job }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not stop the builder.",
      );
    }
  }
  const nextStage = STAGES[STAGES.findIndex((s) => s.id === stage.id) + 1];
  const lastUser = project?.messages
    .filter((m) => m.role === "user" && m.stage === stage.id)
    .at(-1);
  const visibleMessages =
    project?.messages.filter((m) => allMessages || m.stage === stage.id) || [];

  return (
    <div className="founder-app">
      <input
        ref={importRef}
        type="file"
        accept=".json"
        hidden
        aria-label="Import founder project"
        onChange={(e) => void importProject(e.target.files?.[0])}
      />
      {sidebarOpen && (
        <button
          className="f-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`f-sidebar ${sidebarOpen ? "open" : ""}`}>
        <a href="#founder" className="f-logo" onClick={goHome}>
          <img src={assetPath("/brand/mark-ink.svg")} alt="" />
          whatloom.
        </a>
        <small>Your startup partner</small>
        <button className="f-primary" onClick={goHome}>
          <Plus size={16} /> New project
        </button>
        <nav aria-label="Main navigation">
          <button
            className={`f-nav-button ${view === "home" ? "active" : ""}`}
            onClick={goHome}
          >
            <Compass size={17} /> Your studio
          </button>
          <button
            className={`f-nav-button ${view === "projects" ? "active" : ""}`}
            onClick={() => {
              setView("projects");
              setSidebarOpen(false);
              history.replaceState(null, "", "#ventures");
            }}
          >
            <FolderOpen size={17} /> Your projects{" "}
            <small>{projects.length}</small>
          </button>
          <a className="f-nav-button" href="#scenarios">
            <Lightbulb size={17} /> Try a walkthrough <small>10</small>
          </a>
        </nav>
        <div className="f-sidebar-label">IDEAS IN THE MAKING</div>
        <div className="f-project-list">
          {projects.slice(0, 10).map((p) => (
            <button
              key={p.id}
              className={
                activeId === p.id && view === "project" ? "active" : ""
              }
              onClick={() => openProject(p)}
            >
              <Circle size={6} fill="currentColor" />
              <span>{titleFor(p)}</span>
            </button>
          ))}
          {!projects.length && (
            <p>
              Your next big thing
              <br />
              can start small.
            </p>
          )}
        </div>
        <div className="f-side-bottom">
          <button
            className="f-connect-button"
            onClick={() => setConnectOpen(true)}
          >
            <span
              className={`f-online-dot ${connection.connection?.status === "connected" ? "on" : ""}`}
            />
            <span>
              <strong>
                {HOSTED_STUDIO ? "Bring your AI on Mac" : providerLabel}
              </strong>
              <small>
                {HOSTED_STUDIO
                  ? "Get the local app"
                  : connection.connection?.status === "connected"
                    ? "Connected · change model"
                    : provider === "guided"
                      ? "Connect an AI partner"
                      : "Connect your account"}
              </small>
            </span>
            <Settings2 size={14} />
          </button>
          <div className="f-side-footer">
            <span>Saved on this device</span>
            <a href="#workbench">Earlier workbench</a>
          </div>
        </div>
      </aside>
      <div className="f-body">
        <header className="f-topbar">
          <div className="f-breadcrumb">
            <button
              className="f-icon f-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <button onClick={goHome}>Your studio</button>
            <ChevronRight size={13} />
            <span>
              {view === "project" && project
                ? titleFor(project)
                : view === "projects"
                  ? "Your projects"
                  : "A little curiosity. A real beginning."}
            </span>
          </div>
          <div className="f-top-actions">
            <span className="f-saved">
              <Circle size={5} fill="currentColor" />
              {storageBlocked ? "Saving paused" : "Saved locally"}
            </span>
            <button
              className="f-model-button"
              onClick={() => setConnectOpen(true)}
            >
              <span>
                {HOSTED_STUDIO
                  ? "Connect AI"
                  : `${providerLabel}${model ? ` · ${selectedModelLabel}` : ""}`}
              </span>
              <ChevronDown size={13} />
            </button>
            {project && view === "project" && (
              <button
                className="f-icon"
                aria-label="Export project backup"
                onClick={exportProject}
              >
                <Download size={17} />
              </button>
            )}
          </div>
        </header>
        {HOSTED_STUDIO && (
          <div className="f-hosted">
            <span>Plan here. Connect your AI and build in the local app.</span>
            <a href={MAC_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              Download for Mac ↗
            </a>
          </div>
        )}
        {error && (
          <div className="f-notice error" role="alert">
            <span>{error}</span>
            {storageBlocked && (
              <button
                onClick={() =>
                  downloadFile(
                    "whatloom-recovery.json",
                    recovery.current || JSON.stringify(projects),
                    "application/json",
                  )
                }
              >
                Download recovery
              </button>
            )}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {notice && (
          <div className="f-notice" role="status">
            <CheckCircle2 size={15} />
            <span>{notice}</span>
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {view === "home" && (
          <main className="f-home">
            <section className="f-hero">
              <div>
                <div className="f-eyebrow">
                  FROM A SMALL SPARK TO SOMETHING REAL
                </div>
                <h1>
                  You bring the curiosity.
                  <br />
                  <em>Let’s find the idea.</em>
                </h1>
                <p>
                  A thinking partner for your next venture. Explore what
                  matters, find a difference worth making, and shape a product
                  you’re ready to build.
                </p>
              </div>
              <div className="f-hero-art">
                <Orbit />
                <div className="f-orbit-note">
                  a little space for a big possibility
                </div>
              </div>
            </section>
            <div className="f-intents" aria-label="Your starting point">
              {(
                [
                  ["find", "Find an idea", Lightbulb],
                  ["shape", "I have an idea", Sparkles],
                  ["improve", "Improve a product", Compass],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={intent === id ? "active" : ""}
                  aria-pressed={intent === id}
                  onClick={() => setIntent(id)}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <form
              className="f-home-composer"
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <label className="f-eyebrow" htmlFor="founder-seed">
                {intent === "find"
                  ? "WHAT ARE YOU CURIOUS ABOUT?"
                  : intent === "shape"
                    ? "TELL US THE ROUGH VERSION"
                    : "WHAT COULD BE BETTER?"}
              </label>
              <textarea
                id="founder-seed"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                maxLength={6000}
                placeholder={
                  intent === "find"
                    ? "Your interests, a problem you keep noticing, or people you want to help…"
                    : intent === "shape"
                      ? "I’ve been thinking about a product that…"
                      : "The product, who uses it, and what feels frustrating…"
                }
                rows={3}
              />
              <div className="f-row">
                <button
                  type="button"
                  className="f-text"
                  onClick={() => setConnectOpen(true)}
                >
                  <MessageCircle size={14} />
                  {HOSTED_STUDIO ? "Guided notebook" : providerLabel}
                  <ChevronDown size={12} />
                </button>
                <button
                  className="f-primary"
                  disabled={!loaded || busy || storageBlocked}
                  type="submit"
                >
                  Let’s think it through <ArrowRight size={16} />
                </button>
              </div>
            </form>
            <p className="f-start-note">
              No perfect pitch needed. Start where you are. Your work saves as
              you go.
            </p>
            <div className="f-sparks">
              <button
                onClick={() => {
                  setIntent("find");
                  setSeed(
                    "I care about helping local creative businesses. I know design and operations, but I don’t yet have a specific idea.",
                  );
                }}
              >
                <Plus size={12} /> Turn my skills into an idea
              </button>
              <button
                onClick={() => {
                  setIntent("shape");
                  setSeed(
                    "Help independent teachers turn their expertise into learning experiences people actually finish.",
                  );
                }}
              >
                <Plus size={12} /> Make learning more useful
              </button>
              <button
                onClick={() => {
                  setIntent("improve");
                  setSeed(
                    "Small community groups juggle chats, spreadsheets, and payment links to organize shared projects. What could work better?",
                  );
                }}
              >
                <Plus size={12} /> Fix a frustrating workflow
              </button>
            </div>
            <section className="f-journey-preview">
              <div className="f-row">
                <h2>One thought at a time. One clear direction.</h2>
                <a className="f-text" href="#scenarios">
                  Try a walkthrough <ArrowUpRight size={13} />
                </a>
              </div>
              <div className="f-mini-stages">
                {STAGES.map((s, i) => (
                  <div key={s.id}>
                    <span>0{i + 1}</span>
                    <strong>{s.short}</strong>
                    <small>
                      {
                        [
                          "Find the right problem",
                          "See the alternatives",
                          "Define the experience",
                          "Make it memorable",
                          "Make the decisions",
                          "Hand it to your AI",
                        ][i]
                      }
                    </small>
                  </div>
                ))}
              </div>
            </section>
            {projects.length > 0 && (
              <section className="f-recent">
                <h2>Pick up a promising thread.</h2>
                <div className="f-recent-grid">
                  {projects.slice(0, 3).map((p) => (
                    <button key={p.id} onClick={() => openProject(p)}>
                      <small>
                        {STAGES.find((s) => s.id === p.stage)?.short} ·{" "}
                        {new Date(p.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </small>
                      <strong>{titleFor(p)}</strong>
                      <span className="f-text">
                        Continue thinking <ArrowRight size={13} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>
        )}
        {view === "projects" && (
          <main className="f-home">
            <div className="f-list-header">
              <h1>Your ideas in motion.</h1>
              <button
                className="f-secondary"
                onClick={() => importRef.current?.click()}
              >
                <Upload size={14} /> Import project
              </button>
            </div>
            <div className="f-recent-grid">
              {projects.map((p) => (
                <button key={p.id} onClick={() => openProject(p)}>
                  <small>{STAGES.find((s) => s.id === p.stage)?.title}</small>
                  <strong>{titleFor(p)}</strong>
                  <span className="f-text">
                    Continue <ArrowRight size={13} />
                  </span>
                </button>
              ))}
            </div>
            {!projects.length && (
              <div className="f-empty-document">
                <Lightbulb size={32} />
                <h3>Good ideas need somewhere to begin.</h3>
                <p>
                  Start with a curiosity, or import a founder project from
                  another device.
                </p>
                <button className="f-primary" onClick={goHome}>
                  Start a conversation <ArrowRight size={14} />
                </button>
              </div>
            )}
            {earlierProjects.length > 0 && (
              <section className="f-recent">
                <h2>Bring an earlier idea forward.</h2>
                <p className="f-fine">
                  Continue in the founder journey with a new copy. Your original
                  exploration stays in the workbench.
                </p>
                <div className="f-recent-grid">
                  {earlierProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        try {
                          const copy = founderFromExploration(p);
                          save(copy);
                          openProject(copy);
                          setNotice(
                            "Your earlier exploration is now a new founder project. Choose a direction to continue.",
                          );
                        } catch {
                          setError(
                            "This exploration is too large to bring forward automatically. Export it from the earlier workbench and start with a focused summary.",
                          );
                        }
                      }}
                    >
                      <small>Earlier exploration</small>
                      <strong>{p.title}</strong>
                      <span className="f-text">
                        Continue as a founder project <ArrowRight size={13} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="f-actions" style={{ marginTop: 30 }}>
              <a className="f-text" href="#workbench">
                Open your earlier explorations <ArrowUpRight size={13} />
              </a>
            </div>
          </main>
        )}
        {view === "project" && !project && loaded && (
          <div className="f-home">
            <h2>This project isn’t in this browser.</h2>
            <p className="f-muted">
              Import a backup or return to your projects.
            </p>
            <button
              className="f-secondary"
              onClick={() => importRef.current?.click()}
            >
              Import project
            </button>
          </div>
        )}
        {view === "project" && project && (
          <>
            <nav
              ref={stageRailRef}
              className="f-stage-rail"
              aria-label="Founder journey"
            >
              {STAGES.map((s, i) => {
                const done =
                  !readiness?.issues.some((issue) => issue.stage === s.id) &&
                  (i < 4 || (s.id === "review" && approved));
                return (
                  <button
                    key={s.id}
                    className={`${stage.id === s.id ? "active" : ""} ${done ? "done" : ""}`}
                    aria-current={stage.id === s.id ? "step" : undefined}
                    onClick={() => goStage(s.id)}
                  >
                    <span className="f-step-number">
                      {done ? <Check size={12} /> : i + 1}
                    </span>
                    {s.short}
                  </button>
                );
              })}
            </nav>
            <div className="f-mobile-switch">
              <button
                className={mobilePanel === "chat" ? "active" : ""}
                onClick={() => setMobilePanel("chat")}
              >
                Conversation
              </button>
              <button
                className={mobilePanel === "document" ? "active" : ""}
                onClick={() => setMobilePanel("document")}
              >
                Your {stage.id === "brand" ? "brand" : "brief"}{" "}
                {pending ? "· new draft" : ""}
              </button>
            </div>
            <main className={`f-workspace show-${mobilePanel}`}>
              <section className="f-chat-panel" aria-label="Thinking partner">
                <div className="f-chat-heading">
                  <div className="f-eyebrow">
                    0{STAGES.indexOf(stage) + 1} / {stage.short.toUpperCase()}
                  </div>
                  <h2>{stage.title}</h2>
                  <p>{stage.subtitle}</p>
                </div>
                <div className="f-messages" ref={messagesRef}>
                  {project.messages.some((m) => m.stage !== stage.id) && (
                    <button
                      className="f-text"
                      onClick={() => setAllMessages(!allMessages)}
                    >
                      {allMessages
                        ? "Show this stage only"
                        : "Show the full conversation"}{" "}
                      <ChevronDown size={12} />
                    </button>
                  )}
                  {(!visibleMessages.length ||
                    !visibleMessages.some((m) => m.role === "assistant")) && (
                    <div className="f-message">
                      <div className="f-message-author">
                        <span>✳</span>Whatloom ·{" "}
                        {provider === "guided" || HOSTED_STUDIO
                          ? "guided prompt"
                          : "your thinking partner"}
                      </div>
                      <p className="f-message-content">{stage.prompt}</p>
                    </div>
                  )}
                  {visibleMessages.map((m) => (
                    <div className={`f-message ${m.role}`} key={m.id}>
                      <div className="f-message-author">
                        <span>{m.role === "user" ? "You" : "✳"}</span>
                        {m.role === "user" ? "Your thought" : "Whatloom"}
                        {allMessages && (
                          <small>
                            {" "}
                            · {STAGES.find((s) => s.id === m.stage)?.short}
                          </small>
                        )}
                      </div>
                      <div className="f-message-content">
                        <ConversationText text={m.content} />
                      </div>
                    </div>
                  ))}
                  {busy && (
                    <div className="f-thinking" role="status">
                      <Loader2 size={15} className="f-spin" />
                      {busyStage === "research"
                        ? "Researching current sources and alternatives…"
                        : "Thinking through the next useful step…"}
                      <button
                        className="f-text"
                        onClick={() => abortRef.current?.abort()}
                      >
                        Stop
                      </button>
                    </div>
                  )}
                  {pending && (
                    <div className="f-draft-notice">
                      <strong>A suggested update to your brief</strong>
                      <p>
                        Review the changes, then add them to your working
                        document.
                      </p>
                      <details>
                        <summary className="f-text">
                          Preview suggested changes
                        </summary>
                        <DraftPreview value={pending.patch} />
                      </details>
                      <div className="f-actions">
                        <button
                          className="f-primary"
                          onClick={applyDraft}
                          disabled={
                            busy || pending.revision !== project.revision
                          }
                        >
                          Add to my brief <Check size={14} />
                        </button>
                        <button className="f-text" onClick={discardDraft}>
                          Dismiss
                        </button>
                      </div>
                      {pending.revision !== project.revision && (
                        <p>
                          Your brief has changed. Ask for a fresh draft to
                          preserve your edits.
                        </p>
                      )}
                    </div>
                  )}
                  {!busy && (
                    <div className="f-chat-suggestions">
                      {(
                        suggestions[`${project.id}:${stage.id}`] ||
                        stage.suggestions
                      )
                        .slice(0, 3)
                        .map((text) => (
                          <button
                            key={text}
                            onClick={() => void ask(text)}
                            disabled={storageBlocked}
                          >
                            {text}
                            <ArrowUpRight size={13} />
                          </button>
                        ))}
                      {lastUser &&
                        connection.connection?.status === "connected" &&
                        project.messages.at(-1)?.role === "user" && (
                          <button
                            onClick={() =>
                              void ask(
                                `Continue this thought: ${lastUser.content}`,
                              )
                            }
                          >
                            Continue this thought <ArrowRight size={14} />
                          </button>
                        )}
                    </div>
                  )}
                </div>
                <form
                  className="f-chat-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(message);
                  }}
                >
                  <textarea
                    aria-label="Message your thinking partner"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      stage.id === "discover"
                        ? "Tell me a little more…"
                        : "Ask a question, challenge a direction, or add a thought…"
                    }
                    maxLength={12000}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void ask(message);
                      }
                    }}
                  />
                  <div className="f-row">
                    <small>
                      {provider === "guided" || HOSTED_STUDIO
                        ? "Guided notebook · connect AI for live help"
                        : `${providerLabel} · ${selectedModelLabel || "provider default"}`}
                    </small>
                    <button
                      className="f-primary"
                      type="submit"
                      aria-label="Send thought"
                      disabled={busy || !message.trim() || storageBlocked}
                    >
                      <ArrowUp size={15} />
                    </button>
                  </div>
                </form>
              </section>
              <section className="f-document" aria-label="Your working brief">
                <div className="f-document-head">
                  <div>
                    <h3>
                      {stage.id === "discover"
                        ? "Your emerging direction"
                        : stage.id === "research"
                          ? "The current landscape"
                          : stage.id === "product"
                            ? "Your product brief"
                            : stage.id === "brand"
                              ? "Your starter identity"
                              : stage.id === "review"
                                ? "Your decision before building"
                                : "Your build handoff"}
                    </h3>
                    <small>Editable, saved, and yours to shape.</small>
                  </div>
                  <button
                    className="f-icon"
                    aria-label="Download founder project"
                    onClick={exportProject}
                  >
                    <ArrowDownToLine size={17} />
                  </button>
                </div>
                <div className="f-document-content">
                  {stage.id === "discover" && (
                    <>
                      {project.ideas.length > 0 ? (
                        <>
                          <div className="f-eyebrow">
                            POSSIBLE DIRECTIONS · CHOOSE ONE TO EXPLORE
                          </div>
                          {project.ideas.map((idea, i) => (
                            <article
                              className={`f-idea ${project.selectedIdeaId === idea.id ? "selected" : ""}`}
                              key={idea.id}
                            >
                              <span className="f-tag">
                                Direction {i + 1}
                                {project.selectedIdeaId === idea.id
                                  ? " · chosen"
                                  : ""}
                              </span>
                              <h4>{idea.title}</h4>
                              <p>{idea.description}</p>
                              <button
                                className={
                                  project.selectedIdeaId === idea.id
                                    ? "f-text"
                                    : "f-secondary"
                                }
                                onClick={() =>
                                  mutate((current) =>
                                    selectFounderIdea(current, idea.id),
                                  )
                                }
                              >
                                {project.selectedIdeaId === idea.id ? (
                                  <>
                                    <Check size={14} /> Your chosen direction
                                  </>
                                ) : (
                                  <>
                                    Explore this direction{" "}
                                    <ArrowRight size={13} />
                                  </>
                                )}
                              </button>
                            </article>
                          ))}
                        </>
                      ) : (
                        <div className="f-empty-document">
                          <Lightbulb size={32} />
                          <h3>Ideas begin with a good question.</h3>
                          <p>
                            Talk with your partner. Promising directions will
                            appear here as drafts for you to choose from.
                          </p>
                        </div>
                      )}
                      <details className="f-sheet">
                        <summary className="f-text">
                          <Plus size={13} /> Add a direction of your own
                        </summary>
                        <Field
                          label="Direction name"
                          value={newIdea.title}
                          maxLength={500}
                          onChange={(title) =>
                            setNewIdea({ ...newIdea, title })
                          }
                          placeholder="A clear, short description"
                        />
                        <Field
                          label="What makes this direction interesting?"
                          value={newIdea.description}
                          onChange={(description) =>
                            setNewIdea({ ...newIdea, description })
                          }
                          multiline
                        />
                        <button
                          className="f-secondary"
                          disabled={!newIdea.title.trim()}
                          onClick={addIdea}
                        >
                          Add direction <Plus size={13} />
                        </button>
                      </details>
                      <div className="f-sheet">
                        <span className="f-eyebrow">THE OPPORTUNITY</span>
                        <h3>Who needs this, and why?</h3>
                        <p>
                          Your partner can draft this with you. Edit any part as
                          the idea gets clearer.
                        </p>
                        <Field
                          label="The problem worth solving"
                          value={project.opportunity.problem}
                          onChange={(problem) =>
                            patch({
                              opportunity: { ...project.opportunity, problem },
                            })
                          }
                          multiline
                          placeholder="What is difficult or missing today?"
                        />
                        <Field
                          label="The first people you want to help"
                          value={project.opportunity.audience}
                          onChange={(audience) =>
                            patch({
                              opportunity: { ...project.opportunity, audience },
                            })
                          }
                          placeholder="Be more specific than ‘everyone’"
                        />
                        <Field
                          label="Why this matters now"
                          value={project.opportunity.whyNow}
                          onChange={(whyNow) =>
                            patch({
                              opportunity: { ...project.opportunity, whyNow },
                            })
                          }
                          multiline
                          placeholder="What changed, or makes this problem worth addressing?"
                        />
                        <Field
                          label="What they do today"
                          value={project.opportunity.alternatives}
                          onChange={(alternatives) =>
                            patch({
                              opportunity: {
                                ...project.opportunity,
                                alternatives,
                              },
                            })
                          }
                          multiline
                          placeholder="Existing products, workarounds, or doing nothing"
                        />
                        <Field
                          label="The difference we want to make"
                          value={project.opportunity.differentiator}
                          onChange={(differentiator) =>
                            patch({
                              opportunity: {
                                ...project.opportunity,
                                differentiator,
                              },
                            })
                          }
                          multiline
                          placeholder="A proposed advantage to investigate"
                        />
                        <ListField
                          label="What we are still assuming"
                          value={project.opportunity.assumptions}
                          onChange={(assumptions) =>
                            patch({
                              opportunity: {
                                ...project.opportunity,
                                assumptions,
                              },
                            })
                          }
                          placeholder="People experience this often enough to change their habits"
                        />
                      </div>
                      <details className="f-sheet">
                        <summary className="f-text">
                          Your background and constraints
                        </summary>
                        <Field
                          label="Context for your partner"
                          value={project.context}
                          onChange={(context) => patch({ context })}
                          multiline
                          placeholder="Your experience, budget, time, audience, or anything the partner should remember"
                        />
                      </details>
                    </>
                  )}
                  {stage.id === "research" && (
                    <>
                      <div className="f-sheet">
                        <div className="f-row">
                          <span className="f-eyebrow">
                            MARKET & COMPETITION
                          </span>
                          {project.research.researchedAt && (
                            <span className="f-tag">
                              Researched{" "}
                              {new Date(
                                project.research.researchedAt,
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                        <h3>Understand the alternatives.</h3>
                        <p>
                          Look for direct competitors, adjacent solutions, and
                          the workarounds people already trust.
                        </p>
                        <button
                          className="f-primary"
                          disabled={busy}
                          onClick={() =>
                            void ask(
                              "Research the current market, direct competitors, substitutes, and proposed differentiation for this idea. Open current primary sources and show what remains uncertain.",
                            )
                          }
                        >
                          <Search size={14} /> Research the current landscape
                        </button>
                        <Field
                          label="What we learned"
                          value={project.research.summary}
                          onChange={(summary) =>
                            patch({
                              research: { ...project.research, summary },
                            })
                          }
                          multiline
                          placeholder="Summarize the landscape and how it changes the idea."
                        />
                        {project.research.competitors.length > 0 && (
                          <div>
                            {project.research.competitors.map((c) => (
                              <article className="f-competitor" key={c.id}>
                                <h4>
                                  {c.name}
                                  {safeUrl(c.url) && (
                                    <a
                                      href={safeUrl(c.url)!}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={`Open ${c.name}`}
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </h4>
                                <p>{c.description}</p>
                                <p>
                                  <strong>Our proposed difference: </strong>
                                  {c.difference}
                                </p>
                                <small>
                                  {c.sourceIds.length} linked source
                                  {c.sourceIds.length === 1 ? "" : "s"}
                                </small>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="f-sheet">
                        <div className="f-row">
                          <h3>Sources you can inspect</h3>
                          <button
                            className="f-text"
                            onClick={() => setSourceForm(!sourceForm)}
                          >
                            <Plus size={13} /> Add source
                          </button>
                        </div>
                        {project.research.sources.length === 0 && (
                          <p>
                            No research sources yet. Run a research pass or
                            record a source you have reviewed.
                          </p>
                        )}
                        {project.research.sources.map((s) => (
                          <article className="f-source" key={s.id}>
                            <a
                              href={safeUrl(s.url) || undefined}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {s.title}
                              <ExternalLink size={12} />
                            </a>
                            <Field
                              label={`Notes on ${s.title}`}
                              value={s.note}
                              multiline
                              onChange={(note) =>
                                patch({
                                  research: {
                                    ...project.research,
                                    sources: project.research.sources.map(
                                      (item) =>
                                        item.id === s.id
                                          ? { ...item, note }
                                          : item,
                                    ),
                                  },
                                })
                              }
                            />
                            <small>
                              {s.verified
                                ? "Agent opened this source"
                                : "Recorded by you"}{" "}
                              · {new Date(s.checkedAt).toLocaleDateString()} ·
                              Interpretation needs review
                            </small>
                          </article>
                        ))}
                        {sourceForm && (
                          <div>
                            <Field
                              label="Source title"
                              value={source.title}
                              onChange={(title) =>
                                setSource({ ...source, title })
                              }
                              maxLength={500}
                            />
                            <Field
                              label="Source URL"
                              value={source.url}
                              onChange={(url) => setSource({ ...source, url })}
                              placeholder="https://…"
                              maxLength={2400}
                            />
                            <Field
                              label="What did you learn from this source?"
                              value={source.note}
                              onChange={(note) =>
                                setSource({ ...source, note })
                              }
                              multiline
                            />
                            <p className="f-fine">
                              By adding this, you record that you reviewed it
                              today. It will be labeled as a source you added.
                            </p>
                            <button className="f-secondary" onClick={addSource}>
                              Save reviewed source
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="f-sheet">
                        <ListField
                          label="What the research does not establish yet"
                          value={project.research.unknowns}
                          onChange={(unknowns) =>
                            patch({
                              research: { ...project.research, unknowns },
                            })
                          }
                          placeholder="Whether this audience would switch from its current workaround"
                        />
                        <Field
                          label="Refine the difference we want to make"
                          value={project.opportunity.differentiator}
                          onChange={(differentiator) =>
                            patch({
                              opportunity: {
                                ...project.opportunity,
                                differentiator,
                              },
                            })
                          }
                          multiline
                        />
                      </div>
                    </>
                  )}
                  {stage.id === "product" && (
                    <div className="f-sheet">
                      <span className="f-eyebrow">
                        THE PRODUCT, BEFORE THE IMPLEMENTATION
                      </span>
                      <h3>A shared picture of what to build.</h3>
                      <p>
                        Describe the experience and the value. Your builder will
                        work out the technical approach after approval.
                      </p>
                      <button
                        className="f-secondary"
                        disabled={busy}
                        onClick={() =>
                          void ask(
                            "Draft a focused product brief from our chosen opportunity and research. Describe what, who, why, user journeys, capabilities, measurable success and what is outside the first version. Keep technical implementation choices out.",
                          )
                        }
                      >
                        <Sparkles size={14} /> Shape this with my partner
                      </button>
                      <Field
                        label="What is the product?"
                        value={project.product.what}
                        onChange={(what) =>
                          patch({ product: { ...project.product, what } })
                        }
                        multiline
                        placeholder="A clear, plain-language description"
                      />
                      <Field
                        label="Who is it for?"
                        value={project.product.who}
                        onChange={(who) =>
                          patch({ product: { ...project.product, who } })
                        }
                        multiline
                      />
                      <Field
                        label="Why would someone choose it?"
                        value={project.product.why}
                        onChange={(why) =>
                          patch({ product: { ...project.product, why } })
                        }
                        multiline
                      />
                      <ListField
                        label="The key user journeys"
                        value={project.product.journeys}
                        onChange={(journeys) =>
                          patch({ product: { ...project.product, journeys } })
                        }
                        placeholder="When someone arrives, they can…"
                      />
                      <ListField
                        label="What the first version lets people do"
                        value={project.product.capabilities}
                        onChange={(capabilities) =>
                          patch({
                            product: { ...project.product, capabilities },
                          })
                        }
                        placeholder="A concrete user-facing capability"
                      />
                      <ListField
                        label="How we will recognize a useful result"
                        value={project.product.success}
                        onChange={(success) =>
                          patch({ product: { ...project.product, success } })
                        }
                        placeholder="An observable outcome or acceptance criterion"
                      />
                      <ListField
                        label="Outside the first version"
                        value={project.product.outOfScope}
                        onChange={(outOfScope) =>
                          patch({ product: { ...project.product, outOfScope } })
                        }
                        placeholder="Something we deliberately leave for later"
                      />
                      <button
                        className="f-text"
                        onClick={() =>
                          downloadFile(
                            `${filenameFor(project)}-product-brief.md`,
                            productBriefMarkdown(project),
                            "text/markdown",
                          )
                        }
                      >
                        <Download size={13} /> Export product brief
                      </button>
                    </div>
                  )}
                  {stage.id === "brand" && (
                    <>
                      <div className="f-sheet">
                        <span className="f-eyebrow">A NAME WITH A REASON</span>
                        <h3>What should people call it?</h3>
                        <p>
                          Compare a few directions. Choose the one that fits
                          your audience and promise.
                        </p>
                        <button
                          className="f-secondary"
                          disabled={busy}
                          onClick={() =>
                            void ask(
                              "Suggest five distinct memorable product names, with rationale and tradeoffs tied to this product and audience. Do not claim domain or trademark availability.",
                            )
                          }
                        >
                          <Sparkles size={14} /> Explore names together
                        </button>
                        <div className="f-name-options">
                          {project.brand.names.map((n) => (
                            <button
                              className={
                                project.brand.selectedName === n.name
                                  ? "selected"
                                  : ""
                              }
                              key={n.id}
                              onClick={() =>
                                mutate((current) =>
                                  selectFounderName(current, n.id),
                                )
                              }
                            >
                              <strong>
                                {n.name}
                                {project.brand.selectedName === n.name
                                  ? " ✓"
                                  : ""}
                              </strong>
                              <small>{n.rationale}</small>
                            </button>
                          ))}
                        </div>
                        <details>
                          <summary className="f-text">
                            <Plus size={13} /> Add your own name
                          </summary>
                          <Field
                            label="Name candidate"
                            value={newName.name}
                            onChange={(name) =>
                              setNewName({ ...newName, name })
                            }
                            maxLength={100}
                          />
                          <Field
                            label="Why this name fits"
                            value={newName.rationale}
                            onChange={(rationale) =>
                              setNewName({ ...newName, rationale })
                            }
                            multiline
                          />
                          <button
                            className="f-secondary"
                            onClick={addName}
                            disabled={!newName.name.trim()}
                          >
                            Add to shortlist
                          </button>
                        </details>
                        {project.brand.selectedName && (
                          <p className="f-fine">
                            Chosen:{" "}
                            <strong>{project.brand.selectedName}</strong> ·{" "}
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(`"${project.brand.selectedName}" product company`)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Search existing uses ↗
                            </a>
                            . Domain and trademark availability still need
                            checking.
                          </p>
                        )}
                      </div>
                      <div className="f-sheet">
                        <span className="f-eyebrow">A STARTER IDENTITY</span>
                        <h3>Make the direction feel real.</h3>
                        <div
                          className="f-brand-preview"
                          style={{
                            background: project.brand.palette.background,
                            color: project.brand.palette.text,
                          }}
                        >
                          <img
                            alt={`${project.brand.selectedName || project.title} starter wordmark`}
                            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandLogoSvg(project))}`}
                          />
                        </div>
                        <Field
                          label="The promise in a line"
                          value={project.brand.tagline}
                          onChange={(tagline) =>
                            patch({ brand: { ...project.brand, tagline } })
                          }
                          maxLength={500}
                          placeholder="A useful promise, in words your audience would use"
                        />
                        <ListField
                          label="Brand personality"
                          value={project.brand.personality}
                          onChange={(personality) =>
                            patch({ brand: { ...project.brand, personality } })
                          }
                          placeholder="Clear, encouraging, curious… one trait per line"
                        />
                        <div className="f-palette">
                          {Object.entries(project.brand.palette).map(
                            ([key, value]) => (
                              <label key={key}>
                                <input
                                  type="color"
                                  aria-label={`${key} brand color`}
                                  value={value}
                                  onChange={(e) =>
                                    patch({
                                      brand: {
                                        ...project.brand,
                                        palette: {
                                          ...project.brand.palette,
                                          [key]: e.target.value,
                                        },
                                      },
                                    })
                                  }
                                />
                                <span>{key}</span>
                              </label>
                            ),
                          )}
                        </div>
                        <div className="f-two">
                          <Field
                            label="Heading typeface"
                            value={project.brand.typography.heading}
                            onChange={(heading) =>
                              patch({
                                brand: {
                                  ...project.brand,
                                  typography: {
                                    ...project.brand.typography,
                                    heading,
                                  },
                                },
                              })
                            }
                            maxLength={500}
                          />
                          <Field
                            label="Body typeface"
                            value={project.brand.typography.body}
                            onChange={(body) =>
                              patch({
                                brand: {
                                  ...project.brand,
                                  typography: {
                                    ...project.brand.typography,
                                    body,
                                  },
                                },
                              })
                            }
                            maxLength={500}
                          />
                        </div>
                        <Field
                          label="Visual direction"
                          value={project.brand.logoConcept}
                          onChange={(logoConcept) =>
                            patch({ brand: { ...project.brand, logoConcept } })
                          }
                          multiline
                          placeholder="The character, imagery, and visual idea the brand should express"
                        />
                        <p className="f-fine">
                          The preview is an editable starter monogram and
                          wordmark. Your builder receives the visual direction
                          for further design work.
                        </p>
                        <div className="f-actions">
                          <button
                            className="f-secondary"
                            onClick={() =>
                              downloadFile(
                                `${filenameFor(project)}-logo.svg`,
                                brandLogoSvg(project),
                                "image/svg+xml",
                              )
                            }
                          >
                            <Download size={13} /> Logo SVG
                          </button>
                          <button
                            className="f-secondary"
                            onClick={() =>
                              downloadFile(
                                `${filenameFor(project)}-icon.svg`,
                                brandLogoSvg(project, "mark"),
                                "image/svg+xml",
                              )
                            }
                          >
                            App mark
                          </button>
                          <button
                            className="f-secondary"
                            onClick={() =>
                              downloadFile(
                                `${filenameFor(project)}-brand.json`,
                                brandTokensJson(project),
                                "application/json",
                              )
                            }
                          >
                            Brand kit
                          </button>
                          <button
                            className="f-text"
                            onClick={() =>
                              downloadFile(
                                `${filenameFor(project)}-brand.css`,
                                brandTokensCss(project),
                                "text/css",
                              )
                            }
                          >
                            Color & type styles
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {stage.id === "review" && (
                    <>
                      <div className="f-sheet">
                        <span className="f-eyebrow">
                          THE FOUNDER’S DECISION
                        </span>
                        <h3>
                          {approved
                            ? "A direction you can build on."
                            : "Take one last look."}
                        </h3>
                        <p>
                          Read the whole product brief, check your choices, and
                          keep the uncertainties visible. You decide when this
                          is ready to build.
                        </p>
                        <button
                          className="f-secondary"
                          disabled={busy}
                          onClick={() =>
                            void ask(
                              "Review the complete project for contradictions, unclear scope, weak differentiation, missing user journeys, and brand fit. Be candid and specific. Do not mark the project approved.",
                            )
                          }
                        >
                          <Sparkles size={14} /> Ask for an honest critique
                        </button>
                      </div>
                      <div className="f-review-grid">
                        {STAGES.slice(0, 4).map((s) => {
                          const issues =
                            readiness?.issues.filter(
                              (issue) => issue.stage === s.id,
                            ) || [];
                          return (
                            <div className="f-review-item" key={s.id}>
                              {issues.length ? (
                                <Circle size={16} />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                              <div>
                                <strong>{s.short}</strong>
                                <p>
                                  {issues.length
                                    ? issues
                                        .map((issue) => issue.message)
                                        .join(" ")
                                    : s.id === "discover"
                                      ? project.ideas.find(
                                          (i) =>
                                            i.id === project.selectedIdeaId,
                                        )?.title
                                      : s.id === "research"
                                        ? `${project.research.sources.length} sources · ${project.research.unknowns.length} open questions`
                                        : s.id === "product"
                                          ? `${project.product.journeys.length} user journeys · ${project.product.capabilities.length} capabilities`
                                          : project.brand.selectedName}
                                </p>
                              </div>
                              <button
                                className="f-text"
                                onClick={() => goStage(s.id)}
                              >
                                Review <ArrowUpRight size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <article
                        className="f-review-copy"
                        aria-label="Complete product brief"
                      >
                        <h3>{project.brand.selectedName || project.title}</h3>
                        {(
                          [
                            ["What", project.product.what],
                            ["Who", project.product.who],
                            ["Why", project.product.why],
                            ["User journeys", project.product.journeys],
                            ["Capabilities", project.product.capabilities],
                            ["Success", project.product.success],
                            [
                              "Outside the first version",
                              project.product.outOfScope,
                            ],
                          ] as [string, string | string[]][]
                        ).map(([label, value]) => (
                          <section key={label}>
                            <h4>{label}</h4>
                            {Array.isArray(value) ? (
                              <ul>
                                {value.map((item, index) => (
                                  <li key={index}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <p>{value || "Still to decide"}</p>
                            )}
                          </section>
                        ))}
                      </article>
                      <div className="f-approval">
                        <h3>
                          {approved
                            ? "Approved for the next step."
                            : "Your call, founder."}
                        </h3>
                        <p>
                          {approved
                            ? "This version is approved. Changes to the idea, research, product, or brand will require another review."
                            : "Approval confirms this direction and scope. Research questions and name availability remain attached to the handoff."}
                        </p>
                        <button
                          className="f-primary"
                          disabled={!readiness?.ready || busy}
                          onClick={() => {
                            mutate((current) =>
                              updateFounderProject(
                                approveFounderProject(current),
                                { stage: "build" },
                              ),
                            );
                            setMobilePanel("document");
                          }}
                        >
                          {approved
                            ? "Continue to build"
                            : "Approve brief & continue"}{" "}
                          <ArrowRight size={14} />
                        </button>
                        {!readiness?.ready && (
                          <p className="f-fine">
                            Complete the items listed above to enable approval.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  {stage.id === "build" && (
                    <>
                      <div className="f-sheet">
                        <span className="f-eyebrow">
                          FROM THINKING TO MAKING
                        </span>
                        <h3>
                          {approved
                            ? `Let’s make ${project.brand.selectedName}.`
                            : "A clear brief comes first."}
                        </h3>
                        <p>
                          {approved
                            ? "The product, research, and brand travel together. Your builder receives the approved decisions and chooses the technical approach."
                            : "Finish reviewing the product and brand, then approve the current version before handing it to a builder."}
                        </p>
                        {!approved ? (
                          <button
                            className="f-primary"
                            onClick={() => goStage("review")}
                          >
                            Review the brief <ArrowRight size={14} />
                          </button>
                        ) : (
                          <>
                            <div className="f-review-item">
                              <FileText size={18} />
                              <div>
                                <strong>Your handoff includes</strong>
                                <p>
                                  Product brief · research & sources · naming
                                  rationale · SVG logo and app mark · brand
                                  colors & type · open questions
                                </p>
                              </div>
                            </div>
                            <div
                              className="f-actions"
                              style={{ marginTop: 18 }}
                            >
                              <button
                                className="f-secondary"
                                onClick={() =>
                                  downloadFile(
                                    `${filenameFor(project)}-handoff.md`,
                                    buildHandoffMarkdown(project),
                                    "text/markdown",
                                  )
                                }
                              >
                                <Download size={14} /> Download handoff
                              </button>
                              <button
                                className="f-text"
                                onClick={exportProject}
                              >
                                Project backup
                              </button>
                            </div>
                            <label className="f-field">
                              <span>Your builder</span>
                              <select
                                value={provider === "guided" ? "" : provider}
                                onChange={(e) =>
                                  setAgent(e.target.value as FounderProvider)
                                }
                              >
                                <option value="" disabled>
                                  Choose Codex or Claude
                                </option>
                                <option value="codex">Codex</option>
                                <option value="claude">Claude</option>
                              </select>
                            </label>
                            <label className="f-field">
                              <span>Build model</span>
                              <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                              >
                                <option value="">Provider default</option>
                                {connection.models.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {HOSTED_STUDIO ? (
                              <a
                                className="f-primary f-full"
                                href={MAC_DOWNLOAD_URL}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open the next chapter on Mac{" "}
                                <ExternalLink size={14} />
                              </a>
                            ) : (
                              <button
                                className="f-primary f-full"
                                disabled={
                                  busy ||
                                  (!!job &&
                                    ["queued", "running"].includes(job.status))
                                }
                                onClick={() => void build()}
                              >
                                {connection.connection?.status === "connected"
                                  ? `Start building with ${providerLabel}`
                                  : "Connect your builder"}{" "}
                                <ArrowRight size={15} />
                              </button>
                            )}
                            <p className="f-fine">
                              Starting a build creates a new folder in Documents
                              / Whatloom Builds. The selected agent receives the
                              approved brief and can write the first version
                              there. Provider usage follows your account.
                              Publishing is a separate decision.
                            </p>
                          </>
                        )}
                      </div>
                      {job && (
                        <div className="f-build-status" aria-live="polite">
                          <div className="f-row">
                            <h4>
                              {job.status === "running" ||
                              job.status === "queued"
                                ? "Your builder is working"
                                : job.status === "completed"
                                  ? "The builder finished its run"
                                  : job.status === "cancelled"
                                    ? "Build stopped"
                                    : "The build needs attention"}
                            </h4>
                            {["queued", "running"].includes(job.status) && (
                              <Loader2 size={16} className="f-spin" />
                            )}
                          </div>
                          <p>
                            {job.error ||
                              "Your brief, brand assets, and any generated files are in the project folder below."}
                          </p>
                          <p className="f-fine">
                            Building approved revision {job.projectRevision}
                            {job.projectRevision !== project.revision
                              ? " · Your working brief has changed since this build started."
                              : ""}
                          </p>
                          <code>{job.directory}</code>
                          {job.logs.length > 0 && (
                            <pre>{job.logs.join("\n")}</pre>
                          )}
                          {["queued", "running"].includes(job.status) && (
                            <button
                              className="f-secondary"
                              style={{ marginTop: 15 }}
                              onClick={() => void cancelBuild()}
                            >
                              <Square size={12} /> Stop build
                            </button>
                          )}
                          <p className="f-fine">
                            A completed run is the start of review. Check the
                            result against your user journeys and success
                            criteria.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {nextStage && stage.id !== "review" && (
                    <div className="f-next">
                      <small>
                        {stage.id === "discover"
                          ? "Choose a direction, then see how the world solves it today."
                          : stage.id === "research"
                            ? "Bring the learning into a focused product experience."
                            : stage.id === "product"
                              ? "Give the product a name and a recognizable character."
                              : "Review the full picture before handing it to your builder."}
                      </small>
                      <button
                        className="f-primary"
                        disabled={
                          stage.id === "discover" && !project.selectedIdeaId
                        }
                        onClick={() => goStage(nextStage.id)}
                      >
                        Continue to {nextStage.short.toLowerCase()}{" "}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </main>
          </>
        )}
      </div>
      {connectOpen && (
        <AgentSettings
          provider={provider}
          onProvider={setAgent}
          model={model}
          onModel={setModel}
          {...connection}
          onClose={() => setConnectOpen(false)}
        />
      )}
    </div>
  );
}
