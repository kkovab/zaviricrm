"use client";

import { useState } from "react";

const FIELDS = [
  { key: "name", label: "Agency Name" },
  { key: "contact_person", label: "Contact Person (who you spoke to)" },
  { key: "email", label: "Email" },
  { key: "location", label: "Location" },
  { key: "active_listings", label: "Active Listings", type: "number" },
  { key: "oglasnik_profil", label: "Oglasnik Profile Link", isLink: true },
  { key: "website", label: "Website / IG", isLink: true },
];

// Field values are stored however the user typed them (with or without a
// protocol) - normalize so the link always actually navigates instead of
// being treated as a relative path on this same site.
function toHref(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function AgencyInfoModal({ agency, onClose, onSaved, onDelete, initialFocus }) {
  const [form, setForm] = useState(() => {
    const initial = {};
    FIELDS.forEach((f) => (initial[f.key] = agency[f.key] ?? ""));
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const payload = { ...form };
    if (payload.active_listings !== "") {
      payload.active_listings = Number(payload.active_listings) || 0;
    }
    const res = await fetch(`/api/agencies/${agency.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      onSaved?.();
      onClose();
    }
  }

  async function deleteAgency() {
    if (!onDelete) return;
    setDeleting(true);
    const deleted = await onDelete();
    setDeleting(false);
    if (deleted) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header sticky top-0 bg-neutral-900 border-b border-neutral-800 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">Agency Info</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-neutral-400 block">
              <span className="flex items-center justify-between gap-2">
                {f.label}
                {f.isLink && form[f.key]?.trim() && (
                  <a
                    href={toHref(form[f.key].trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#f01546] hover:text-[#f2426a] normal-case font-normal shrink-0"
                  >
                    Open ↗
                  </a>
                )}
              </span>
              <input
                autoFocus={f.key === initialFocus}
                type={f.type || "text"}
                value={form[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
              />
            </label>
          ))}
        </div>

        <div className="modal-footer sticky bottom-0 flex items-center gap-3 bg-neutral-900 border-t border-neutral-800 px-5 py-4">
          {onDelete && (
            <button
              type="button"
              onClick={deleteAgency}
              disabled={saving || deleting}
              className="rounded border border-rose-900 px-3 py-2 text-sm font-medium text-rose-300 transition hover:border-rose-600 hover:bg-rose-950/50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || deleting}
            className="flex-1 bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
