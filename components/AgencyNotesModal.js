"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/constants";

export default function AgencyNotesModal({ agency, onClose, onChanged }) {
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.id]);

  async function loadHistory() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/agency-notes?agency_id=${agency.id}`);
    const json = await response.json();
    if (!response.ok) setError(json.error || "Couldn't load note history.");
    else setHistory(json.data || []);
    setLoading(false);
  }

  async function addNote(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    const response = await fetch("/api/agency-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_id: agency.id, content: draft }),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(json.error || "Couldn't save note.");
      return;
    }
    setDraft("");
    setHistory((current) => [json.data, ...current]);
    onChanged?.();
  }

  async function removeNote(note) {
    if (!confirm("Delete this note? This can't be undone.")) return;
    setDeletingId(note.id);
    const response = await fetch(`/api/agency-notes/${note.id}`, { method: "DELETE" });
    const json = await response.json();
    setDeletingId(null);
    if (!response.ok) {
      setError(json.error || "Couldn't delete note.");
      return;
    }
    setHistory((current) => current.filter((item) => item.id !== note.id));
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="modal-surface flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-white">Notes</h2>
            <p className="truncate text-sm text-neutral-400">{agency.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-neutral-400 hover:text-white">Close</button>
        </div>

        <form onSubmit={addNote} className="border-b border-neutral-800 p-5">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a note..."
            rows={3}
            className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          />
          <div className="mt-2 flex justify-end">
            <button type="submit" disabled={saving || !draft.trim()} className="primary-button disabled:opacity-50">
              {saving ? "Adding..." : "Add note"}
            </button>
          </div>
        </form>

        <div className="thin-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {agency.notes?.trim() && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Old info</p>
              <p className="whitespace-pre-wrap text-sm text-neutral-300">{agency.notes}</p>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-neutral-500">Loading notes...</p>
          ) : error ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-neutral-500">No note history yet.</p>
          ) : (
            history.map((note) => (
              <article key={note.id} className="border-b border-neutral-800 pb-3 last:border-0">
                <p className="whitespace-pre-wrap text-sm text-neutral-200">{note.content}</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <time className="block text-xs text-neutral-500">
                    {formatDate(note.created_at?.slice(0, 10))}
                  </time>
                  <button
                    type="button"
                    onClick={() => removeNote(note)}
                    disabled={deletingId === note.id}
                    className="text-xs text-neutral-500 hover:text-rose-300 disabled:opacity-50"
                  >
                    {deletingId === note.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
