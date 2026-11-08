"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { HOSTED_STUDIO, MAC_DOWNLOAD_URL } from "@/lib/hosting";

export type FounderProvider = "guided" | "codex" | "claude";
export type Connection = {
  provider: string;
  status: "connected" | "disconnected" | "pending" | "unavailable" | "error";
  detail: string;
  authMethod?: string;
  attempt?: { id: string; status: string; url?: string; detail: string };
};
export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
};
export function useAgentConnection(provider: FounderProvider) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (HOSTED_STUDIO || provider === "guided") {
      setConnection(null);
      setModels([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/agents/auth?provider=${provider}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Connection check failed.");
      if (version !== generation.current) return;
      setConnection(data);
    } catch (error) {
      if (version === generation.current)
        setConnection({
          provider,
          status: "error",
          detail:
            error instanceof Error
              ? error.message
              : "Could not reach the local app.",
        });
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [provider]);
  useEffect(() => {
    // Provider changes invalidate the external CLI connection while it is refreshed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnection(null);
    setModels([]);
    setDetail("");
    void refresh();
    return () => {
      // This ref is an invalidation counter, not a mounted DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (HOSTED_STUDIO || provider === "guided") return;
    const abort = new AbortController();
    fetch(`/api/agents/models?provider=${provider}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Model list unavailable.");
        if (abort.signal.aborted) return;
        setModels(data.models || []);
        setDetail(data.detail || "Availability depends on your account.");
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setDetail(
            error instanceof Error ? error.message : "Model list unavailable.",
          );
      });
    return () => abort.abort();
  }, [provider]);
  useEffect(() => {
    if (connection?.status !== "pending") return;
    const timer = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [connection?.status, refresh]);
  async function authenticate(action: "start" | "cancel") {
    if (provider === "guided" || HOSTED_STUDIO) return;
    const version = ++generation.current;
    setLoading(true);
    try {
      const response = await fetch("/api/agents/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          action,
          ...(action === "cancel" && connection?.attempt
            ? { attemptId: connection.attempt.id }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Sign-in could not start.");
      if (version !== generation.current) return;
      setConnection(data);
    } catch (error) {
      if (version !== generation.current) return;
      setConnection({
        provider,
        status: "error",
        detail:
          error instanceof Error ? error.message : "Sign-in could not start.",
      });
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  return { connection, models, loading, detail, refresh, authenticate };
}

export function AgentSettings({
  provider,
  onProvider,
  model,
  onModel,
  connection,
  models,
  loading,
  detail,
  refresh,
  authenticate,
  onClose,
}: {
  provider: FounderProvider;
  onProvider: (value: FounderProvider) => void;
  model: string;
  onModel: (value: string) => void;
  connection: Connection | null;
  models: ModelOption[];
  loading: boolean;
  detail: string;
  refresh: () => Promise<void>;
  authenticate: (action: "start" | "cancel") => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const node = dialog.current;
    return () => node?.close();
  }, []);
  return (
    <dialog
      className="founder-dialog"
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="founder-dialog-head">
        <span className="f-eyebrow">YOUR THINKING PARTNER</span>
        <button
          className="f-icon"
          aria-label="Close AI connection"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <h2>
        A familiar AI.
        <br />
        <em>A better place to think.</em>
      </h2>
      <p>
        Choose who you want to work with. Your conversation and brief stay
        together when you switch.
      </p>
      {HOSTED_STUDIO ? (
        <div className="f-connect-card">
          <h3>Connect your AI in the Mac app</h3>
          <p>
            This browser edition includes the planning workspace and exports.
            The Mac app connects to Codex and Claude on your computer.
          </p>
          <a
            className="f-primary"
            href={MAC_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
          >
            Download Whatloom for Mac <ExternalLink size={15} />
          </a>
        </div>
      ) : (
        <>
          <div className="f-provider-options">
            {(
              [
                ["codex", "Codex", "Use your OpenAI account"],
                ["claude", "Claude", "Use your Anthropic account"],
                [
                  "guided",
                  "Guided notebook",
                  "Think and write at your own pace",
                ],
              ] as const
            ).map(([id, title, subtitle]) => (
              <button
                key={id}
                aria-pressed={provider === id}
                onClick={() => onProvider(id)}
              >
                <span className={`f-provider-symbol ${id}`}>
                  {id === "codex" ? "◎" : id === "claude" ? "✳" : "✎"}
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </span>
                {provider === id && <Check size={17} />}
              </button>
            ))}
          </div>
          {provider !== "guided" && (
            <div className="f-connect-card" aria-live="polite">
              <div className="f-row">
                <strong>
                  {loading && !connection
                    ? "Checking your connection…"
                    : connection?.status === "connected"
                      ? "Connected"
                      : connection?.status === "pending"
                        ? "Finish signing in in your browser"
                        : connection?.status === "unavailable"
                          ? "One setup step first"
                          : "Connect your account"}
                </strong>
                {loading && <Loader2 className="f-spin" size={16} />}
              </div>
              <p>
                {connection?.detail ||
                  "Checking the official agent on this computer."}
              </p>
              {connection?.status === "unavailable" ? (
                <a
                  className="f-secondary"
                  href={
                    provider === "codex"
                      ? "https://developers.openai.com/codex/quickstart"
                      : "https://code.claude.com/docs/en/setup"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Get {provider === "codex" ? "Codex" : "Claude Code"}{" "}
                  <ExternalLink size={14} />
                </a>
              ) : connection?.status === "pending" ? (
                <div className="f-actions">
                  {connection.attempt?.url && (
                    <a
                      className="f-primary"
                      href={connection.attempt.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open sign-in page <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    className="f-secondary"
                    onClick={() => void authenticate("cancel")}
                  >
                    Cancel sign-in
                  </button>
                </div>
              ) : (
                connection?.status !== "connected" && (
                  <button
                    className="f-primary"
                    disabled={loading}
                    onClick={() => void authenticate("start")}
                  >
                    Sign in with {provider === "codex" ? "OpenAI" : "Claude"}{" "}
                    <ExternalLink size={15} />
                  </button>
                )
              )}
              <button
                className="f-text"
                disabled={loading}
                onClick={() => void refresh()}
              >
                <RefreshCw size={13} /> Check connection
              </button>
              {connection?.status === "connected" && (
                <p className="f-fine">
                  Your provider handles sign-in. Whatloom never asks for your
                  password. Account limits and billing follow your agent
                  account.
                </p>
              )}
            </div>
          )}
          {provider !== "guided" && (
            <label className="f-field">
              <span>Model</span>
              <select value={model} onChange={(e) => onModel(e.target.value)}>
                <option value="">Provider default</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.isDefault ? " · default" : ""}
                  </option>
                ))}
              </select>
              <small>
                {detail ||
                  "Choose from the agent’s catalog. Access depends on your account."}
              </small>
            </label>
          )}
        </>
      )}
      <button className="f-primary f-full" onClick={onClose}>
        {provider === "guided" || HOSTED_STUDIO ? "Continue planning" : "Done"}
      </button>
    </dialog>
  );
}
