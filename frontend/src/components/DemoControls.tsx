import { Database, RotateCcw } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { Spinner } from "./ui";

export default function DemoControls({ onChange, compact = false }: { onChange?: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState<"seed" | "reset" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (kind: "seed" | "reset") => {
    if (kind === "reset" && !window.confirm("Delete all cases and audit events?")) return;
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "seed") {
        const r = await api.seed();
        setMsg(`Loaded ${r.created} demo cases`);
      } else {
        await api.reset();
        setMsg("All data cleared");
      }
      onChange?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
      window.setTimeout(() => setMsg(null), 3500);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {msg && (
        <span className="text-xs text-ink-3" role="status">
          {msg}
        </span>
      )}
      <button onClick={() => run("seed")} disabled={!!busy} className="btn-ghost h-9 px-3 text-xs">
        {busy === "seed" ? <Spinner className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" aria-hidden />}
        Load demo data
      </button>
      {!compact && (
        <button onClick={() => run("reset")} disabled={!!busy} className="btn-ghost h-9 px-3 text-xs text-ink-3">
          {busy === "reset" ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
          Reset
        </button>
      )}
    </div>
  );
}
