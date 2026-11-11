import { useState } from "react";
import { money } from "../lib/meta";
import type { Stats } from "../lib/types";

interface Node {
  id: string;
  label: string;
  value: number;
  color: string;
  col: number;
  y: number;
  h: number;
}
interface Link {
  from: string;
  to: string;
  value: number;
  color: string;
  sy: number;
  ty: number;
  h: number;
}

const W = 640;
const H = 250;
const NODE_W = 12;
const GAP = 14;
const COLS = [8, 214, 446];

/** A small three-column Sankey: authorized → held / captured → payout / fees / refunds. */
export default function MoneyFlow({ money: m }: { money: Stats["money"] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = m.held + m.captured;
  if (total <= 0) {
    return (
      <div className="grid h-[250px] place-items-center rounded-xl bg-paper text-sm text-ink-3 ring-1 ring-ink/5">
        No money has moved yet. Book a consult to see the flow.
      </div>
    );
  }
  const cur = m.currency;
  const right = [
    { id: "payout", label: "Paid to providers", value: m.paid_out, color: "#0F8A7A" },
    { id: "fees", label: "Platform fees (5%)", value: m.platform_fees, color: "#7C3AED" },
    { id: "refund", label: "Refunded to patients", value: m.refunded, color: "#D97706" },
  ].filter((r) => r.value > 0);
  const rightSum = right.reduce((s, r) => s + r.value, 0) || 1;

  const usable = H - GAP * 3;
  const scale = usable / total;

  const nodes: Node[] = [];
  const links: Link[] = [];
  nodes.push({ id: "auth", label: "Authorized on PayPal", value: total, color: "#0E1726", col: 0, y: (H - total * scale) / 2, h: total * scale });

  let y = (H - (total * scale + (m.held > 0 && m.captured > 0 ? GAP : 0))) / 2;
  const mid: Node[] = [];
  if (m.held > 0) {
    mid.push({ id: "held", label: "Held, awaiting consult", value: m.held, color: "#009CDE", col: 1, y, h: m.held * scale });
    y += m.held * scale + GAP;
  }
  if (m.captured > 0) mid.push({ id: "captured", label: "Captured after consult", value: m.captured, color: "#003087", col: 1, y, h: m.captured * scale });
  nodes.push(...mid);

  let sy = nodes[0].y;
  for (const n of mid) {
    links.push({ from: "auth", to: n.id, value: n.value, color: n.color, sy, ty: n.y, h: n.h });
    sy += n.h;
  }

  const cap = mid.find((n) => n.id === "captured");
  if (cap && right.length) {
    const rScale = cap.h / rightSum;
    const rTotalH = right.reduce((s, r) => s + r.value * rScale, 0) + GAP * (right.length - 1);
    let ry = Math.max(4, Math.min(H - rTotalH - 4, cap.y + cap.h / 2 - rTotalH / 2));
    let csy = cap.y;
    for (const r of right) {
      const h = r.value * rScale;
      nodes.push({ ...r, col: 2, y: ry, h });
      links.push({ from: "captured", to: r.id, value: r.value, color: r.color, sy: csy, ty: ry, h });
      csy += h;
      ry += h + GAP;
    }
  }

  const colX = (col: number) => COLS[col];
  const nodeById = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Money flow from PayPal authorizations to providers, fees and refunds">
        {links.map((l) => {
          const a = nodeById(l.from);
          const b = nodeById(l.to);
          const x0 = colX(a.col) + NODE_W;
          const x1 = colX(b.col);
          const xm = (x0 + x1) / 2;
          const d = `M${x0},${l.sy} C${xm},${l.sy} ${xm},${l.ty} ${x1},${l.ty} L${x1},${l.ty + l.h} C${xm},${l.ty + l.h} ${xm},${l.sy + l.h} ${x0},${l.sy + l.h} Z`;
          const dim = hover && hover !== l.to && hover !== l.from;
          return (
            <path
              key={l.from + l.to}
              d={d}
              fill={l.color}
              opacity={dim ? 0.08 : hover ? 0.35 : 0.2}
              onMouseEnter={() => setHover(l.to)}
              onMouseLeave={() => setHover(null)}
              className="transition-opacity"
            >
              <title>
                {nodeById(l.to).label}: {money(l.value, cur)}
              </title>
            </path>
          );
        })}
        {nodes.map((n) => {
          const x = colX(n.col);
          const labelRight = true;
          return (
            <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={n.y} width={NODE_W} height={Math.max(n.h, 2)} rx={3} fill={n.color} />
              <text
                x={labelRight ? x + NODE_W + 8 : x - 8}
                y={n.y + Math.max(n.h, 2) / 2 - 6}
                textAnchor={labelRight ? "start" : "end"}
                className="fill-ink-3"
                style={{ fontSize: 11, fontFamily: "Inter" }}
                dominantBaseline="middle"
              >
                {n.label}
              </text>
              <text
                x={labelRight ? x + NODE_W + 8 : x - 8}
                y={n.y + Math.max(n.h, 2) / 2 + 8}
                textAnchor={labelRight ? "start" : "end"}
                className="fill-ink"
                style={{ fontSize: 13, fontWeight: 600, fontFamily: "JetBrains Mono" }}
                dominantBaseline="middle"
              >
                {money(n.value, cur)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
