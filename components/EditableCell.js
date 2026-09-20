"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { contrastTextColor } from "@/lib/constants";

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
  // When true, a value that doesn't actually fit on one line is clipped
  // with "..." instead of running the row height/width out. Clicking it
  // expands to the full text (still read-only); clicking again from there
  // opens the normal edit input, same as every other cell. Whether it's
  // clipped is measured from the real rendered width, not a character
  // count, so a short line of wide characters and a long line of narrow
  // ones are both judged correctly.
  clampable = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (!clampable || expanded) return;
    function measure() {
      const el = textRef.current;
      if (el) setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, expanded, clampable]);

  function startEditing() {
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    setExpanded(false);
    if (draft !== (value ?? "")) {
      onSave(draft === "" ? null : draft);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
    setExpanded(false);
  }

  if (type === "select") {
    // options can be plain strings, or {value, label} objects when the
    // saved value (e.g. a status_id) needs to differ from what's displayed.
    const opts = (options || []).map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt
    );

    // When options carry a color (e.g. custom statuses), a native <select>
    // won't do - most browsers render the OS's own dropdown popup for
    // <option> elements and ignore inline background-color/color styling
    // there, even though it works fine on the closed control. So for
    // colored options we render our own dropdown instead, which we fully
    // control and can guarantee shows color.
    if (opts.some((opt) => opt.color)) {
      return <ColorDropdown options={opts} value={value} onChange={onSave} />;
    }

    return (
      <div>
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
      </div>
    );
  }

  if (type === "checkbox") {
    return (
      <div className="inline-block">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onSave(e.target.checked)}
          className="w-4 h-4 accent-[#f01546] cursor-pointer"
        />
      </div>
    );
  }

  if (!editing) {
    const str = value || "";
    const showWrapped = clampable && expanded;

    return (
      <div>
        <div
          ref={clampable ? textRef : undefined}
          onClick={() => {
            if (clampable && !expanded && isOverflowing) {
              setExpanded(true);
            } else {
              startEditing();
            }
          }}
          className={`min-h-[28px] px-1 py-0.5 text-sm cursor-pointer rounded hover:bg-neutral-800/60 ${
            showWrapped ? "whitespace-pre-wrap break-words" : "truncate"
          } ${className}`}
          title={clampable && !expanded && isOverflowing ? "Click to expand" : str}
        >
          {str || <span className="text-neutral-600">{placeholder}</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
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
    </div>
  );
}

/**
 * A dropdown for options that carry a color (custom statuses), rendered
 * entirely with our own markup instead of a native <select>/<option> so the
 * colors are guaranteed to show up in the open list, not just the closed
 * control. The floating list is rendered into document.body via a portal so
 * it always draws on top of the table instead of getting clipped by the
 * table's horizontal-scroll container.
 */
function ColorDropdown({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [hoverValue, setHoverValue] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const selected = options.find((o) => o.value === value) || null;
  const fallbackColor = "#52525b";

  function toggle() {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;

    function reposition() {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    function onDocMouseDown(e) {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        className="w-full flex items-center justify-between gap-1 rounded px-1.5 py-1 text-sm cursor-pointer truncate"
        style={{
          backgroundColor: selected?.color || fallbackColor,
          color: contrastTextColor(selected?.color || fallbackColor),
        }}
      >
        <span className="truncate">{selected?.label || "-"}</span>
        <span className="opacity-70 text-[9px] shrink-0">▾</span>
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[1000] flex flex-col gap-1.5 p-1.5 rounded-xl shadow-2xl ring-1 ring-black/40 bg-neutral-900"
            style={{ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 170) }}
          >
            {options.map((opt) => {
              const bg = opt.color || fallbackColor;
              const isHover = hoverValue === opt.value;
              return (
                <div
                  key={opt.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHoverValue(opt.value)}
                  onMouseLeave={() => setHoverValue(null)}
                  className="px-3 py-2 text-sm rounded-lg cursor-pointer transition"
                  style={{
                    backgroundColor: bg,
                    color: contrastTextColor(bg),
                    filter: isHover ? "brightness(1.15)" : "none",
                  }}
                >
                  {opt.label}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
