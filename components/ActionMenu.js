"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ActionMenu({
  label = "More",
  items,
  align = "right",
  iconOnly = false,
  triggerIcon = "more",
}) {
  const [open, setOpen] = useState(false);
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState(null);
  const [rect, setRect] = useState(null);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function close(event) {
      if (rootRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
      setOpenSubmenuIndex(null);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        if (openSubmenuIndex !== null) setOpenSubmenuIndex(null);
        else setOpen(false);
      }
    }

    function reposition() {
      if (rootRef.current) setRect(rootRef.current.getBoundingClientRect());
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, openSubmenuIndex]);

  function toggle() {
    if (!open && rootRef.current) setRect(rootRef.current.getBoundingClientRect());
    setOpen((current) => !current);
    setOpenSubmenuIndex(null);
  }

  return (
    <div ref={rootRef} className="action-menu">
      <button
        type="button"
        onClick={toggle}
        className={iconOnly ? "icon-button" : "control-button"}
        aria-haspopup="menu"
        aria-expanded={open}
        title={iconOnly ? label : undefined}
      >
        {iconOnly ? (
          triggerIcon === "settings" ? (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M8.25 2.7h3.5l.45 1.82c.42.16.82.39 1.18.68l1.77-.54 1.75 3.03-1.34 1.28a6 6 0 0 1 0 1.36l1.34 1.28-1.75 3.03-1.77-.54c-.36.29-.76.52-1.18.68l-.45 1.82h-3.5l-.45-1.82a5.8 5.8 0 0 1-1.18-.68l-1.77.54-1.75-3.03 1.34-1.28a6 6 0 0 1 0-1.36L3.1 7.69l1.75-3.03 1.77.54c.36-.29.76-.52 1.18-.68l.45-1.82Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
              <circle cx="10" cy="9.65" r="2.15" stroke="currentColor" strokeWidth="1.35" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          )
        ) : (
          <>
            <span>{label}</span>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className={`action-menu__panel action-menu__panel--${align}`}
          role="menu"
          style={{
            position: "fixed",
            top: rect.bottom + 150 < window.innerHeight ? rect.bottom + 7 : "auto",
            bottom: rect.bottom + 150 < window.innerHeight ? "auto" : window.innerHeight - rect.top + 7,
            left: align === "left" ? rect.left : "auto",
            right: align === "right" ? Math.max(8, window.innerWidth - rect.right) : "auto",
          }}
        >
          {items.map((item, index) =>
            item.separator ? (
              <div key={`separator-${index}`} className="action-menu__separator" />
            ) : item.content ? (
              <div key={item.key || `content-${index}`} className="action-menu__custom">
                {item.content}
              </div>
            ) : item.submenu ? (
              <div key={item.label || index} className="action-menu__submenu-wrapper">
                <button
                  type="button"
                  role="menuitem"
                  className="action-menu__item"
                  aria-haspopup="menu"
                  aria-expanded={openSubmenuIndex === index}
                  onClick={() => setOpenSubmenuIndex((current) => (current === index ? null : index))}
                >
                  <span>{item.label}</span>
                  <span className="action-menu__submenu-arrow" aria-hidden="true">›</span>
                </button>
                {openSubmenuIndex === index && (
                  <div className="action-menu__submenu" role="menu">
                    {item.submenu.map((subitem, subindex) => (
                      <button
                        key={subitem.label || subindex}
                        type="button"
                        role="menuitem"
                        className="action-menu__item"
                        onClick={() => {
                          setOpen(false);
                          setOpenSubmenuIndex(null);
                          subitem.onClick();
                        }}
                      >
                        <span>{subitem.label}</span>
                        {subitem.hint && <span className="action-menu__hint">{subitem.hint}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.label || index}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`action-menu__item ${item.danger ? "action-menu__item--danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <span className="action-menu__hint">{item.hint}</span>}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
