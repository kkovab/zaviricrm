"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { getStoredName, setStoredName, colorForName } from "@/lib/presence";

const PresenceContext = createContext(null);

// Any component under <PresenceProvider> can call this to find out who else
// (if anyone) is currently on a given cell, and to announce that it itself
// is now on one. Safe to call even if realtime isn't configured - it just
// always reports "nobody else is here" in that case.
export function usePresence() {
  return useContext(PresenceContext);
}

// How long a live cursor sticks around with no update before we assume that
// person's tab went away/idle and stop drawing it.
const CURSOR_TIMEOUT_MS = 4000;
// Minimum time between broadcasting our own mouse position - keeps this
// smooth-looking without sending on every single pixel of movement.
const CURSOR_THROTTLE_MS = 45;

function CursorIcon({ color }) {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 1.5 L2 18 L6.5 14.2 L9.3 20 L12.2 18.6 L9.4 12.8 L16 12.6 Z"
        fill={color}
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PresenceProvider({ children }) {
  // null = still checking localStorage, "" = checked and there isn't one
  // yet (show the name prompt), anything else = the name to use.
  const [name, setName] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [others, setOthers] = useState({}); // cellId -> [{ name, color }]
  const [cursors, setCursors] = useState({}); // sessionId -> { name, color, xPct, yPct, updatedAt }
  const channelRef = useRef(null);
  const sessionIdRef = useRef(null);
  const activeCellRef = useRef(null);
  const lastCursorSentRef = useRef(0);

  useEffect(() => {
    setName(getStoredName());
  }, []);

  useEffect(() => {
    if (!name) return; // wait until we actually know who we are

    const client = supabaseClient();
    if (!client) return; // realtime env vars aren't set up - skip presence entirely

    if (!sessionIdRef.current) {
      sessionIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
    }
    const color = colorForName(name);
    const channel = client.channel("agency-outreach-presence", {
      config: { presence: { key: sessionIdRef.current } },
    });

    function syncOthers() {
      const state = channel.presenceState();
      const map = {};
      Object.values(state)
        .flat()
        .forEach((entry) => {
          if (entry.sessionId === sessionIdRef.current) return; // that's us
          if (!entry.cellId) return;
          if (!map[entry.cellId]) map[entry.cellId] = [];
          map[entry.cellId].push({ name: entry.name, color: entry.color });
        });
      setOthers(map);
    }

    function onCursorBroadcast({ payload }) {
      if (!payload || payload.sessionId === sessionIdRef.current) return;
      setCursors((prev) => ({
        ...prev,
        [payload.sessionId]: {
          name: payload.name,
          color: payload.color,
          xPct: payload.xPct,
          yPct: payload.yPct,
          updatedAt: Date.now(),
        },
      }));
    }

    function onMouseMove(e) {
      const now = Date.now();
      if (now - lastCursorSentRef.current < CURSOR_THROTTLE_MS) return;
      if (document.hidden) return;
      lastCursorSentRef.current = now;
      channel.send({
        type: "broadcast",
        event: "cursor",
        payload: {
          sessionId: sessionIdRef.current,
          name,
          color,
          xPct: e.clientX / window.innerWidth,
          yPct: e.clientY / window.innerHeight,
        },
      });
    }

    channel.on("presence", { event: "sync" }, syncOthers);
    channel.on("broadcast", { event: "cursor" }, onCursorBroadcast);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          sessionId: sessionIdRef.current,
          name,
          color,
          cellId: activeCellRef.current,
        });
      }
    });

    window.addEventListener("mousemove", onMouseMove);
    const pruneTimer = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const next = {};
        let changed = false;
        Object.entries(prev).forEach(([id, c]) => {
          if (now - c.updatedAt < CURSOR_TIMEOUT_MS) next[id] = c;
          else changed = true;
        });
        return changed ? next : prev;
      });
    }, 1000);

    channelRef.current = channel;
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      clearInterval(pruneTimer);
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [name]);

  function setActiveCell(cellId) {
    activeCellRef.current = cellId;
    const channel = channelRef.current;
    if (!channel || !name) return;
    channel.track({
      sessionId: sessionIdRef.current,
      name,
      color: colorForName(name),
      cellId,
    });
  }

  function othersOnCell(cellId) {
    if (!cellId) return [];
    return others[cellId] || [];
  }

  function saveName(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setStoredName(trimmed);
    setName(trimmed);
  }

  return (
    <PresenceContext.Provider value={{ name, setActiveCell, othersOnCell }}>
      {children}

      {/* Other people's live mouse cursors, drawn on top of everything. */}
      <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
        {Object.entries(cursors).map(([id, c]) => (
          <div
            key={id}
            className="absolute transition-[left,top] duration-75 ease-linear"
            style={{ left: `${c.xPct * 100}%`, top: `${c.yPct * 100}%` }}
          >
            <CursorIcon color={c.color} />
            <span
              className="ml-4 -mt-1 inline-block px-1.5 py-0.5 rounded text-[11px] font-medium text-white whitespace-nowrap shadow"
              style={{ backgroundColor: c.color }}
            >
              {c.name}
            </span>
          </div>
        ))}
      </div>

      {name === "" && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6">
            <h2 className="font-semibold text-white mb-1">What's your name?</h2>
            <p className="text-sm text-neutral-400 mb-4">
              So whoever else has this open can see which field you're on and
              where your mouse is.
            </p>
            <input
              autoFocus
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName(nameDraft);
              }}
              placeholder="Your name..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#f01546] mb-3"
            />
            <button
              onClick={() => saveName(nameDraft)}
              className="w-full bg-[#f01546] hover:bg-[#f2426a] text-white text-sm font-medium py-2 rounded-lg transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </PresenceContext.Provider>
  );
}
