import type { PropsWithChildren, ReactNode } from "react";

export function SectionHeader({ eyebrow, title, detail, action }: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function StatusDot({ tone = "green", children }: PropsWithChildren<{ tone?: "green" | "amber" | "blue" | "gray" }>) {
  return <span className={`status-dot status-${tone}`}><i />{children}</span>;
}

export function EmptyState({ icon = "◇", title, detail }: { icon?: string; title: string; detail: string }) {
  return <div className="empty-state"><b>{icon}</b><strong>{title}</strong><span>{detail}</span></div>;
}

export function Segmented<T extends string>({ value, items, onChange }: {
  value: T;
  items: Array<{ value: T; label: string }>;
  onChange(value: T): void;
}) {
  return <div className="segmented">{items.map((item) => (
    <button key={item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)}>{item.label}</button>
  ))}</div>;
}
