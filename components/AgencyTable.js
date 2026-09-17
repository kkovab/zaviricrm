"use client";

import { useEffect, useMemo, useState } from "react";
import EditableCell from "./EditableCell";
import FollowupDrawer from "./FollowupDrawer";
import AgencyInfoModal from "./AgencyInfoModal";
import {
  STATUS_OPTIONS,
  STATUS_COLORS,
  isFollowupOverdue,
  compareByPriority,
  formatDate,
} from "@/lib/constants";

export default function AgencyTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [drawerAgency, setDrawerAgency] = useState(null);
  const [infoAgency, setInfoAgency] = useState(null);
  const [addingName, setAddingName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/agencies");
    const json = await res.json();
    setRows(json.data || []);
    setLoading(false);
  }

  async function patch(id, field, value) {
    // Optimistic update so the grid feels instant.
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const res = await fetch(`/api/agencies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      // Roll back by refetching if the save failed.
      load();
    } else if (
      field === "active_listings" ||
      field === "trial_start_date" ||
      field === "discount_percent"
    ) {
      // These affect computed columns (price tier, trial end date) - refresh
      // that row's derived values from the server.
      load();
    }
  }

  async function addAgency(e) {
    e.preventDefault();
    if (!addingName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/agencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addingName.trim() }),
    });
    setAdding(false);
    if (res.ok) {
      setAddingName("");
      load();
    }
  }

  async function removeAgency(id) {
    if (!confirm("Delete this agency and all its logged follow-ups? This can't be undone.")) {
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/agencies/${id}`, { method: "DELETE" });
  }

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (onlyDue && !isFollowupOverdue(r)) return false;
        return true;
      })
      .sort(compareByPriority);
  }, [rows, search, onlyDue]);

  const dueCount = useMemo(() => rows.filter(isFollowupOverdue).length, [rows]);

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="border-b border-neutral-800 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 justify-between sticky top-0 bg-neutral-950 z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.webp" alt="Logo" className="h-8 w-8 rounded shrink-0" />
          <div>
            <h1 className="text-lg font-semibold text-white">Agency Outreach</h1>
            <p className="text-xs text-neutral-500">
              {rows.length} agencies · {dueCount} follow-up{dueCount === 1 ? "" : "s"} due
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          />
          <button
            onClick={() => setOnlyDue((v) => !v)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition ${
              onlyDue
                ? "bg-rose-700/80 border-rose-600 text-white"
                : "bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            Due follow-ups only
          </button>
          <form onSubmit={addAgency} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="New agency name..."
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[#f01546] w-44"
            />
            <button
              type="submit"
              disabled={adding}
              className="bg-[#f01546] hover:bg-[#f2426a] disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
            >
              + Add
            </button>
          </form>
        </div>
      </header>

      <div className="thin-scroll overflow-x-auto">
        {loading ? (
          <p className="text-neutral-500 text-sm p-6">Loading...</p>
        ) : (
          <table className="min-w-[1750px] w-full border-collapse">
            <thead>
              <tr className="text-left text-xs text-neutral-400 border-b border-neutral-800">
                <Th
                  className="sticky left-0 bg-neutral-950 z-10 min-w-[190px]"
                  title="Sorted by priority: overdue follow-ups first, then active conversations (Onboarded - Trial, Considering, Attempted - No Answer), then Not Contacted, then closed deals (Converted, Declined, Churned) at the bottom."
                >
                  Agency
                </Th>
                <Th className="min-w-[150px]">Status</Th>
                <Th className="min-w-[110px]">Suggested €/listing</Th>
                <Th className="min-w-[120px]">Est. monthly €</Th>
                <Th className="min-w-[130px]">First contacted</Th>
                <Th className="min-w-[130px]">Trial start</Th>
                <Th className="min-w-[130px]">Trial end</Th>
                <Th className="min-w-[90px]">Days left</Th>
                <Th className="min-w-[200px]">Discount offered</Th>
                <Th
                  className="min-w-[90px]"
                  title="Permanent % off the bulk price for this agency, e.g. 30 for a 30% discount. Applies automatically to Suggested €/listing and Est. monthly € above."
                >
                  Discount %
                </Th>
                <Th className="min-w-[130px]">Last follow-up</Th>
                <Th className="min-w-[70px]">#</Th>
                <Th className="min-w-[140px]">Next follow-up</Th>
                <Th className="min-w-[220px]">What they know</Th>
                <Th className="min-w-[220px]">Still need / objections</Th>
                <Th className="min-w-[200px]">Notes</Th>
                <Th className="min-w-[100px]"></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const overdue = isFollowupOverdue(r);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-neutral-900 hover:bg-neutral-900/40"
                  >
                    <Td className="sticky left-0 bg-neutral-950 hover:bg-neutral-900/40 font-medium">
                      <button
                        onClick={() => setInfoAgency(r)}
                        className="text-left text-white hover:text-neutral-300 hover:underline truncate block w-full px-1 py-0.5"
                        title="Click to view/edit contact info"
                      >
                        {r.name}
                      </button>
                    </Td>
                    <Td>
                      <span
                        className={`inline-block w-full rounded ${STATUS_COLORS[r.status] || ""}`}
                      >
                        <EditableCell
                          type="select"
                          options={STATUS_OPTIONS}
                          value={r.status}
                          onSave={(v) => patch(r.id, "status", v)}
                        />
                      </span>
                    </Td>
                    <Computed>€{r.suggested_price_per_listing}</Computed>
                    <Computed>€{r.est_monthly_value}</Computed>
                    <Td>
                      <EditableCell
                        type="date"
                        value={r.date_first_contacted}
                        onSave={(v) => patch(r.id, "date_first_contacted", v)}
                      />
                    </Td>
                    <Td>
                      <EditableCell
                        type="date"
                        value={r.trial_start_date}
                        onSave={(v) => patch(r.id, "trial_start_date", v)}
                      />
                    </Td>
                    <Computed>{formatDate(r.trial_end_date)}</Computed>
                    <Computed
                      className={
                        r.days_left_in_trial != null && r.days_left_in_trial < 0
                          ? "text-rose-400"
                          : ""
                      }
                    >
                      {r.days_left_in_trial ?? ""}
                    </Computed>
                    <Td>
                      <EditableCell
                        value={r.discount_offered}
                        onSave={(v) => patch(r.id, "discount_offered", v)}
                      />
                    </Td>
                    <Td>
                      <EditableCell
                        type="number"
                        value={r.discount_percent}
                        placeholder="0"
                        onSave={(v) => patch(r.id, "discount_percent", v === null ? 0 : Number(v))}
                      />
                    </Td>
                    <Computed>{formatDate(r.last_followup_date)}</Computed>
                    <Computed>{r.followup_count}</Computed>
                    <Computed className={overdue ? "bg-rose-900/50 text-rose-200 font-medium rounded px-1" : ""}>
                      {formatDate(r.next_followup_suggested)}
                    </Computed>
                    <Td>
                      <EditableCell
                        value={r.what_they_know}
                        onSave={(v) => patch(r.id, "what_they_know", v)}
                      />
                    </Td>
                    <Td>
                      <EditableCell
                        value={r.what_they_still_need}
                        onSave={(v) => patch(r.id, "what_they_still_need", v)}
                      />
                    </Td>
                    <Td>
                      <EditableCell value={r.notes} onSave={(v) => patch(r.id, "notes", v)} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDrawerAgency(r)}
                          className="text-xs text-[#f01546] hover:text-[#f2426a]"
                        >
                          Follow-ups
                        </button>
                        <button
                          onClick={() => removeAgency(r.id)}
                          className="text-xs text-neutral-600 hover:text-rose-400"
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={17} className="text-center text-neutral-600 text-sm py-10">
                    No agencies match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {drawerAgency && (
        <FollowupDrawer
          agency={drawerAgency}
          onClose={() => setDrawerAgency(null)}
          onLogged={load}
        />
      )}

      {infoAgency && (
        <AgencyInfoModal
          agency={infoAgency}
          onClose={() => setInfoAgency(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function Th({ children, className = "" }) {
  return <th className={`px-2 py-2 font-medium whitespace-nowrap ${className}`}>{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-2 py-1 align-top ${className}`}>{children}</td>;
}

function Computed({ children, className = "" }) {
  return (
    <td className={`px-2 py-1 align-top text-sm text-neutral-400 ${className}`}>
      <div className="min-h-[28px] px-1 py-0.5">{children}</div>
    </td>
  );
}
