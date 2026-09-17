"use client";

import { useEffect, useMemo, useState } from "react";
import EditableCell from "./EditableCell";
import FollowupDrawer from "./FollowupDrawer";
import AgencyInfoModal from "./AgencyInfoModal";
import StatusManagerModal from "./StatusManagerModal";
import PresenceProvider from "./PresenceProvider";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  isFollowupOverdue,
  compareByPriority,
  formatDate,
} from "@/lib/constants";

// Which row field each column header sorts by when clicked. Columns left out
// (the sticky Agency name gets special handling below, and the trailing
// actions column) aren't sortable.
const SORT_FIELDS = {
  activeListings: "active_listings",
  status: "status_sort_order",
  phone: "phone",
  suggested: "suggested_price_per_listing",
  monthly: "est_monthly_value",
  firstContacted: "date_first_contacted",
  trialStart: "trial_start_date",
  trialEnd: "trial_end_date",
  daysLeft: "days_left_in_trial",
  discountPercent: "discount_percent",
  lastFollowup: "last_followup_date",
  followupCount: "followup_count",
  nextFollowup: "next_followup_date",
  notes: "notes",
};

export default function AgencyTable() {
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [drawerAgency, setDrawerAgency] = useState(null);
  const [infoAgency, setInfoAgency] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [addingName, setAddingName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    load();
    loadStatuses();
  }, []);

  // Live sync with whoever else has this open. Supabase notifies us the
  // instant a row changes in the database (their save, not just ours), and
  // we quietly refetch - no page reload, no "Loading..." flash. If the
  // NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY env vars
  // aren't set, supabaseClient() returns null and this just does nothing;
  // the app still works fine without it, you'd just need to refresh
  // manually to see someone else's changes.
  useEffect(() => {
    const client = supabaseClient();
    if (!client) return;

    let reloadTimer = null;
    let statusTimer = null;

    const channel = client
      .channel("agency-outreach-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agencies" },
        () => {
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => load({ silent: true }), 400);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "statuses" },
        () => {
          clearTimeout(statusTimer);
          statusTimer = setTimeout(loadStatuses, 400);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(reloadTimer);
      clearTimeout(statusTimer);
      client.removeChannel(channel);
    };
  }, []);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const res = await fetch("/api/agencies");
    const json = await res.json();
    setRows(json.data || []);
    if (!silent) setLoading(false);
  }

  async function loadStatuses() {
    const res = await fetch("/api/statuses");
    const json = await res.json();
    setStatuses(json.data || []);
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
      field === "discount_percent" ||
      field === "status_id"
    ) {
      // These affect computed columns (price tier, trial end date, status
      // color/closed-flag/sort order) - refresh derived values from the server.
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

  function handleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const result = rows.filter((r) => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (onlyDue && !isFollowupOverdue(r)) return false;
      if (statusFilter && r.status_id !== statusFilter) return false;
      return true;
    });

    if (!sortField) {
      return result.sort(compareByPriority);
    }

    return result.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      let cmp;
      if (valA == null && valB == null) cmp = 0;
      else if (valA == null) cmp = 1;
      else if (valB == null) cmp = -1;
      else if (typeof valA === "number" && typeof valB === "number") cmp = valA - valB;
      else {
        const dateA = Date.parse(valA);
        const dateB = Date.parse(valB);
        if (!Number.isNaN(dateA) && !Number.isNaN(dateB) && /^\d{4}-\d{2}-\d{2}/.test(String(valA))) {
          cmp = dateA - dateB;
        } else {
          cmp = String(valA).localeCompare(String(valB));
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, onlyDue, statusFilter, sortField, sortDir]);

  const dueCount = useMemo(() => rows.filter(isFollowupOverdue).length, [rows]);

  const statusOptions = useMemo(
    () => statuses.map((s) => ({ value: s.id, label: s.name, color: s.color })),
    [statuses]
  );

  return (
    <PresenceProvider>
    <div className="h-screen flex flex-col bg-neutral-950">
      <header className="border-b border-neutral-800 px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 justify-between shrink-0 bg-neutral-950 z-10">
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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
          {sortField && (
            <button
              onClick={() => setSortField(null)}
              className="text-xs text-neutral-500 hover:text-white underline"
            >
              Reset to priority order
            </button>
          )}
          <button
            onClick={() => setStatusModalOpen(true)}
            className="text-sm px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:border-neutral-600"
          >
            Manage Statuses
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

      <div className="thin-scroll flex-1 overflow-auto">
        {loading ? (
          <p className="text-neutral-500 text-sm p-6">Loading...</p>
        ) : (
          <table className="min-w-[1750px] w-full border-collapse">
            <thead>
              <tr className="text-left text-xs text-neutral-400 border-b border-neutral-800">
                <th
                  className="sticky top-0 left-0 bg-neutral-950 z-30 w-16 min-w-[64px] max-w-[64px] px-2 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:text-white text-center"
                  onClick={() => handleSort(SORT_FIELDS.activeListings)}
                  title="Number of active listings. Click to sort."
                >
                  Active{sortIndicator(SORT_FIELDS.activeListings, sortField, sortDir)}
                </th>
                <th
                  className="sticky top-0 left-16 bg-neutral-950 z-30 min-w-[190px] px-2 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:text-white border-r border-neutral-600"
                  onClick={() => handleSort("name")}
                  title="Click to sort alphabetically. Default order: overdue follow-ups first, then active conversations, then Not Contacted, then closed deals at the bottom."
                >
                  Agency{sortIndicator("name", sortField, sortDir)}
                </th>
                <SortTh label="Status" field={SORT_FIELDS.status} {...{ sortField, sortDir, handleSort }} className="min-w-[150px]" />
                <SortTh label="Phone" field={SORT_FIELDS.phone} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh label="Suggested €/listing" field={SORT_FIELDS.suggested} {...{ sortField, sortDir, handleSort }} className="min-w-[110px]" />
                <SortTh label="Est. monthly €" field={SORT_FIELDS.monthly} {...{ sortField, sortDir, handleSort }} className="min-w-[120px]" />
                <SortTh label="First contacted" field={SORT_FIELDS.firstContacted} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh label="Trial start" field={SORT_FIELDS.trialStart} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh label="Trial end" field={SORT_FIELDS.trialEnd} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh label="Days left" field={SORT_FIELDS.daysLeft} {...{ sortField, sortDir, handleSort }} className="min-w-[90px]" />
                <SortTh
                  label="Discount %"
                  field={SORT_FIELDS.discountPercent}
                  sortField={sortField}
                  sortDir={sortDir}
                  handleSort={handleSort}
                  className="min-w-[90px]"
                  title="Permanent % off the bulk price for this agency, e.g. 30 for a 30% discount. Applies automatically to Suggested €/listing and Est. monthly € above."
                />
                <SortTh label="Last follow-up" field={SORT_FIELDS.lastFollowup} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh label="#" field={SORT_FIELDS.followupCount} {...{ sortField, sortDir, handleSort }} className="min-w-[70px]" />
                <SortTh
                  label="Next follow-up"
                  field={SORT_FIELDS.nextFollowup}
                  sortField={sortField}
                  sortDir={sortDir}
                  handleSort={handleSort}
                  className="min-w-[140px]"
                  title="Set this yourself - it's no longer calculated automatically."
                />
                <SortTh label="Notes" field={SORT_FIELDS.notes} {...{ sortField, sortDir, handleSort }} className="min-w-[260px]" />
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
                    <Td className="sticky left-0 z-20 bg-neutral-950 w-16 min-w-[64px] max-w-[64px] text-center">
                      <EditableCell
                        type="number"
                        value={r.active_listings}
                        onSave={(v) => patch(r.id, "active_listings", v === null ? 0 : Number(v))}
                        className="text-center"
                        cellId={`${r.id}:active_listings`}
                      />
                    </Td>
                    <Td className="sticky left-16 z-20 bg-neutral-950 font-medium shadow-[inset_-1px_0_0_0_#525252]">
                      <button
                        onClick={() => setInfoAgency(r)}
                        className="text-left text-white hover:text-neutral-300 hover:underline truncate block w-full px-1 py-0.5"
                        title="Click to view/edit contact info"
                      >
                        {r.name}
                      </button>
                    </Td>
                    <Td>
                      <EditableCell
                        type="select"
                        options={statusOptions}
                        value={r.status_id}
                        onSave={(v) => patch(r.id, "status_id", v)}
                        cellId={`${r.id}:status_id`}
                      />
                    </Td>
                    <Td>
                      <EditableCell
                        value={r.phone}
                        placeholder="Phone"
                        onSave={(v) => patch(r.id, "phone", v)}
                        cellId={`${r.id}:phone`}
                      />
                    </Td>
                    <Computed>€{r.suggested_price_per_listing}</Computed>
                    <Computed>€{r.est_monthly_value}</Computed>
                    <Td>
                      <EditableCell
                        type="date"
                        value={r.date_first_contacted}
                        onSave={(v) => patch(r.id, "date_first_contacted", v)}
                        cellId={`${r.id}:date_first_contacted`}
                      />
                    </Td>
                    <Td>
                      <EditableCell
                        type="date"
                        value={r.trial_start_date}
                        onSave={(v) => patch(r.id, "trial_start_date", v)}
                        cellId={`${r.id}:trial_start_date`}
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
                        type="number"
                        value={r.discount_percent}
                        placeholder="0"
                        onSave={(v) => patch(r.id, "discount_percent", v === null ? 0 : Number(v))}
                        cellId={`${r.id}:discount_percent`}
                      />
                    </Td>
                    <Computed>{formatDate(r.last_followup_date)}</Computed>
                    <Computed>{r.followup_count}</Computed>
                    <Td className={overdue ? "bg-rose-900/50 rounded" : ""}>
                      <EditableCell
                        type="date"
                        value={r.next_followup_date}
                        onSave={(v) => patch(r.id, "next_followup_date", v)}
                        className={overdue ? "text-rose-200 font-medium" : ""}
                        cellId={`${r.id}:next_followup_date`}
                      />
                    </Td>
                    <Td>
                      <EditableCell
                        value={r.notes}
                        onSave={(v) => patch(r.id, "notes", v)}
                        clampable
                        className="w-[260px]"
                        cellId={`${r.id}:notes`}
                      />
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
                  <td colSpan={15} className="text-center text-neutral-600 text-sm py-10">
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

      {statusModalOpen && (
        <StatusManagerModal
          statuses={statuses}
          onClose={() => setStatusModalOpen(false)}
          onChanged={async () => {
            await loadStatuses();
            await load();
          }}
        />
      )}
    </div>
    </PresenceProvider>
  );
}

function sortIndicator(field, sortField, sortDir) {
  if (sortField !== field) return "";
  return sortDir === "asc" ? " ▲" : " ▼";
}

function SortTh({ label, field, sortField, sortDir, handleSort, className = "", title }) {
  return (
    <th
      className={`sticky top-0 z-20 bg-neutral-950 px-2 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:text-white ${className}`}
      onClick={() => handleSort(field)}
      title={title || `Click to sort by ${label}`}
    >
      {label}
      {sortIndicator(field, sortField, sortDir)}
    </th>
  );
}

function Th({ children, className = "" }) {
  return (
    <th className={`sticky top-0 z-20 bg-neutral-950 px-2 py-2 font-medium whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
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
