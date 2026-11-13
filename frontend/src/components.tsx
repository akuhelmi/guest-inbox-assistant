import { useEffect, useRef, useState } from "react";
import { preview, timeAgo } from "./lib/inbox";
import type { Message, Triage } from "./types";

export function CategoryChip({ triage }: { triage: Triage }) {
  return <span className={`chip chip-${triage.category}`}>{triage.category_label}</span>;
}

export function UrgentBadge() {
  return <span className="badge-urgent">Urgent</span>;
}

export function MessageRow({
  message,
  selected,
  onSelect,
}: {
  message: Message;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`row${selected ? " row-selected" : ""}${message.triage.urgent ? " row-urgent" : ""}`}
        onClick={onSelect}
        aria-current={selected}
      >
        <div className="row-top">
          <strong>{message.guest_name}</strong>
          <span className="muted">{timeAgo(message.received_at)}</span>
        </div>
        <div className="row-meta">
          {message.triage.urgent && <UrgentBadge />}
          <CategoryChip triage={message.triage} />
          <span className="muted">{message.property_name}</span>
        </div>
        <p className="row-preview">{preview(message.body)}</p>
      </button>
    </li>
  );
}

/** Triage result with an editable draft. Nothing is ever sent from the demo.
 *  Give it a new `key` for each new result so the draft resets. */
export function TriagePanel({
  triage,
  title,
  fresh = false,
}: {
  triage: Triage;
  title: string;
  /** A new live result: scroll it into view and highlight it briefly. */
  fresh?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState(triage.draft_reply);
  const [copied, setCopied] = useState(false);
  const draftId = `draft-${title.toLowerCase().replace(/\W+/g, "-")}`;

  useEffect(() => {
    if (fresh) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [fresh]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section ref={ref} className={`triage${fresh ? " triage-fresh" : ""}`} aria-live="polite">
      <div className="triage-head">
        <h3>{title}</h3>
        <span className="muted small">by {triage.triaged_by}</span>
      </div>
      <div className="row-meta">
        {triage.urgent && <UrgentBadge />}
        <CategoryChip triage={triage} />
      </div>
      <p className="reason">{triage.reason}</p>
      <label className="label" htmlFor={draftId}>
        Draft reply (edit before sending)
      </label>
      <textarea
        id={draftId}
        className="draft"
        value={draft}
        rows={5}
        onChange={(e) => {
          setDraft(e.target.value);
          setCopied(false);
        }}
      />
      <div className="actions">
        <button type="button" className="btn" onClick={copy}>
          {copied ? "Copied" : "Copy reply"}
        </button>
        <span className="muted small">The demo never sends anything: you copy, review and send.</span>
      </div>
    </section>
  );
}
