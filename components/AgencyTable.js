"use client";

import { forwardRef, startTransition, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import EditableCell from "./EditableCell";
import FollowupDrawer from "./FollowupDrawer";
import AgencyInfoModal from "./AgencyInfoModal";
import StatusManagerModal from "./StatusManagerModal";
import TicketsBoard from "./TicketsBoard";
import PhonesModal, { agencyPhones } from "./PhonesModal";
import AgencyNotesModal from "./AgencyNotesModal";
import WorkspaceHeader from "./WorkspaceHeader";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  isFollowupOverdue,
  isFollowupWithinNextDays,
  compareByPriority,
  formatDate,
  formatEuro,
  followupRelativeLabel,
  withAgencyCalculations,
} from "@/lib/constants";

// Which row field each column header sorts by when clicked. Columns left out
// (the sticky Agency name gets special handling below, and the trailing
// actions column) aren't sortable.
const SORT_FIELDS = {
  activeListings: "active_listings",
  status: "status_sort_order",
  phone: "phone",
  package: "est_monthly_value",
  pricePerListing: "price_per_listing",
  trialStart: "trial_start_date",
  trialEnd: "trial_end_date",
  nextFollowup: "next_followup_date",
  notes: "notes",
};

const ROWS_PER_BATCH = 50;
const SUGGESTED_PRICING_COOKIE = "zaviri_show_suggested_pricing";

function readCookie(name) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : null;
}

export default function AgencyTable() {
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_BATCH);
  const [showSuggestedPricing, setShowSuggestedPricing] = useState(true);
  const [infoAgency, setInfoAgency] = useState(null);
  const [phonesAgency, setPhonesAgency] = useState(null);
  const [notesAgency, setNotesAgency] = useState(null);
  const [ticketsView, setTicketsView] = useState(false);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const followupDrawerHostRef = useRef(null);
  const addAgencyHostRef = useRef(null);
  const statusManagerHostRef = useRef(null);
  const tableFrameRef = useRef(null);
  const loadMoreRef = useRef(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    load();
    loadStatuses();
    loadTicketsCount();
  }, []);

  useEffect(() => {
    const savedPreference = readCookie(SUGGESTED_PRICING_COOKIE);
    if (savedPreference !== null) setShowSuggestedPricing(savedPreference === "1");
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agency_notes" },
        () => {
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => load({ silent: true }), 400);
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
    if (!silent) {
      setLoading(true);
      setLoadError("");
    }
    try {
      const res = await fetch("/api/agencies");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load agencies.");
      setRows((json.data || []).map(withAgencyCalculations));
    } catch (error) {
      setLoadError(error.message || "Couldn't load agencies.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadStatuses() {
    try {
      const res = await fetch("/api/statuses");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load statuses.");
      setStatuses(json.data || []);
    } catch (error) {
      setLoadError((current) => current || error.message || "Couldn't load statuses.");
    }
  }

  async function loadTicketsCount() {
    try {
      const res = await fetch("/api/tickets");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load tickets.");
      setOpenTicketsCount((json.data || []).filter((t) => !t.done).length);
    } catch (error) {
      setLoadError((current) => current || error.message || "Couldn't load tickets.");
    }
  }

  // Multi-field version - used by the follow-up drawer to set the date and
  // note together in one request. patch() below is the single-field case
  // everything else in the grid uses.
  const patchFields = useCallback(async (id, fields) => {
    // Optimistic update so the grid feels instant.
    setRows((prev) => prev.map((r) => (r.id === id ? withAgencyCalculations({ ...r, ...fields }) : r)));
    const res = await fetch(`/api/agencies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const affectsComputed = ["status_id"];
    if (!res.ok) {
      // Roll back by refetching if the save failed.
      load();
    } else if (Object.keys(fields).some((f) => affectsComputed.includes(f))) {
      // These affect computed columns (price tier, trial end date, status
      // color/closed-flag/sort order) - refresh derived values from the server.
      load();
    }
  }, []);

  const patch = useCallback((id, field, value) => {
    return patchFields(id, { [field]: value });
  }, [patchFields]);

  const removeAgency = useCallback(async (id) => {
    if (!confirm("Delete this agency and all its logged follow-ups? This can't be undone.")) {
      return false;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    const response = await fetch(`/api/agencies/${id}`, { method: "DELETE" });
    if (!response.ok) {
      load();
      return false;
    }
    return true;
  }, []);

  const openFollowups = useCallback((agency, initialMode = "log") => {
    followupDrawerHostRef.current?.open(agency, initialMode);
  }, []);

  async function savePhones(agencyId, phoneNumbers) {
    await patchFields(agencyId, {
      phone_numbers: phoneNumbers,
      phone: phoneNumbers[0] || null,
      mobile_alt: phoneNumbers[1] || null,
    });
    setPhonesAgency(null);
  }

  function toggleSuggestedPricing() {
    const nextValue = !showSuggestedPricing;
    setShowSuggestedPricing(nextValue);
    document.cookie = `${SUGGESTED_PRICING_COOKIE}=${nextValue ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;

    if (!nextValue && [SORT_FIELDS.package, SORT_FIELDS.pricePerListing].includes(sortField)) {
      setSortField(null);
      setSortDir("asc");
      setVisibleCount(ROWS_PER_BATCH);
    }
  }

  function handleSort(field) {
    setVisibleCount(ROWS_PER_BATCH);
    startTransition(() => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    });
  }

  // Keep matching separate from table sorting. The Follow Up queue must not
  // gain or lose rows when a user changes a regular table sort.
  const matchingRows = useMemo(() => {
    return rows.filter((r) => {
      if (deferredSearch && !r.name.toLowerCase().includes(deferredSearch.toLowerCase())) return false;
      if (statusFilter && r.status_id !== statusFilter) return false;
      return true;
    });
  }, [rows, deferredSearch, statusFilter]);

  const filtered = useMemo(() => {
    const result = [...matchingRows];

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
  }, [matchingRows, sortField, sortDir]);

  // Overdue agencies and agencies scheduled within the next 30 days are
  // pulled into their own "Follow Up" section at the top of the table. By
  // section is always ordered by soonest next follow-up date first. It is
  // intentionally independent from the sort selected for the regular table.
  const followUpRows = useMemo(() => {
    const upcomingRows = matchingRows.filter(isFollowupWithinNextDays);
    return [...upcomingRows].sort((a, b) => {
      const dueA = a.next_followup_date;
      const dueB = b.next_followup_date;
      if (dueA && dueB) return new Date(dueA) - new Date(dueB);
      if (dueA && !dueB) return -1;
      if (!dueA && dueB) return 1;
      return 0;
    });
  }, [matchingRows]);
  const otherRows = useMemo(() => filtered.filter((r) => !isFollowupWithinNextDays(r)), [filtered]);
  // Keep the priority queue fully visible, while rendering the rest in
  // small batches. This avoids hundreds of editable DOM cells updating on
  // every sort, filter, or realtime refresh.
  const visibleRows = useMemo(() => otherRows.slice(0, visibleCount), [otherRows, visibleCount]);
  const hasMoreRows = visibleRows.length < otherRows.length;

  useEffect(() => {
    if (!hasMoreRows || !loadMoreRef.current || !tableFrameRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((current) => Math.min(current + ROWS_PER_BATCH, otherRows.length));
        }
      },
      { root: tableFrameRef.current, rootMargin: "320px 0px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMoreRows, otherRows.length]);

  const statusOptions = useMemo(
    () => statuses.map((s) => ({ value: s.id, label: s.name, color: s.color })),
    [statuses]
  );

  // Renders one agency's <tr>. Pulled out so both the "Follow Up" section
  // and the regular rows below it can share the exact same row markup.
  function renderRow(r, rowClassName = "") {
    const overdue = isFollowupOverdue(r);
    const followupBadge = followupRelativeLabel(r.next_followup_date);
    return (
      <tr key={r.id} className={`agency-grid__row border-b border-neutral-900 ${rowClassName}`}>
        <Td className="sticky left-0 z-20 bg-neutral-950 w-16 min-w-[64px] max-w-[64px] text-center">
          <EditableCell
            type="number"
            value={r.active_listings}
            onSave={(v) => patch(r.id, "active_listings", v === null ? 0 : Number(v))}
            className="text-center"
          />
        </Td>
        <Td className="sticky left-16 z-20 bg-neutral-950 font-medium shadow-[inset_-1px_0_0_0_#525252]">
          <button
            onClick={() => setInfoAgency(r)}
            className="block w-full truncate px-1 py-0.5 text-left text-white hover:text-neutral-300 hover:underline"
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
          />
        </Td>
        <Td>
          <PhoneCell agency={r} onClick={() => setPhonesAgency(r)} />
        </Td>
        {showSuggestedPricing && (
          <>
            <Computed>
              {r.price_per_listing != null ? (
                <div className="leading-tight">
                  <div>€{formatEuro(r.est_monthly_value)} / mo</div>
                  <div className="text-xs text-neutral-500">{r.active_listings.toLocaleString("sr-RS")} active listings</div>
                </div>
              ) : "—"}
            </Computed>
            <Computed>{r.price_per_listing == null ? "—" : `€${formatEuro(r.price_per_listing)}`}</Computed>
          </>
        )}
        <Td>
          <EditableCell
            type="date"
            value={r.trial_start_date}
            onSave={(v) => patch(r.id, "trial_start_date", v)}
          />
        </Td>
        <Computed>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span>{formatDate(r.trial_end_date) || "—"}</span>
            <TrialEndBadge daysLeft={r.days_left_in_trial} />
          </div>
        </Computed>
        <Td className={overdue ? "bg-rose-900/50 rounded" : ""}>
          <button
            type="button"
            onClick={() => openFollowups(r, "schedule")}
            className={`flex min-h-[28px] w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm hover:bg-neutral-800/60 ${
              overdue ? "text-rose-200 font-medium" : "text-neutral-300"
            }`}
            title={r.next_followup_note || "Set via the Follow-ups button's “Set next follow-up” option"}
          >
            <span>{formatDate(r.next_followup_date) || <span className="text-neutral-600">—</span>}</span>
            {followupBadge && <FollowupTimeBadge {...followupBadge} />}
          </button>
        </Td>
        <Td>
          <button
            type="button"
            onClick={() => openFollowups(r, "schedule")}
            className={`flex min-h-[28px] w-full items-center rounded px-1 py-0.5 text-left text-sm hover:bg-neutral-800/60 ${
              r.next_followup_note ? "text-neutral-300" : "text-neutral-600"
            }`}
            title={r.next_followup_note || "Add a reason for this follow-up"}
          >
            <span className="truncate">{r.next_followup_note || (r.next_followup_date ? "Add reason" : "—")}</span>
          </button>
        </Td>
        <Td>
          <NotesCell agency={r} onClick={() => setNotesAgency(r)} />
        </Td>
      </tr>
    );
  }

  return (
    <div className="app-shell h-screen flex flex-col bg-neutral-950">
      <WorkspaceHeader
        activeView={ticketsView ? "tickets" : "agencies"}
        onAgencies={() => setTicketsView(false)}
        onTickets={() => setTicketsView(true)}
        openTicketsCount={openTicketsCount}
        viewItems={[
          {
            label: showSuggestedPricing ? "Hide suggested pricing" : "Show suggested pricing",
            hint: showSuggestedPricing ? "On" : "Off",
            onClick: toggleSuggestedPricing,
          },
        ]}
        settingsItems={[
          { label: "Add agency", hint: "+", onClick: () => addAgencyHostRef.current?.open() },
          { label: "Manage statuses", onClick: () => statusManagerHostRef.current?.open() },
          {
            label: "Reset priority order",
            hint: sortField ? "Active" : "Default",
            onClick: () => {
              setSortField(null);
              setSortDir("asc");
              setVisibleCount(ROWS_PER_BATCH);
            },
          },
        ]}
      />

      <AddAgencyHost ref={addAgencyHostRef} onAdded={load} />

      {ticketsView ? (
        <TicketsBoard agencies={rows} onChanged={loadTicketsCount} onAgencyChanged={load} />
      ) : (
        <>
        <div className="agency-table-tools">
          <div className="toolbar flex-wrap">
          <input
            type="text"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(ROWS_PER_BATCH);
            }}
            className="control-field w-44 sm:w-52"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setVisibleCount(ROWS_PER_BATCH);
            }}
            className="control-field max-w-[160px]"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          </div>
        </div>

      <div ref={tableFrameRef} className="table-frame thin-scroll flex-1 overflow-auto">
        {loading ? (
          <p className="text-neutral-500 text-sm p-6">Loading...</p>
        ) : loadError ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center">
            <div>
              <p className="text-sm font-medium text-rose-400">Couldn't load the workspace</p>
              <p className="mt-1 max-w-md text-xs text-neutral-500">{loadError}</p>
            </div>
            <button
              type="button"
              className="control-button"
              onClick={() => {
                load();
                loadStatuses();
                loadTicketsCount();
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className={`agency-grid ${showSuggestedPricing ? "min-w-[1764px]" : "min-w-[1494px]"}`}>
          <table className="agency-grid__table agency-grid__header">
            <AgencyColGroup showSuggestedPricing={showSuggestedPricing} />
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
                {showSuggestedPricing && (
                  <>
                    <SortTh label="Suggested listing price" field={SORT_FIELDS.package} {...{ sortField, sortDir, handleSort }} className="min-w-[160px]" />
                    <SortTh label="€/listing" field={SORT_FIELDS.pricePerListing} {...{ sortField, sortDir, handleSort }} className="min-w-[110px]" />
                  </>
                )}
                <SortTh label="Trial start" field={SORT_FIELDS.trialStart} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh label="Trial end" field={SORT_FIELDS.trialEnd} {...{ sortField, sortDir, handleSort }} className="min-w-[130px]" />
                <SortTh
                  label="Next follow-up"
                  field={SORT_FIELDS.nextFollowup}
                  sortField={sortField}
                  sortDir={sortDir}
                  handleSort={handleSort}
                  className="min-w-[140px]"
                  title="Set via each agency's Follow-ups button - “Set next follow-up” option."
                />
                <Th className="min-w-[320px]">Follow-up reason</Th>
                <SortTh label="Notes" field={SORT_FIELDS.notes} {...{ sortField, sortDir, handleSort }} className="min-w-[240px]" />
              </tr>
            </thead>
          </table>

          {followUpRows.length > 0 && (
            <FollowUpSection count={followUpRows.length} showSuggestedPricing={showSuggestedPricing}>
              {followUpRows.map(renderRow)}
            </FollowUpSection>
          )}

          <table className="agency-grid__table">
            <AgencyColGroup showSuggestedPricing={showSuggestedPricing} />
            <tbody>
              {visibleRows.map(renderRow)}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={showSuggestedPricing ? 11 : 9} className="text-center text-neutral-600 text-sm py-10">
                    No agencies match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {otherRows.length > 0 && (
            <div ref={hasMoreRows ? loadMoreRef : undefined} className="agency-load-more">
              {hasMoreRows ? "Loading more agencies as you scroll…" : `${otherRows.length} agencies loaded`}
            </div>
          )}
          </div>
        )}
      </div>
        </>
      )}

      <FollowupDrawerHost
        ref={followupDrawerHostRef}
        statuses={statuses}
        onLogged={load}
        onContactLogged={(agencyId, fields) => patchFields(agencyId, fields)}
      />

      {infoAgency && (
        <AgencyInfoModal
          agency={infoAgency}
          onClose={() => setInfoAgency(null)}
          onSaved={load}
          onDelete={() => removeAgency(infoAgency.id)}
        />
      )}

      {phonesAgency && (
        <PhonesModal
          agency={phonesAgency}
          onClose={() => setPhonesAgency(null)}
          onSave={(phoneNumbers) => savePhones(phonesAgency.id, phoneNumbers)}
        />
      )}

      {notesAgency && (
        <AgencyNotesModal
          agency={notesAgency}
          onClose={() => setNotesAgency(null)}
          onChanged={load}
        />
      )}

      <StatusManagerHost
        ref={statusManagerHostRef}
        statuses={statuses}
        onChanged={async () => {
          await loadStatuses();
          await load();
        }}
      />

    </div>
  );
}

function PhoneCell({ agency, onClick }) {
  const phones = agencyPhones(agency);
  const primaryPhone = phones[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[28px] w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm text-neutral-300 hover:bg-neutral-800/60"
      title={phones.length > 0 ? "View and call phone numbers" : "Add phone numbers"}
    >
      <span className={`min-w-0 flex-1 truncate ${primaryPhone ? "" : "text-neutral-600"}`}>
        {primaryPhone || "Add phone"}
      </span>
      {phones.length > 1 && (
        <span className="shrink-0 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-100">
          {phones.length}
        </span>
      )}
    </button>
  );
}

function NotesCell({ agency, onClick }) {
  const noteCount = Number(agency.note_count) || 0;
  const latestNote = agency.latest_note || "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[28px] w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-neutral-800/60"
      title="View note history"
    >
      <span className={`min-w-0 flex-1 truncate ${latestNote ? "text-neutral-300" : "text-neutral-600"}`}>
        {latestNote || "Add note"}
      </span>
      {noteCount > 0 && (
        <span className="shrink-0 rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-100">
          {noteCount}
        </span>
      )}
    </button>
  );
}

function FollowupTimeBadge({ label, tone }) {
  const styles = {
    overdue: { backgroundColor: "#991b1b", color: "#ffffff" },
    today: { backgroundColor: "#b45309", color: "#ffffff" },
    upcoming: { backgroundColor: "#1d4ed8", color: "#ffffff" },
  };

  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
      style={styles[tone] || styles.upcoming}
    >
      {label}
    </span>
  );
}

function TrialEndBadge({ daysLeft }) {
  if (daysLeft == null) return null;

  if (daysLeft < 0) {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: "#991b1b", color: "#ffffff" }}
      >
        Ended {Math.abs(daysLeft)}d
      </span>
    );
  }

  if (daysLeft === 0) {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: "#b45309", color: "#ffffff" }}
      >
        END
      </span>
    );
  }

  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: "#047857", color: "#ffffff" }}
    >
      {daysLeft}d left
    </span>
  );
}

function AgencyColGroup({ showSuggestedPricing }) {
  return (
    <colgroup>
      {(showSuggestedPricing
        ? [64, 190, 150, 130, 160, 110, 130, 130, 140, 320, 240]
        : [64, 190, 150, 130, 130, 130, 140, 320, 240]
      ).map(
        (width, index) => <col key={index} style={{ width }} />
      )}

    </colgroup>
  );
}

function FollowUpSection({ count, children, showSuggestedPricing }) {
  const [expanded, setExpanded] = useState(true);
  const contentRef = useRef(null);

  function toggle() {
    const content = contentRef.current;
    if (!content) return;

    const opening = !expanded;
    setExpanded(opening);
    content.hidden = !opening;
  }

  return (
    <section className="followup-section" aria-label="Follow up agencies">
      <div className="followup-section__bar">
        <span>Follow Up</span>
        <span className="followup-section__count">{count}</span>
        <button
          type="button"
          onClick={toggle}
          className={`followup-collapse-button ${expanded ? "is-open" : ""}`}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide follow-up agencies" : "Show follow-up agencies"}
          title={expanded ? "Hide follow-up agencies" : "Show follow-up agencies"}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div ref={contentRef} className="followup-grid" aria-hidden={!expanded}>
        <div className="followup-grid__inner">
          <table className="agency-grid__table">
            <AgencyColGroup showSuggestedPricing={showSuggestedPricing} />
            <tbody>{children}</tbody>
          </table>
          <div className="followup-section__divider" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

const AddAgencyHost = forwardRef(function AddAgencyHost({ onAdded }, ref) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const rootRef = useRef(null);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    if (!open) return;
    function close(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    const response = await fetch("/api/agencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setAdding(false);
    if (!response.ok) return;
    setName("");
    setOpen(false);
    onAdded?.();
  }

  if (!open) return null;

  return (
    <div ref={rootRef} className="add-agency-anchor">
      <form onSubmit={submit} className="add-agency-popover">
        <label className="mb-2 block text-xs font-medium text-neutral-400">Agency name</label>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            placeholder="e.g. Studio North"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="control-field min-w-0 flex-1"
          />
          <button type="submit" disabled={adding || !name.trim()} className="primary-button">
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
});

const StatusManagerHost = forwardRef(function StatusManagerHost(
  { statuses, onChanged },
  ref
) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  if (!open) return null;
  return (
    <StatusManagerModal
      statuses={statuses}
      onClose={() => setOpen(false)}
      onChanged={onChanged}
    />
  );
});

const FollowupDrawerHost = forwardRef(function FollowupDrawerHost(
  { statuses, onLogged, onContactLogged },
  ref
) {
  const [agency, setAgency] = useState(null);
  const [initialMode, setInitialMode] = useState("log");
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  useImperativeHandle(ref, () => ({
    open(nextAgency, nextInitialMode = "log") {
      clearTimeout(closeTimerRef.current);
      setAgency(nextAgency);
      setInitialMode(nextInitialMode);
      setClosing(false);
    },
  }), []);

  function close() {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setAgency(null);
      setClosing(false);
    }, 240);
  }

  if (!agency) return null;

  return (
    <FollowupDrawer
      agency={agency}
      statuses={statuses}
      initialMode={initialMode}
      closing={closing}
      onClose={close}
      onLogged={onLogged}
      onContactLogged={(fields) => onContactLogged(agency.id, fields)}
    />
  );
});

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
