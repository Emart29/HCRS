import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, Lock, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useConfig } from "../lib/config";
import { money, sleep } from "../lib/meta";
import type { Case, Provider } from "../lib/types";
import { ErrorNote, Spinner } from "./ui";

/* ------------------------------------------------------------------ */
/* Real PayPal JS SDK (sandbox / live)                                 */
/* ------------------------------------------------------------------ */

interface PayPalButtonsInstance {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
}
interface PayPalNamespace {
  Buttons: (opts: Record<string, unknown>) => PayPalButtonsInstance;
}
declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;
let sdkKey = "";

function loadPayPalSdk(clientId: string, currency: string): Promise<PayPalNamespace> {
  const key = `${clientId}|${currency}`;
  if (sdkPromise && sdkKey === key) return sdkPromise;
  sdkKey = key;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=authorize&currency=${encodeURIComponent(currency)}&components=buttons`;
    s.async = true;
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK failed to initialise")));
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Could not load the PayPal SDK"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function RealPayPalButtons({ c, provider, onAuthorized }: { c: Case; provider: Provider; onAuthorized: (c: Case) => void }) {
  const { config } = useConfig();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cbRef = useRef(onAuthorized);
  cbRef.current = onAuthorized;

  useEffect(() => {
    let cancelled = false;
    let instance: PayPalButtonsInstance | null = null;
    setLoading(true);
    setError(null);
    loadPayPalSdk(config.paypal_client_id!, config.currency)
      .then((paypal) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = "";
        instance = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "paypal", height: 45 },
          createOrder: async () => {
            setError(null);
            const updated = await api.checkout(c.id, provider.id);
            return updated.payment.order_id;
          },
          onApprove: async (data: { orderID: string }) => {
            try {
              const updated = await api.authorize(c.id, data.orderID);
              cbRef.current(updated);
            } catch (e) {
              setError((e as Error).message);
            }
          },
          onCancel: () => setError("PayPal window closed. Nothing was charged."),
          onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "PayPal could not complete the authorization."),
        });
        return instance.render(ref.current);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      instance?.close?.().catch(() => undefined);
    };
  }, [c.id, provider.id, config.paypal_client_id, config.currency]);

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-2 py-3 text-sm text-ink-3">
          <Spinner /> Loading PayPal…
        </div>
      )}
      <div ref={ref} className="min-h-[50px]" />
      {error && <ErrorNote message={error} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Simulated sandbox approval sheet (mock mode)                        */
/* ------------------------------------------------------------------ */

type Phase = "review" | "creating" | "authorizing" | "done";

function MockSheet({ c, provider, onClose, onAuthorized }: { c: Case; provider: Provider; onClose: () => void; onAuthorized: (c: Case) => void }) {
  const { config } = useConfig();
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && phase === "review" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  const approve = async () => {
    setError(null);
    try {
      setPhase("creating");
      let current = c;
      if (!current.payment.order_id || current.provider?.id !== provider.id || current.status !== "awaiting_payment") {
        current = await api.checkout(c.id, provider.id);
      }
      await sleep(450);
      setPhase("authorizing");
      const updated = await api.authorize(c.id, current.payment.order_id!);
      await sleep(500);
      setPhase("done");
      await sleep(650);
      onAuthorized(updated);
    } catch (e) {
      setError((e as Error).message);
      setPhase("review");
    }
  };

  const busy = phase !== "review";
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-title"
        className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-lift sm:rounded-3xl"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
      >
        <div className="flex items-center justify-between bg-[#F5F7FA] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-pp">PayPal</span>
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800">
              Sandbox · simulated
            </span>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-ink-3 hover:bg-black/5 disabled:opacity-40" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-4">
          <div className="text-xs text-ink-3">Signed in as</div>
          <div className="text-sm font-medium text-ink">patient@sandbox.example.com</div>

          <div className="mt-4 rounded-2xl ring-1 ring-ink/10">
            <div className="flex items-start justify-between gap-3 p-4">
              <div>
                <div id="pp-title" className="text-sm font-semibold text-ink">
                  CareRoute · {provider.name}
                </div>
                <div className="text-xs text-ink-3">{provider.service}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold tabular-nums text-ink">{money(provider.price, config.currency)}</div>
                <div className="text-[11px] text-ink-3">{config.currency}</div>
              </div>
            </div>
            <div className="flex items-start gap-2 border-t border-ink/10 bg-[#F2F8FD] p-3.5 text-xs text-pp">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <strong>Authorization only.</strong> Funds are held, not taken. You're charged only after {provider.name} confirms your
                consultation, and the hold is released if it doesn't happen.
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5 text-sm">
            <span className="text-ink-3">Pay with</span>
            <span className="font-medium text-ink">Sandbox PayPal balance</span>
          </div>

          {error && (
            <div className="mt-3">
              <ErrorNote message={error} />
            </div>
          )}

          <button
            ref={confirmRef}
            onClick={approve}
            disabled={busy}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-pp-gold text-[15px] font-semibold text-ink transition hover:brightness-95 disabled:cursor-wait"
          >
            {phase === "review" && <>Agree &amp; hold {money(provider.price, config.currency)}</>}
            {phase === "creating" && (
              <>
                <Spinner /> Creating order (intent AUTHORIZE)…
              </>
            )}
            {phase === "authorizing" && (
              <>
                <Spinner /> Placing authorization hold…
              </>
            )}
            {phase === "done" && (
              <>
                <Check className="h-5 w-5" /> Funds held
              </>
            )}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-3">
            <Info className="h-3 w-3" aria-hidden /> Simulated sandbox: no real PayPal account or money is used.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

export default function PayPalCheckout({ c, provider, onAuthorized }: { c: Case; provider: Provider; onAuthorized: (c: Case) => void }) {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const real = !!config.paypal_client_id;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-paper-line px-5 py-4">
        <div>
          <div className="eyebrow">Step 3 · Pay safely</div>
          <div className="mt-0.5 font-semibold text-ink">Hold {money(provider.price, config.currency)} with PayPal</div>
        </div>
        <span className="chip bg-[#E8F3FB] text-pp ring-pp-light/30">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {real ? (config.paypal_mode === "live" ? "Live" : "Sandbox") : "Simulated sandbox"}
        </span>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_280px]">
        <ul className="space-y-2.5 text-sm text-ink-2">
          {[
            ["Authorize now", "PayPal places a hold. Nothing leaves your account yet."],
            ["Capture after the consult", `Only once ${provider.name} confirms you were seen.`],
            ["Automatic release", "No-show, cancellation or an emergency upgrade voids the hold."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pp/10 font-mono text-[11px] font-semibold text-pp">{i + 1}</span>
              <span>
                <span className="font-semibold text-ink">{t}.</span> {d}
              </span>
            </li>
          ))}
        </ul>
        <div>
          {real ? (
            <RealPayPalButtons c={c} provider={provider} onAuthorized={onAuthorized} />
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-1 rounded-full bg-pp-gold text-[15px] font-semibold text-ink shadow-sm transition hover:brightness-95"
            >
              Continue with <span className="font-bold text-pp">PayPal</span>
            </button>
          )}
          <p className="mt-2 text-center text-[11px] text-ink-3">
            {real ? "Opens PayPal checkout (intent: authorize)" : "Mock mode: opens a simulated sandbox approval"}
          </p>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <MockSheet
            c={c}
            provider={provider}
            onClose={() => setOpen(false)}
            onAuthorized={(u) => {
              setOpen(false);
              onAuthorized(u);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
