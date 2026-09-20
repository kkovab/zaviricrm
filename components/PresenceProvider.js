"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
// person's tab went away/idle and stop drawing it. This is only a fallback
// for an ungraceful disconnect (network loss, browser crash) - a normal tab
// close/navigation is caught instantly by the presence "leave" event below.
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
  // Portals do not exist in the server-rendered tree. Keep the first client
  // render identical to SSR, then enable browser-only UI after hydration.
  const [mounted, setMounted] = useState(false);
  // null = still checking localStorage, "" = checked and there isn't one
  // yet (show the name prompt), anything else = the name to use.
  const [name, setName] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [others, setOthers] = useState({}); // cellId -> [{ name, color }]
  const [peopleBySession, setPeopleBySession] = useState({}); // sessionId -> { name, color, cellId, afk }
  const [cursors, setCursors] = useState({}); // sessionId -> { name, color, xPct, yPct, updatedAt }
  const channelRef = useRef(null);
  const sessionIdRef = useRef(null);
  const activeCellRef = useRef(null);
  const afkRef = useRef(false);
  const lastCursorSentRef = useRef(0);

  useEffect(() => {
    setName(getStoredName());
    setMounted(true);
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
      const cellMap = {};
      const peopleMap = {};
      Object.values(state)
        .flat()
        .forEach((entry) => {
          if (entry.sessionId === sessionIdRef.current) return; // that's us
          peopleMap[entry.sessionId] = {
            name: entry.name,
            color: entry.color,
            cellId: entry.cellId,
            afk: !!entry.afk,
          };
          if (!entry.cellId) return;
          if (!cellMap[entry.cellId]) cellMap[entry.cellId] = [];
          cellMap[entry.cellId].push({ name: entry.name, color: entry.color });
        });
      setOthers(cellMap);
      setPeopleBySession(peopleMap);
    }

    function onPresenceLeave({ key }) {
      // Someone closed their tab / navigated away - drop their live cursor
      // right away instead of waiting for the stale-cursor prune timer.
      setCursors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
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

    function onVisibilityChange() {
      afkRef.current = document.hidden;
      const ch = channelRef.current;
      if (!ch) return;
      ch.track({
        sessionId: sessionIdRef.current,
        name,
        color,
        cellId: activeCellRef.current,
        afk: afkRef.current,
      });
    }

    channel.on("presence", { event: "sync" }, syncOthers);
    channel.on("presence", { event: "leave" }, onPresenceLeave);
    channel.on("broadcast", { event: "cursor" }, onCursorBroadcast);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        afkRef.current = document.hidden;
        await channel.track({
          sessionId: sessionIdRef.current,
          name,
          color,
          cellId: activeCellRef.current,
          afk: afkRef.current,
        });
      }
    });

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("visibilitychange", onVisibilityChange);
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(pruneTimer);
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [name]);

  const setActiveCell = useCallback((cellId) => {
    activeCellRef.current = cellId;
    const channel = channelRef.current;
    if (!channel || !name) return;
    channel.track({
      sessionId: sessionIdRef.current,
      name,
      color: colorForName(name),
      cellId,
      afk: afkRef.current,
    });
  }, [name]);

  const othersOnCell = useCallback((cellId) => {
    if (!cellId) return [];
    return others[cellId] || [];
  }, [others]);

  // Cursor broadcasts arrive many times per second. Keep the context object
  // stable while only cursor positions change so every editable cell in the
  // large agency table does not re-render for somebody else's mouse movement.
  const presenceValue = useMemo(
    () => ({ name, setActiveCell, othersOnCell }),
    [name, setActiveCell, othersOnCell]
  );

  function saveName(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setStoredName(trimmed);
    setName(trimmed);
  }

  // Other people's live mouse cursors. Portaled directly onto <body> (rather
  // than rendered inline in the component tree) so their `fixed` positioning
  // is guaranteed to be relative to the real browser viewport - never to
  // some scrolled/positioned ancestor further up the page - which is what
  // made them appear to "scroll along" with the local page before. Also
  // drawn on top of everything else.
  const cursorLayer = (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {Object.entries(cursors).map(([id, c]) => {
        const afk = !!peopleBySession[id]?.afk;
        return (
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
              {afk ? " (AFK)" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <PresenceContext.Provider value={presenceValue}>
      {children}

      {mounted && createPortal(cursorLayer, document.body)}

      {mounted && name === "" && (
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
