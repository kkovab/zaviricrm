"use client";

import { useState } from "react";

const FIELDS = [
  { key: "name", label: "Agency Name" },
  { key: "contact_person", label: "Contact Person (who you spoke to)" },
  { key: "phone", label: "Phone" },
  { key: "mobile_alt", label: "Mobile (Alt)" },
  { key: "email", label: "Email" },
  { key: "location", label: "Location" },
  { key: "active_listings", label: "Active Listings", type: "number" },
  { key: "oglasnik_profil", label: "Oglasnik Profile Link" },
  { key: "website", label: "Website / IG" },
];

export default function AgencyInfoModal({ agency, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const initial = {};
    FIELDS.forEach((f) => (initial[f.key] = agency[f.key] ?? ""));
    return initial;
  });
  const [saving, setSaving] = useState(false);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">Agency Info</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm">
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-neutral-400 block">
              {f.label}
              <input
                type={f.type || "text"}
                value={form[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
                className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
              />
            </label>
          ))}
        </div>

        <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 px-5 py-4">
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
