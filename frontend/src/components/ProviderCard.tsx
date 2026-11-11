import clsx from "clsx";
import { Building2, Check, Clock, Pill, Star, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { money, PROVIDER_TYPE } from "../lib/meta";
import type { Provider } from "../lib/types";

const TYPE_ICON: Record<string, LucideIcon> = { pharmacy: Pill, telehealth: Video, clinic: Building2 };

export default function ProviderCard({
  p,
  selected,
  onSelect,
  best,
  currency,
  disabled,
}: {
  p: Provider;
  selected: boolean;
  onSelect: () => void;
  best?: string;
  currency: string;
  disabled?: boolean;
}) {
  const Icon = TYPE_ICON[p.type] ?? Building2;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        "group relative flex w-full flex-col rounded-2xl bg-white p-4 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-60",
        selected ? "shadow-lift ring-2 ring-ink" : "shadow-card ring-ink/[0.07] hover:-translate-y-0.5 hover:shadow-lift hover:ring-ink/20",
      )}
    >
      {best && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper">
          {best}
        </span>
      )}
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper text-ink-2">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight text-ink">{p.name}</div>
          <div className="mt-0.5 text-xs text-ink-3">{p.service}</div>
        </div>
        <span
          className={clsx(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 transition",
            selected ? "bg-ink text-paper ring-ink" : "text-transparent ring-ink/20",
          )}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-ink-3" aria-hidden />~{p.eta_minutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {p.rating.toFixed(1)}
          </span>
          <span className="text-ink-3">
            {PROVIDER_TYPE[p.type] ?? p.type} · {p.city}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tabular-nums tracking-tight text-ink">{money(p.price, currency)}</div>
        </div>
      </div>
    </button>
  );
}
