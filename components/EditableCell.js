"use client";

import { useEffect, useState } from "react";

/**
 * A cell that looks like plain text until clicked, then turns into an
 * input/select. Saves on blur or Enter. Escape cancels the edit.
 */
export default function EditableCell({
  value,
  onSave,
  type = "text",
  options = null,
  placeholder = "",
  className = "",
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== (value ?? "")) {
      onSave(draft === "" ? null : draft);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (type === "select") {
    // options can be plain strings, or {value, label} objects when the
    // saved value (e.g. a status_id) needs to differ from what's displayed.
    const opts = (options || []).map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt
    );
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onSave(e.target.value)}
        className={`w-full bg-transparent border-none focus:ring-1 focus:ring-[#f01546] rounded px-1 py-0.5 text-sm cursor-pointer ${className}`}
      >
        {opts.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-neutral-900 text-neutral-100">
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onSave(e.target.checked)}
        className="w-4 h-4 accent-[#f01546] cursor-pointer"
      />
    );
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className={`min-h-[28px] px-1 py-0.5 text-sm cursor-text rounded hover:bg-neutral-800/60 truncate ${className}`}
        title={value || ""}
      >
        {value || <span className="text-neutral-600">{placeholder}</span>}
      </div>
    );
  }

  return (
    <input
      autoFocus
      type={type}
      value={draft ?? ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
      className={`w-full bg-neutral-800 border border-[#f01546] rounded px-1 py-0.5 text-sm focus:outline-none ${className}`}
    />
  );
}
