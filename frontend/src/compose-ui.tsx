import { useState } from "react";
import { CategoryChip, LanguageBadge, UrgentBadge } from "./components";
import { channelLabel } from "./lib/proposals";
import type { ComposeResult, Property } from "./types";

const EXAMPLES = [
  "Angry guest at Skyline Studio, aircon broken, writes in Malay, booked on Airbnb",
  "Family locked out at Bangsar Loft late at night, on WhatsApp",
  "French couple at Garden Terrace asking to check out at 2pm",
];

/**
 * "New guest message": the host describes a message (or pastes one), the AI writes it, and
 * the host adds it to the inbox. Everything stays in this browser.
 */
export function ComposePanel({
  properties,
  busy,
  aiLabel,
  maxChars,
  onWrite,
  onAdd,
  onClose,
}: {
  properties: Property[];
  busy: boolean;
  aiLabel: string;
  maxChars: number;
  onWrite: (brief: string, propertyId: number | null) => Promise<ComposeResult | null>;
  onAdd: (result: ComposeResult) => void;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState("");
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);

  async function write(e?: React.FormEvent) {
    e?.preventDefault();
    const text = brief.trim();
    if (!text || busy) return;
    setResult(await onWrite(text, propertyId));
  }

  const m = result?.message;
  return (
    <section className="compose" aria-label="New guest message">
      <div className="ws-top">
        <button type="button" className="link small phone-only-inline" onClick={onClose}>
          ← Inbox
        </button>
        <strong>New guest message</strong>
        <span className="muted small">{aiLabel}</span>
      </div>
      <div className="ws-scroll">
        <p className="muted small compose-hint">
          Describe a guest message and the AI writes it, or paste one. It lands in the inbox
          with its own review and plan. Saved in this browser only.
        </p>
        <form className="compose-form" onSubmit={write}>
          <textarea
            className="input"
            rows={3}
            maxLength={Math.min(500, maxChars)}
            value={brief}
            placeholder={`e.g. "${EXAMPLES[0]}"`}
            onChange={(e) => setBrief(e.target.value)}
            aria-label="Describe the guest message"
          />
          <div className="compose-row">
            <select
              className="input input-inline"
              value={propertyId ?? ""}
              onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : null)}
              aria-label="Property"
            >
              <option value="">Any property (from the description)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={busy || !brief.trim()}>
              {busy ? "Writing…" : result ? "Write again" : "Write message"}
            </button>
          </div>
          {!result && (
            <div className="compose-examples">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="example-chip" onClick={() => setBrief(x)}>
                  {x}
                </button>
              ))}
            </div>
          )}
        </form>

        {result && m && (
          <div className="compose-result">
            <div className="ws-head">
              <div>
                <h3>{m.guest_name}</h3>
                <p className="muted small">
                  {m.property_name}, {m.property_city}
                </p>
              </div>
              <span className={`channel channel-${m.channel}`}>{channelLabel(m.channel)}</span>
            </div>
            <blockquote className="body">{m.body}</blockquote>
            <div className="row-meta">
              {m.triage.urgent && <UrgentBadge />}
              <CategoryChip triage={m.triage} />
              <LanguageBadge triage={m.triage} />
              <span className="muted small">{m.triage.reason}</span>
            </div>
            {result.note && <p className="bubble-note small">{result.note}</p>}
            <div className="review-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onAdd(result);
                  setResult(null);
                  setBrief("");
                }}
              >
                Add to inbox
              </button>
              <button type="button" className="link small" onClick={() => setResult(null)}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
