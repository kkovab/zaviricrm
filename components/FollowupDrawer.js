"use client";

import { useEffect, useState } from "react";
import { CONTACT_METHODS, formatDate } from "@/lib/constants";

export default function FollowupDrawer({ agency, onClose, onLogged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    method: "Phone Call",
    discussed: "",
    outcome: "",
    next_step: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.id]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/followups?agency_id=${agency.id}`);
    const json = await res.json();
    setItems(json.data || []);
    setLoading(false);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id, ...form }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({
        date: new Date().toISOString().slice(0, 10),
        method: "Phone Call",
        discussed: "",
        outcome: "",
        next_step: "",
      });
      await load();
      onLogged?.();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-neutral-900 border-l border-neutral-800 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-white truncate pr-4">{agency.name}</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-sm shrink-0"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 border-b border-neutral-800 space-y-3">
          <h3 className="text-sm font-medium text-neutral-300">Log a follow-up</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-neutral-400">
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Method
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
              >
                {CONTACT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-neutral-400 block">
            What was discussed
            <textarea
              value={form.discussed}
              onChange={(e) => setForm({ ...form, discussed: e.target.value })}
              rows={2}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400 block">
            Result / outcome
            <input
              type="text"
              value={form.outcome}
              onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-xs text-neutral-400 block">
            Next step
            <input
              type="text"
              value={form.next_step}
              onChange={(e) => setForm({ ...form, next_step: e.target.value })}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition"
          >
            {saving ? "Saving..." : "Log follow-up"}
          </button>
        </form>

        <div className="px-5 py-4 space-y-3">
          <h3 className="text-sm font-medium text-neutral-300">History</h3>
          {loading && <p className="text-sm text-neutral-500">Loading...</p>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-neutral-500">No follow-ups logged yet.</p>
          )}
          {items.map((it) => (
            <div key={it.id} className="border border-neutral-800 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between text-neutral-400 text-xs mb-1">
                <span>{formatDate(it.date)}</span>
                <span className="bg-neutral-800 px-2 py-0.5 rounded">{it.method}</span>
              </div>
              {it.discussed && <p className="text-neutral-200 mb-1">{it.discussed}</p>}
              {it.outcome && (
                <p className="text-neutral-400">
                  <span className="text-neutral-500">Outcome: </span>
                  {it.outcome}
                </p>
              )}
              {it.next_step && (
                <p className="text-neutral-400">
                  <span className="text-neutral-500">Next: </span>
                  {it.next_step}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
