"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, isTicketOverdue } from "@/lib/constants";

// Second "button" alongside the agency list - a flat to-do list of one-off
// action items that don't belong in the Follow-ups flow (pull an agency's
// ads, send a confirmation email, etc). Tickets are scoped to an agency but
// aren't about scheduling a conversation, so they live entirely separately
// from next_followup_date and the Follow Up section.
export default function TicketsModal({ agencies, onClose, onChanged }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [agencyFilter, setAgencyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showDone, setShowDone] = useState(true);

  const [newAgencyId, setNewAgencyId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("");
  const [newDue, setNewDue] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/tickets");
    const json = await res.json();
    setTickets(json.data || []);
    setLoading(false);
  }

  async function createTicket(e) {
    e.preventDefault();
    if (!newAgencyId || !newTitle.trim()) return;
    setCreating(true);
    setError("");
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agency_id: newAgencyId,
        title: newTitle.trim(),
        type: newType.trim() || null,
        due_date: newDue || null,
      }),
    });
    setCreating(false);
    if (res.ok) {
      setNewTitle("");
      setNewType("");
      setNewDue("");
      await load();
      onChanged?.();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't create that ticket.");
    }
  }

  async function toggleDone(t) {
    setError("");
    const res = await fetch(`/api/tickets/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !t.done }),
    });
    if (res.ok) {
      await load();
      onChanged?.();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't update that ticket.");
    }
  }

  async function removeTicket(t) {
    if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    setError("");
    const res = await fetch(`/api/tickets/${t.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      onChanged?.();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't delete that ticket.");
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditType(t.type || "");
    setEditDue(t.due_date || "");
  }

  async function saveEdit(id) {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    setError("");
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        type: editType.trim() || null,
        due_date: editDue || null,
      }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditingId(null);
      await load();
      onChanged?.();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't save that ticket.");
    }
  }

  const types = useMemo(() => {
    const set = new Set(tickets.map((t) => t.type).filter(Boolean));
    return [...set].sort();
  }, [tickets]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (agencyFilter && t.agency_id !== agencyFilter) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      return true;
    });
  }, [tickets, agencyFilter, typeFilter]);

  const openTickets = useMemo(() => filtered.filter((t) => !t.done), [filtered]);
  const doneTickets = useMemo(() => filtered.filter((t) => t.done), [filtered]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-5 py-4 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-white">Tickets</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        {error && <p className="text-rose-400 text-sm px-5 pt-3 shrink-0">{error}</p>}

        <form
          onSubmit={createTicket}
          className="px-5 py-4 border-b border-neutral-800 space-y-2 shrink-0"
        >
          <h3 className="text-sm font-medium text-neutral-300">New ticket</h3>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newAgencyId}
              onChange={(e) => setNewAgencyId(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
            >
              <option value="">Select agency...</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
              title="Due date (optional)"
            />
          </div>
          <input
            type="text"
            placeholder="What needs to happen... (e.g. Pull her ads)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          />
          <input
            type="text"
            placeholder="Type (optional, e.g. Email, Admin)"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          />
          <button
            type="submit"
            disabled={creating || !newAgencyId || !newTitle.trim()}
            className="w-full bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition"
          >
            {creating ? "Adding..." : "Add ticket"}
          </button>
        </form>

        <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          >
            <option value="">All agencies</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${
              showDone
                ? "bg-neutral-800 border-neutral-700 text-neutral-300"
                : "bg-neutral-900 border-neutral-800 text-neutral-600"
            }`}
          >
            {showDone ? "Hide done" : "Show done"}
          </button>
          {(agencyFilter || typeFilter) && (
            <button
              type="button"
              onClick={() => {
                setAgencyFilter("");
                setTypeFilter("");
              }}
              className="text-xs text-neutral-500 hover:text-white underline"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Open ({openTickets.length})
            </h3>
            {loading ? (
              <p className="text-sm text-neutral-600">Loading...</p>
            ) : openTickets.length === 0 ? (
              <p className="text-sm text-neutral-600">Nothing open.</p>
            ) : (
              <ul className="space-y-2">
                {openTickets.map((t) => {
                  const overdue = isTicketOverdue(t);
                  return (
                    <li
                      key={t.id}
                      className={`border rounded-lg px-3 py-2 ${
                        overdue ? "bg-rose-900/30 border-rose-800" : "bg-neutral-800/40 border-neutral-800"
                      }`}
                    >
                      {editingId === t.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Type"
                              value={editType}
                              onChange={(e) => setEditType(e.target.value)}
                              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
                            />
                            <input
                              type="date"
                              value={editDue}
                              onChange={(e) => setEditDue(e.target.value)}
                              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(t.id)}
                              disabled={editSaving || !editTitle.trim()}
                              className="text-xs bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white px-3 py-1 rounded-lg"
                            >
                              {editSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={editSaving}
                              className="text-xs text-neutral-400 hover:text-white px-3 py-1 rounded-lg border border-neutral-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-white font-medium">{t.title}</span>
                              {t.type && (
                                <span className="text-[10px] uppercase tracking-wide bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
                                  {t.type}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              {t.agency_name}
                              {t.due_date && (
                                <>
                                  {" · "}
                                  <span className={overdue ? "text-rose-300 font-medium" : ""}>
                                    Due {formatDate(t.due_date)}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleDone(t)}
                              className="text-xs text-emerald-400 hover:text-emerald-300"
                            >
                              Complete
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              className="text-xs text-neutral-500 hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTicket(t)}
                              className="text-xs text-neutral-600 hover:text-rose-400"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {showDone && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                Done ({doneTickets.length})
              </h3>
              {doneTickets.length === 0 ? (
                <p className="text-sm text-neutral-600">Nothing completed yet.</p>
              ) : (
                <ul className="space-y-2">
                  {doneTickets.map((t) => (
                    <li
                      key={t.id}
                      className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 opacity-70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-neutral-300 line-through">{t.title}</span>
                            {t.type && (
                              <span className="text-[10px] uppercase tracking-wide bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded">
                                {t.type}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {t.agency_name}
                            {t.completed_at && <> · Completed {formatDate(t.completed_at)}</>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleDone(t)}
                            className="text-xs text-neutral-400 hover:text-white"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTicket(t)}
                            className="text-xs text-neutral-600 hover:text-rose-400"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
