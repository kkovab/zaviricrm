"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/constants";

// Single drawer for everything follow-up related on one agency - opens
// directly when you click "Follow-ups", no menu first. The two tabs share
// one date + description form: "Log a follow-up" records something that
// already happened (added to History below), "Set next follow-up" sets the
// Upcoming entry, which also drives the Follow Up section's default sort
// and the main table's read-only "Next follow-up" column.
export default function FollowupDrawer({ agency, onClose, onLogged, onSetNext }) {
  const [tab, setTab] = useState("log"); // "log" | "next"
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [upcomingDate, setUpcomingDate] = useState(agency.next_followup_date || null);
  const [upcomingNote, setUpcomingNote] = useState(agency.next_followup_note || null);
  const [clearing, setClearing] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.id]);

  // Switching tabs starts the form fresh - today's date for a log, or
  // whatever's already upcoming (if anything) when setting the next one.
  useEffect(() => {
    if (tab === "next") {
      setDate(upcomingDate || new Date().toISOString().slice(0, 10));
      setDescription(upcomingNote || "");
    } else {
      setDate(new Date().toISOString().slice(0, 10));
      setDescription("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadHistory() {
    setHistoryLoading(true);
    const res = await fetch(`/api/followups?agency_id=${agency.id}`);
    const json = await res.json();
    setHistory(json.data || []);
    setHistoryLoading(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (!date) return;
    setSaving(true);
    if (tab === "log") {
      const res = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agency.id, date, discussed: description || null }),
      });
      if (res.ok) {
        setDescription("");
        await loadHistory();
        onLogged?.();
      }
    } else {
      await onSetNext(date, description || null);
      setUpcomingDate(date);
      setUpcomingNote(description || null);
    }
    setSaving(false);
  }

  async function clearUpcoming() {
    setClearing(true);
    await onSetNext(null, null);
    setUpcomingDate(null);
    setUpcomingNote(null);
    setClearing(false);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDate(item.date);
    setEditDescription(item.discussed || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id) {
    if (!editDate) return;
    setEditSaving(true);
    const res = await fetch(`/api/followups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: editDate, discussed: editDescription || null }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditingId(null);
      await loadHistory();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-md h-full bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-white">Follow-ups</h2>
            <p className="text-sm text-neutral-400 truncate">{agency.name}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-neutral-500 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-6">
          <div>
            <div className="flex gap-1 p-1 rounded-lg bg-neutral-800 mb-3">
              <button
                type="button"
                onClick={() => setTab("log")}
                className={`flex-1 text-sm py-1.5 rounded-md transition ${
                  tab === "log" ? "bg-[#f01546] text-white" : "text-neutral-300 hover:text-white"
                }`}
              >
                Log a follow-up
              </button>
              <button
                type="button"
                onClick={() => setTab("next")}
                className={`flex-1 text-sm py-1.5 rounded-md transition ${
                  tab === "next" ? "bg-[#f01546] text-white" : "text-neutral-300 hover:text-white"
                }`}
              >
                Set next follow-up
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <label className="text-xs text-neutral-400 block">
                Date
                <input
                  autoFocus
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
                />
              </label>
              <label className="text-xs text-neutral-400 block">
                Description
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tab === "log" ? "What was discussed..." : "What to bring up next time..."}
                  className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546] resize-none"
                />
              </label>
              <button
                type="submit"
                disabled={saving || !date}
                className="w-full bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition"
              >
                {saving ? "Saving..." : tab === "log" ? "Log follow-up" : "Save next follow-up"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Next follow-up
            </h3>
            {upcomingDate ? (
              <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white font-medium">{formatDate(upcomingDate)}</span>
                  <button
                    type="button"
                    onClick={clearUpcoming}
                    disabled={clearing}
                    className="text-xs text-neutral-500 hover:text-rose-400"
                  >
                    Clear
                  </button>
                </div>
                {upcomingNote && (
                  <p className="text-sm text-neutral-300 mt-1 whitespace-pre-wrap">{upcomingNote}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-600">Nothing scheduled.</p>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              History
            </h3>
            {historyLoading ? (
              <p className="text-sm text-neutral-600">Loading...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-neutral-600">No follow-ups logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((it) => (
                  <li
                    key={it.id}
                    className="bg-neutral-800/40 border border-neutral-800 rounded-lg px-3 py-2"
                  >
                    {editingId === it.id ? (
                      <div className="space-y-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
                        />
                        <textarea
                          rows={2}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546] resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(it.id)}
                            disabled={editSaving || !editDate}
                            className="text-xs bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white px-3 py-1 rounded-lg"
                          >
                            {editSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={editSaving}
                            className="text-xs text-neutral-400 hover:text-white px-3 py-1 rounded-lg border border-neutral-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-sm text-white font-medium">{formatDate(it.date)}</span>
                          {it.discussed && (
                            <p className="text-sm text-neutral-300 mt-0.5 whitespace-pre-wrap">
                              {it.discussed}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          className="shrink-0 text-xs text-neutral-500 hover:text-white"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
