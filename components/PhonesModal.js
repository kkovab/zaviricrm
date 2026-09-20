"use client";

import { useState } from "react";

export function normalizePhones(values) {
  const seen = new Set();
  return values.reduce((phones, value) => {
    const phone = String(value || "").trim();
    const key = phone.replace(/[\s().-]/g, "");
    if (!phone || seen.has(key)) return phones;
    seen.add(key);
    phones.push(phone);
    return phones;
  }, []);
}

export function agencyPhones(agency) {
  return normalizePhones([
    ...(Array.isArray(agency.phone_numbers) ? agency.phone_numbers : []),
    agency.phone,
    agency.mobile_alt,
  ]);
}

function phoneHref(phone) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default function PhonesModal({ agency, onClose, onSave }) {
  const [phones, setPhones] = useState(() => agencyPhones(agency));
  const [saving, setSaving] = useState(false);

  function updatePhone(index, value) {
    setPhones((current) => current.map((phone, phoneIndex) => (phoneIndex === index ? value : phone)));
  }

  function removePhone(index) {
    setPhones((current) => current.filter((_, phoneIndex) => phoneIndex !== index));
  }

  async function save() {
    setSaving(true);
    await onSave(normalizePhones(phones));
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="modal-surface w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div>
            <h2 className="font-semibold text-white">Phones</h2>
            <p className="mt-0.5 truncate text-xs text-neutral-500">{agency.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-neutral-400 hover:text-white">
            Close
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {phones.length === 0 && <p className="text-sm text-neutral-500">No phone numbers yet.</p>}
          {phones.map((phone, index) => (
            <div key={`${phone}-${index}`} className="flex items-center gap-2">
              <a
                href={phoneHref(phone)}
                className="shrink-0 rounded-lg bg-[#f01546] px-2.5 py-2 text-xs font-semibold text-white hover:bg-[#f2426a]"
                title={`Call ${phone}`}
              >
                Call
              </a>
              <input
                type="tel"
                value={phone}
                onChange={(event) => updatePhone(index, event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
              />
              <button
                type="button"
                onClick={() => removePhone(index)}
                className="rounded-lg px-2 py-2 text-sm text-neutral-500 hover:bg-rose-950/50 hover:text-rose-300"
                title="Remove number"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPhones((current) => [...current, ""])}
            className="mt-1 text-sm font-medium text-[#f2426a] hover:text-[#ff6b8a]"
          >
            + Add phone
          </button>
        </div>

        <div className="modal-footer border-t border-neutral-800 px-5 py-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-[#f01546] py-2 text-sm font-medium text-white transition hover:bg-[#f2426a] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save phones"}
          </button>
        </div>
      </div>
    </div>
  );
}
