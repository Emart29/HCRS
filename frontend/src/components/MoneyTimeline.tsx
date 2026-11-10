import clsx from "clsx";
import { motion } from "framer-motion";
import { BadgeCheck, CircleDollarSign, HandCoins, Lock, RotateCcw, Stethoscope, Unlock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { money } from "../lib/meta";
import type { Case } from "../lib/types";

type State = "done" | "current" | "pending" | "released";
interface Step {
  key: string;
  title: string;
  sub: string;
  state: State;
  icon: LucideIcon;
}

export function moneySteps(c: Case): Step[] {
  const p = c.payment;
  const cur = p.currency;
  const authorized = !!p.authorization_id;
  const captured = !!p.capture_id;
  const paid = !!p.payout_batch_id;
  const voided = p.status === "voided" || (c.status === "cancelled" && authorized && !captured);
  const target = p.adjusted_amount ?? p.amount;

  const steps: Step[] = [
    {
      key: "auth",
      title: "Authorized",
      sub: authorized ? `${money(p.amount, cur)} held on PayPal` : "Approve with PayPal",
      state: authorized ? "done" : "current",
      icon: Lock,
    },
  ];
  if (voided) {
    steps.push({
      key: "void",
      title: "Hold released",
      sub: `${money(0, cur)} charged · authorization voided`,
      state: "released",
      icon: Unlock,
    });
    return steps;
  }
  steps.push(
    {
      key: "consult",
      title: "Consult confirmed",
      sub: captured ? `by ${c.provider?.name ?? "provider"}` : c.review.status === "pending" ? "after clinician review" : "by the provider",
      state: captured ? "done" : authorized ? "current" : "pending",
      icon: Stethoscope,
    },
    {
      key: "capture",
      title: "Captured",
      sub: captured
        ? `${money(p.captured, cur)}${p.captured < p.amount ? ` · ${money(p.amount - p.captured, cur)} released` : ""}`
        : target < p.amount
          ? `only ${money(target, cur)} of ${money(p.amount, cur)}`
          : `${money(target, cur)} when confirmed`,
      state: captured ? "done" : "pending",
      icon: CircleDollarSign,
    },
    {
      key: "payout",
      title: "Provider paid",
      sub: paid ? `${money(p.payout_amount, cur)} via Payouts · fee ${money(p.platform_fee, cur)}` : "PayPal Payouts, minus 5% fee",
      state: paid ? "done" : "pending",
      icon: HandCoins,
    },
  );
  if (p.refunded > 0) {
    steps.push({
      key: "refund",
      title: p.status === "refunded" ? "Refunded" : "Partially refunded",
      sub: `${money(p.refunded, cur)} back to patient`,
      state: "released",
      icon: RotateCcw,
    });
  }
  return steps;
}

const DOT: Record<State, string> = {
  done: "bg-pp text-white ring-pp/20",
  current: "bg-white text-pp ring-pp-light ring-2",
  pending: "bg-paper text-ink-4 ring-ink/10",
  released: "bg-sc-500 text-white ring-sc-500/20",
};

export default function MoneyTimeline({ c, layout = "vertical" }: { c: Case; layout?: "vertical" | "horizontal" }) {
  const steps = moneySteps(c);
  if (layout === "horizontal") {
    return (
      <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s.key} className="relative">
            {i < steps.length - 1 && (
              <span
                className={clsx("absolute left-8 right-0 top-[15px] h-0.5", steps[i + 1].state === "pending" ? "bg-ink/10" : "bg-pp/60")}
                aria-hidden
              />
            )}
            <span className={clsx("relative z-10 grid h-8 w-8 place-items-center rounded-full ring-4", DOT[s.state])}>
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="mt-2 text-xs font-semibold text-ink">{s.title}</div>
            <div className="text-[11px] leading-snug text-ink-3">{s.sub}</div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <motion.li
          key={s.key}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="relative flex gap-3 pb-5 last:pb-0"
        >
          {i < steps.length - 1 && (
            <span
              className={clsx("absolute left-[15px] top-9 h-[calc(100%-32px)] w-0.5 rounded", steps[i + 1].state === "pending" ? "bg-ink/10" : "bg-pp/50")}
              aria-hidden
            />
          )}
          <span className={clsx("relative grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4", DOT[s.state])}>
            {s.state === "current" && <span className="absolute inset-0 animate-pulsering rounded-full bg-pp-light/40" aria-hidden />}
            <s.icon className="relative h-4 w-4" aria-hidden />
          </span>
          <div className="pt-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              {s.title}
              {s.state === "done" && <BadgeCheck className="h-4 w-4 text-pp" aria-label="done" />}
            </div>
            <div className="text-xs text-ink-3">{s.sub}</div>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
