"use client";

import { useState } from "react";

/**
 * Add, rename, recolor, reorder, or delete the custom pipeline statuses
 * (Notion-style tags). Deleting a status is blocked server-side if any
 * agency is still sitting in it.
 */
export default function StatusManagerModal({ statuses, onClose, onChanged }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#737373");
  const [isClosed, setIsClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function addStatus(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, is_closed: isClosed }),
    });
    setSaving(false);
    if (res.ok) {
      setName("");
      setColor("#737373");
      setIsClosed(false);
      onChanged();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't add that status.");
    }
  }

  async function removeStatus(s) {
    if (!confirm(`Delete "${s.name}"? Any agency still using it needs to be moved first.`)) return;
    setError("");
    const res = await fetch(`/api/statuses/${s.id}`, { method: "DELETE" });
    if (res.ok) {
      onChanged();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't delete that status.");
    }
  }

  async function patchStatus(s, field, value) {
    setError("");
    const res = await fetch(`/api/statuses/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      onChanged();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't update that status.");
    }
  }

  async function move(index, direction) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= statuses.length) return;
    const a = statuses[index];
    const b = statuses[swapIndex];
    setError("");
    await Promise.all([
      fetch(`/api/statuses/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
      fetch(`/api/statuses/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
    ]);
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">Manage Statuses</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        {error && <p className="text-rose-400 text-sm px-5 pt-3">{error}</p>}

        <div className="px-5 py-4 space-y-2">
          {statuses.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 bg-neutral-800/50 rounded-lg px-3 py-2">
              <input
                type="color"
                value={s.color}
                onChange={(e) => patchStatus(s, "color", e.target.value)}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border border-neutral-700 shrink-0"
                title="Change color"
              />
              <input
                type="text"
                defaultValue={s.name}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== s.name) patchStatus(s, "name", next);
                  else e.target.value = s.name;
                }}
                className="flex-1 min-w-0 bg-transparent text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546] rounded px-1 py-0.5"
              />
              <label
                className="flex items-center gap-1 text-xs text-neutral-400 shrink-0"
                title="No more outreach needed once an agency reaches this status - it's excluded from overdue follow-ups and sinks to the bottom of the list."
              >
                <input
                  type="checkbox"
                  checked={!!s.is_closed}
                  onChange={(e) => patchStatus(s, "is_closed", e.target.checked)}
                  className="accent-[#f01546]"
                />
                Closed
              </label>
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-neutral-500 hover:text-white disabled:opacity-30 leading-none text-[10px]"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === statuses.length - 1}
                  className="text-neutral-500 hover:text-white disabled:opacity-30 leading-none text-[10px]"
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={() => removeStatus(s)}
                className="text-xs text-neutral-600 hover:text-rose-400 shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
          {statuses.length === 0 && (
            <p className="text-sm text-neutral-500">No statuses yet - add one below.</p>
          )}
        </div>

        <form onSubmit={addStatus} className="px-5 py-4 border-t border-neutral-800 space-y-2">
          <h3 className="text-sm font-medium text-neutral-300">Add a new status</h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-9 h-9 rounded cursor-pointer bg-transparent border border-neutral-700 shrink-0"
            />
            <input
              type="text"
              placeholder="Status name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={isClosed}
              onChange={(e) => setIsClosed(e.target.checked)}
              className="accent-[#f01546]"
            />
            Counts as &quot;closed&quot; (no more outreach needed, sinks to the bottom of the list)
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition"
          >
            {saving ? "Adding..." : "Add status"}
          </button>
        </form>
      </div>
    </div>
  );
}
