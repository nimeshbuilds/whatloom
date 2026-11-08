"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, GitBranch as Github, Loader2, RefreshCw } from "lucide-react";
import { HOSTED_STUDIO, MAC_DOWNLOAD_URL } from "@/lib/hosting";

export type GitHubTarget = {
  account: string;
  owner: string;
  repository: string;
  visibility: "private" | "public";
};
export type GitHubPublishChoice = GitHubTarget & {
  enabled: boolean;
  repositoryEdited: boolean;
};
export type GitHubConnection = {
  status: "connected" | "disconnected" | "pending" | "unavailable" | "error";
  detail: string;
  account?: { login: string; name?: string };
  accounts?: { login: string; active: boolean }[];
  owners?: { login: string; type: "User" | "Organization"; name?: string }[];
  attempt?: { id: string; url?: string; code?: string; status: string; detail: string };
};

export function repositorySlug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "") || "my-product";
}

export function repositoryNameError(name: string): string {
  const value = name.trim();
  if (!value) return "Give your new repository a name.";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) || /\.git$/i.test(value))
    return "Start with a letter or number. Use up to 100 letters, numbers, hyphens, underscores, or dots, without a .git ending.";
  return "";
}

export function safeGitHubUrl(value: string | undefined, purpose: "auth" | "repository"): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.hash || url.search) return;
    if (purpose === "auth" ? url.pathname !== "/login/device" : !/^\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) return;
    return url.toString();
  } catch { return; }
}

function readConnection(value: unknown): GitHubConnection {
  if (!value || typeof value !== "object") throw new Error("GitHub returned an unreadable connection status.");
  const data = value as Record<string, unknown>;
  const statuses = ["connected", "disconnected", "pending", "unavailable", "error"];
  if (!statuses.includes(String(data.status)) || typeof data.detail !== "string") throw new Error("GitHub returned an unreadable connection status.");
  const login = (input: unknown): input is string => typeof input === "string" && /^[A-Za-z0-9-]{1,100}$/.test(input);
  const name = (input: unknown) => typeof input === "string" ? input.slice(0, 160) : undefined;
  const account = data.account as Record<string, unknown> | undefined;
  const attempt = data.attempt as Record<string, unknown> | undefined;
  return {
    status: data.status as GitHubConnection["status"], detail: data.detail.slice(0, 1600),
    ...(account && login(account.login) ? { account: { login: account.login, ...(name(account.name) ? { name: name(account.name) } : {}) } } : {}),
    accounts: Array.isArray(data.accounts) ? data.accounts.slice(0, 50).flatMap(item => item && login(item.login) ? [{ login: item.login, active: item.active === true }] : []) : [],
    owners: Array.isArray(data.owners) ? data.owners.slice(0, 200).flatMap(item => item && login(item.login) && ["User", "Organization"].includes(item.type) ? [{ login: item.login, type: item.type as "User" | "Organization", ...(name(item.name) ? { name: name(item.name) } : {}) }] : []) : [],
    ...(attempt && typeof attempt.id === "string" && typeof attempt.status === "string" && typeof attempt.detail === "string" ? {
      attempt: { id: attempt.id.slice(0, 100), status: attempt.status.slice(0, 30), detail: attempt.detail.slice(0, 1600),
        ...(typeof attempt.url === "string" && safeGitHubUrl(attempt.url, "auth") ? { url: safeGitHubUrl(attempt.url, "auth") } : {}),
        ...(typeof attempt.code === "string" && /^[A-Za-z0-9-]{1,32}$/.test(attempt.code) ? { code: attempt.code } : {}),
      },
    } : {}),
  };
}

export function useGitHubConnection(enabled: boolean) {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mutation = useRef<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const refreshing = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled || HOSTED_STUDIO || mutation.current !== null || refreshing.current !== null) return;
    const version = ++generation.current;
    refreshing.current = version;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setLoading(true);
    try {
      const response = await fetch("/api/github", { cache: "no-store", signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not check GitHub.");
      if (version !== generation.current || abort.signal.aborted) return;
      setConnection(readConnection(data)); setError("");
    } catch (failure) {
      if (version !== generation.current || abort.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "Could not check GitHub. Refresh to try again.");
    } finally { if (refreshing.current === version) refreshing.current = null; if (version === generation.current) setLoading(false); }
  }, [enabled]);
  useEffect(() => {
    if (!enabled || HOSTED_STUDIO) return;
    // Synchronize the external CLI connection when the local build panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      // This is a request invalidation counter, not a mounted DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      request.current?.abort(); mutation.current = null; refreshing.current = null;
    };
  }, [enabled, refresh]);
  useEffect(() => {
    if (!enabled || connection?.status !== "pending") return;
    const timer = setInterval(() => { void refresh(); }, 2500);
    return () => clearInterval(timer);
  }, [enabled, connection?.status, refresh]);
  async function act(action: "login" | "cancel" | "select-account", account?: string): Promise<GitHubConnection | undefined> {
    if (!enabled || HOSTED_STUDIO || mutation.current !== null) return;
    const version = ++generation.current; mutation.current = version;
    refreshing.current = null;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/github", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ action, ...(action === "cancel" && connection?.attempt ? { attemptId: connection.attempt.id } : {}), ...(action === "select-account" ? { account } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "GitHub could not finish that action.");
      if (version !== generation.current || abort.signal.aborted) return;
      const next = readConnection(data); setConnection(next); return next;
    } catch (failure) {
      if (version !== generation.current || abort.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "GitHub could not finish that action. Try again.");
    } finally {
      if (mutation.current === version) mutation.current = null;
      if (version === generation.current) setLoading(false);
    }
  }
  return { connection, loading, error, refresh, act };
}

export function githubChoice(defaultName: string, saved: GitHubPublishChoice | undefined, connection: GitHubConnection | null): GitHubPublishChoice {
  const account = saved?.account || connection?.account?.login || "";
  const personal = connection?.owners?.find(owner => owner.type === "User" && owner.login.toLowerCase() === account.toLowerCase());
  return { enabled: saved?.enabled === true, account, owner: saved?.owner || personal?.login || "", visibility: saved?.visibility === "public" ? "public" : "private",
    repository: saved?.repositoryEdited ? saved.repository : repositorySlug(defaultName), repositoryEdited: saved?.repositoryEdited === true };
}

export function githubChoiceError(value: GitHubPublishChoice, connection: GitHubConnection | null, loading: boolean): string {
  if (!value.enabled) return "";
  if (loading) return "Wait for the GitHub connection check to finish.";
  if (connection?.status !== "connected" || !connection.account) return "Connect GitHub to publish after the build.";
  if (connection.account.login !== value.account) return "Confirm the GitHub account for this project before publishing.";
  if (!connection.owners?.some(owner => owner.login === value.owner)) return "Choose an available personal account or organization.";
  return repositoryNameError(value.repository);
}

export function GitHubSettings({ value, onChange, github, disabled = false }: {
  value: GitHubPublishChoice;
  onChange: (value: GitHubPublishChoice) => void;
  github: ReturnType<typeof useGitHubConnection>;
  disabled?: boolean;
}) {
  const { connection, loading, error, refresh, act } = github;
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const lifecycle = useRef(0);
  useEffect(() => () => { lifecycle.current++; }, []);
  const account = connection?.account?.login || "";
  const connected = connection?.status === "connected";
  const owners = connection?.owners || [];
  const listedAccounts = connection?.accounts || [];
  const accounts = account && !listedAccounts.some(item => item.login === account) ? [{ login: account, active: true }, ...listedAccounts] : listedAccounts;
  const fieldError = repositoryNameError(value.repository);
  const mismatch = connected && Boolean(value.account) && value.account !== account;
  const locked = disabled || loading;
  const pendingUrl = safeGitHubUrl(connection?.attempt?.url, "auth");
  async function selectAccount(nextAccount: string) {
    const version = ++lifecycle.current;
    const next = await act("select-account", nextAccount);
    if (version !== lifecycle.current || next?.status !== "connected" || !next.account) return;
    const personal = next.owners?.find(owner => owner.type === "User" && owner.login.toLowerCase() === next.account!.login.toLowerCase());
    onChange({ ...value, enabled: false, account: next.account.login, owner: personal?.login || "" });
  }
  return <section className="f-github" aria-labelledby="github-destination-heading">
    <div className="f-row"><div className="f-github-heading"><Github size={19} /><div><h4 id="github-destination-heading">Give your app a home.</h4><small>GitHub · optional</small></div></div>{loading && <Loader2 size={16} className="f-spin" aria-label="Checking GitHub" />}</div>
    <p>Keep your first version local, or publish its source to a new repository after its checks pass.</p>
    {HOSTED_STUDIO ? <div className="f-github-note"><p>Connect GitHub and publish from the local Mac app.</p><a className="f-text" href={MAC_DOWNLOAD_URL} target="_blank" rel="noreferrer">Get the Mac app <ExternalLink size={13} /></a></div> : <>
      <div className="f-github-connection" aria-live="polite">
        <strong>{connection?.status === "pending" ? "Finish connecting in your browser" : connected ? `Connected as @${account}` : connection?.status === "unavailable" ? "Install GitHub CLI to connect" : !connection && loading ? "Checking GitHub…" : "Connect your GitHub account"}</strong>
        <p>{connection?.detail || "Use the official GitHub browser sign-in. Your access token stays with GitHub CLI."}</p>
        {!connected && <p className="f-fine">GitHub will ask for repository, organization, and workflow access.</p>}
        {connection?.status === "pending" ? <>
          {connection.attempt?.code && <div className="f-github-code"><span>Your one-time code</span><div><code>{connection.attempt.code}</code><button className="f-icon" disabled={disabled} aria-label="Copy GitHub sign-in code" onClick={async () => {
            const code = connection.attempt!.code!; const version = lifecycle.current;
            try { await navigator.clipboard.writeText(code); if (version === lifecycle.current) { setCopied(code); setCopyError(""); } }
            catch { if (version === lifecycle.current) setCopyError("Select and copy the code above, then enter it on GitHub."); }
          }}>{copied === connection.attempt.code ? <Check size={16} /> : <Copy size={16} />}</button></div></div>}
          {copyError && <p className="f-fine" role="status">{copyError}</p>}
          <div className="f-actions">{pendingUrl && <a className="f-secondary" href={pendingUrl} target="_blank" rel="noreferrer">Open GitHub sign-in <ExternalLink size={13} /></a>}<button className="f-text" disabled={locked} onClick={() => void act("cancel")}>Cancel sign-in</button></div>
        </> : connection?.status === "unavailable" ? <a className="f-secondary" href="https://cli.github.com/" target="_blank" rel="noreferrer">Get GitHub CLI <ExternalLink size={13} /></a> : !connected ? <button className="f-secondary" disabled={locked} onClick={() => void act("login")}><Github size={15} /> Connect GitHub</button> : <>
          <label className="f-field"><span>GitHub account</span><select value={account} disabled={locked} onChange={event => void selectAccount(event.target.value)}>{accounts.map(item => <option key={item.login} value={item.login}>@{item.login}{item.active ? " · active" : ""}</option>)}</select></label>
          <button className="f-text" disabled={locked} onClick={() => void act("login")}>Reconnect or add an account <ExternalLink size={12} /></button>
        </>}
        <button className="f-text f-github-refresh" disabled={locked} onClick={() => void refresh()}><RefreshCw size={12} /> Refresh GitHub</button>
      </div>
      {error && <p className="f-github-error" role="alert">{error}</p>}
      {mismatch && <div className="f-github-warning"><p>This project was set up for @{value.account}. Confirm a destination for the currently connected account.</p><button className="f-text" disabled={locked} onClick={() => onChange({ ...value, enabled: false, account, owner: owners.find(owner => owner.type === "User" && owner.login.toLowerCase() === account.toLowerCase())?.login || "" })}>Use @{account} for this project</button></div>}
      <fieldset className="f-github-destination" disabled={disabled || loading || !connected || mismatch}>
        <legend className="f-eyebrow">YOUR NEW REPOSITORY</legend>
        <label className="f-field"><span>Personal account or organization</span><select value={value.owner} onChange={event => onChange({ ...value, account, owner: event.target.value })}><option value="" disabled>Choose a destination</option>{value.owner && !owners.some(owner => owner.login === value.owner) && <option value={value.owner} disabled>{value.owner} · unavailable</option>}{owners.map(owner => <option key={owner.login} value={owner.login}>{owner.login} · {owner.type === "Organization" ? "organization" : "personal"}{owner.name && owner.name !== owner.login ? ` (${owner.name})` : ""}</option>)}</select></label>
        <label className="f-field"><span>Repository name</span><input value={value.repository} maxLength={100} spellCheck={false} autoCapitalize="none" autoCorrect="off" aria-invalid={Boolean(fieldError)} aria-describedby="github-repository-hint" onChange={event => onChange({ ...value, account, repository: event.target.value, repositoryEdited: true })} /><small id="github-repository-hint">{fieldError || "A new repository will be created. Existing repositories will not be overwritten."}</small></label>
        <label className="f-field"><span>Visibility</span><select value={value.visibility} onChange={event => onChange({ ...value, account, visibility: event.target.value as "private" | "public" })}><option value="private">Private · invited people only</option><option value="public">Public · anyone can view the source</option></select></label>
        <div className="f-github-preview"><Github size={14} /><code>{value.owner || "your-account"}/{value.repository.trim() || "your-app"}</code><span>{value.visibility}</span></div>
      </fieldset>
      <label className="f-github-opt-in"><input type="checkbox" checked={value.enabled} disabled={disabled || loading || ((!connected || mismatch) && !value.enabled)} onChange={event => onChange({ ...value, account: account || value.account, enabled: event.target.checked })} /><span><strong>Automatically commit and push after checks pass</strong><small>{value.enabled ? "Your next build will run checks, then create and publish this repository." : "Off by default. You decide whether this build publishes to GitHub."}</small></span></label>
      <p className="f-fine">Publishes the generated app and its assets. Planning and handoff documents stay local. This creates a source repository; it does not deploy your app.</p>
      {value.enabled && githubChoiceError(value, connection, loading) && <p className="f-github-error" role="status">{githubChoiceError(value, connection, loading)}</p>}
    </>}
  </section>;
}
