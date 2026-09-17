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

export default function PresenceProvider({ children }) {
  // null = still checking localStorage, "" = checked and there isn't one
  // yet (show the name prompt), anything else = the name to use.
  const [name, setName] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [others, setOthers] = useState({}); // cellId -> [{ name, color }]
  const channelRef = useRef(null);
  const sessionIdRef = useRef(null);
  const activeCellRef = useRef(null);

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

    channel.on("presence", { event: "sync" }, syncOthers);
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

    channelRef.current = channel;
    return () => {
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
      {name === "" && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6">
            <h2 className="font-semibold text-white mb-1">What's your name?</h2>
            <p className="text-sm text-neutral-400 mb-4">
              So whoever else has this open can see which field you're on.
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
