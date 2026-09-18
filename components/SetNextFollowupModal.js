"use client";

import { useState } from "react";

// Small modal opened from the "Follow-ups" menu's "Set next follow-up"
// option. This is the ONLY way next_followup_date gets set now - it's no
// longer a directly editable field in the main table, so this is what
// actually determines where an agency lands in the Follow Up section's
// default (soonest-first) sort.
export default function SetNextFollowupModal({ agency, onClose, onSave }) {
  const [date, setDate] = useState(agency.next_followup_date || "");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!date) return;
    setSaving(true);
    await onSave(date);
    setSaving(false);
  }

  async function clear() {
    setSaving(true);
    await onSave(null);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-white mb-1">Set next follow-up</h2>
        <p className="text-sm text-neutral-400 mb-4 truncate">{agency.name}</p>
        <form onSubmit={submit}>
          <label className="text-xs text-neutral-400 block mb-4">
            Follow up on
            <input
              autoFocus
              type="date"
              value={date || ""}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !date}
              className="flex-1 bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {agency.next_followup_date && (
              <button
                type="button"
                onClick={clear}
                disabled={saving}
                className="px-3 text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-lg"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
