"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT_METHODS, formatDate } from "@/lib/constants";
import { TICKET_ACTIONS } from "@/lib/ticketData";

// Contacts are history; scheduled follow-ups are a separate future list.
function TicketActionPicker({ selected, onChange }) {
  function toggleAction(action) {
    onChange(selected.includes(action)
      ? selected.filter((item) => item !== action)
      : [...selected, action]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {TICKET_ACTIONS.map((action) => (
        <button
          type="button"
          key={action}
          onClick={() => toggleAction(action)}
          className={`rounded-full border px-2.5 py-1 text-xs transition ${selected.includes(action) ? "border-[color:var(--brand)]/55 bg-[color:var(--brand-soft)] text-white" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"}`}
        >
          {action}
        </button>
      ))}
    </div>
  );
}

export default function FollowupDrawer({ agency, statuses, initialMode = "log", closing = false, onClose, onLogged, onContactLogged }) {
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [contactDate, setContactDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Phone Call");
  const [statusId, setStatusId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [scheduled, setScheduled] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const [createTicket, setCreateTicket] = useState(false);
  const [ticketTags, setTicketTags] = useState([]);
  const [ticketPriority, setTicketPriority] = useState("medium");
  const [ticketDueDate, setTicketDueDate] = useState("");
  const [ticketDetails, setTicketDetails] = useState("");
  const [selectedScheduled, setSelectedScheduled] = useState(null);
  const [completingScheduled, setCompletingScheduled] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    loadHistory();
    loadScheduled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.id]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => setMode(initialMode), [initialMode]);

  async function loadHistory() {
    setHistoryLoading(true);
    const res = await fetch(`/api/followups?agency_id=${agency.id}`);
    const json = await res.json();
    setHistory(json.data || []);
    setHistoryLoading(false);
  }

  async function loadScheduled() {
    setScheduledLoading(true);
    setScheduleError("");
    const res = await fetch(`/api/scheduled-followups?agency_id=${agency.id}`);
    const json = await res.json();
    if (res.ok) setScheduled(json.data || []);
    else setScheduleError(json.error || "Couldn't load scheduled follow-ups.");
    setScheduledLoading(false);
  }

  async function submitActivity(e) {
    e.preventDefault();
    const isContact = mode === "log";
    const shouldCreateTicket = isContact && createTicket;
    const activityDate = isContact ? contactDate : scheduleDate;
    if (!activityDate || (shouldCreateTicket && ticketTags.length === 0)) return;
    setSaving(true);
    setScheduleError("");
    const res = await fetch(isContact ? "/api/followups" : "/api/scheduled-followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isContact
        ? { agency_id: agency.id, date: contactDate, method, discussed: description || null }
        : { agency_id: agency.id, date: scheduleDate, reason: scheduleReason || null }
      ),
    });
    const json = await res.json();

    if (!res.ok) {
      setScheduleError(json.error || (isContact ? "Couldn't save this contact." : "Couldn't schedule follow-up."));
      setSaving(false);
      return;
    }

    if (isContact) {
      const agencyChanges = {
        ...(agency.date_first_contacted ? {} : { date_first_contacted: contactDate }),
        ...(statusId && statusId !== agency.status_id ? { status_id: statusId } : {}),
      };
      if (Object.keys(agencyChanges).length > 0) await onContactLogged?.(agencyChanges);
      setDescription("");
    } else {
      setScheduleDate("");
      setScheduleReason("");
    }

    if (shouldCreateTicket) {
      const ticketRes = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: agency.id,
          title: ticketTags.join(" · "),
          due_date: ticketDueDate || activityDate,
          details: ticketDetails || (isContact ? description : scheduleReason) || null,
          tags: ticketTags,
          priority: ticketPriority,
        }),
      });
      const ticketJson = await ticketRes.json();
      if (!ticketRes.ok) setScheduleError(`Activity was saved, but the ticket couldn't be created: ${ticketJson.error || "Unknown error."}`);
      else {
        setCreateTicket(false);
        setTicketTags([]);
        setTicketPriority("medium");
        setTicketDueDate("");
        setTicketDetails("");
      }
    }

    await (isContact ? loadHistory() : loadScheduled());
    onLogged?.();
    setSaving(false);
  }

  async function removeHistoryItem(item) {
    if (!confirm(`Delete this contact from ${formatDate(item.date)}?`)) return;
    setDeletingId(item.id);
    const res = await fetch(`/api/followups/${item.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) await loadHistory();
  }

  async function completeScheduled(item, contact) {
    const res = await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agency_id: agency.id,
        date: contact.date,
        method: contact.method,
        discussed: contact.description || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) return json.error || "Couldn't save this contact.";

    const agencyChanges = {
      ...(agency.date_first_contacted ? {} : { date_first_contacted: contact.date }),
      ...(contact.statusId && contact.statusId !== agency.status_id ? { status_id: contact.statusId } : {}),
    };
    if (Object.keys(agencyChanges).length > 0) await onContactLogged?.(agencyChanges);

    if (contact.createTicket) {
      const ticketRes = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: agency.id,
          title: contact.ticketTags.join(" · "),
          due_date: contact.ticketDueDate || contact.date,
          details: contact.ticketDetails || contact.description || null,
          tags: contact.ticketTags,
          priority: contact.ticketPriority,
        }),
      });
      const ticketJson = await ticketRes.json();
      if (!ticketRes.ok) {
        setScheduleError(`Follow-up was completed, but the ticket couldn't be created: ${ticketJson.error || "Unknown error."}`);
      }
    }

    const removeRes = await fetch(`/api/scheduled-followups/${item.id}`, { method: "DELETE" });
    if (!removeRes.ok) return "Contact was saved, but the scheduled follow-up couldn't be removed.";

    setCompletingScheduled(null);
    await Promise.all([loadHistory(), loadScheduled()]);
    onLogged?.();
    return null;
  }

  return (
    <div
      className={`followup-drawer ${entered && !closing ? "is-open" : ""}`}
      onClick={onClose}
    >
      <div className="followup-drawer__backdrop" />
      <div
        className="followup-drawer__panel modal-surface relative flex w-full max-w-3xl max-h-[88vh] flex-col overflow-hidden rounded-2xl border bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-white">Activity</h2>
            <p className="text-sm text-neutral-400 truncate">{agency.name} · contacts and follow-ups</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-neutral-500 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-6">
          <form onSubmit={submitActivity} className="followup-form-card space-y-3">
            <label className="block text-xs text-neutral-400">What are you adding?
              <select autoFocus value={mode} onChange={(event) => { setMode(event.target.value); if (event.target.value === "schedule") setCreateTicket(false); }} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]">
                <option value="log">Log a completed contact</option>
                <option value="schedule">Schedule a future follow-up</option>
              </select>
            </label>

            {mode === "log" ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-neutral-400">Date
                    <input type="date" value={contactDate} onChange={(event) => setContactDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                  </label>
                  <label className="block text-xs text-neutral-400">Method
                    <select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]">
                      {CONTACT_METHODS.map((contactMethod) => <option key={contactMethod}>{contactMethod}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-xs text-neutral-400">Update status <span className="text-neutral-600">(optional)</span>
                  <select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]">
                    <option value="">Keep current status</option>
                    {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-neutral-400">What happened?
                  <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was discussed, agreed or learned..." className="mt-1 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                </label>
              </>
            ) : (
              <>
                <label className="block text-xs text-neutral-400">Follow-up date
                  <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                </label>
                <label className="block text-xs text-neutral-400">Why should we contact them?
                  <textarea rows={3} value={scheduleReason} onChange={(event) => setScheduleReason(event.target.value)} placeholder="Reason or context for this follow-up..." className="mt-1 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                </label>
              </>
            )}

            {mode === "log" && <>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2 text-sm text-neutral-300">
                <input type="checkbox" checked={createTicket} onChange={(event) => setCreateTicket(event.target.checked)} className="h-4 w-4 accent-[#f01546]" />
                Also create a ticket for this contact
              </label>

            {createTicket && (
              <div className="ticket-fields grid gap-3 rounded-lg border border-neutral-800 bg-neutral-800/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-neutral-400">Priority
                    <select value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"><option value="low">Low</option><option value="medium">Medium</option><option value="urgent">Urgent</option></select>
                  </label>
                  <label className="block text-xs text-neutral-400">Due date <span className="text-neutral-600">(optional)</span>
                    <input type="date" value={ticketDueDate} onChange={(event) => setTicketDueDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                  </label>
                </div>
                <div><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Requested actions</p><TicketActionPicker selected={ticketTags} onChange={setTicketTags} /></div>
                <label className="block text-xs text-neutral-400">Details <span className="text-neutral-600">(optional)</span>
                  <input value={ticketDetails} onChange={(event) => setTicketDetails(event.target.value)} placeholder="Extra context" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                </label>
              </div>
            )}
            </>}

            {scheduleError && <p className="text-sm text-rose-400">{scheduleError}</p>}
            <button type="submit" disabled={saving || (mode === "log" ? !contactDate : !scheduleDate) || (mode === "log" && createTicket && ticketTags.length === 0)} className="primary-button w-full disabled:opacity-40">
              {saving ? "Saving..." : mode === "log" ? "Save contact" : "Schedule follow-up"}
            </button>
          </form>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Scheduled follow-ups</h3>
            {scheduledLoading ? <p className="text-sm text-neutral-600">Loading...</p> : scheduled.length === 0 ? (
              <p className="text-sm text-neutral-600">No follow-ups scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {scheduled.map((item, index) => (
                  <li key={item.id} className="followup-activity-card">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white">{formatDate(item.date)}</span>
                        {index === 0 && <span className="activity-badge">Next</span>}
                      </div>
                      {item.reason && <p className="mt-0.5 truncate text-sm text-neutral-300">{item.reason}</p>}
                    </div>
                    <div className="followup-card-actions">
                      <button type="button" onClick={() => setSelectedScheduled(item)} className="activity-action activity-action--quiet">Edit</button>
                      <button type="button" onClick={() => setCompletingScheduled(item)} className="activity-action activity-action--primary">Complete & log</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              History
            </h3>
            {historyLoading ? (
              <p className="text-sm text-neutral-600">Loading...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-neutral-600">No follow-ups logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((it, index) => (
                  <li
                    key={it.id}
                    className="bg-neutral-800/40 border border-neutral-800 rounded-xl transition hover:border-neutral-700 hover:bg-neutral-800/65"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryItem(it)}
                      className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
                    >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-white font-medium">{formatDate(it.date)}</span>
                            {index === history.length - 1 && (
                              <span className="activity-badge">First contact</span>
                            )}
                            {it.method && <span className="text-xs text-neutral-500">{it.method}</span>}
                          </div>
                          {it.discussed && (
                            <p className="text-sm text-neutral-300 mt-0.5 whitespace-pre-wrap">
                              {it.discussed}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500">More info ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {selectedHistoryItem && (
        <ContactLogModal
          item={selectedHistoryItem}
          isFirstContact={selectedHistoryItem.id === history[history.length - 1]?.id}
          onClose={() => setSelectedHistoryItem(null)}
          onSaved={async () => {
            setSelectedHistoryItem(null);
            await loadHistory();
          }}
          onDelete={async (item) => {
            await removeHistoryItem(item);
            setSelectedHistoryItem(null);
          }}
          deleting={deletingId === selectedHistoryItem.id}
        />
      )}
      {selectedScheduled && (
        <ScheduledFollowupModal
          item={selectedScheduled}
          onClose={() => setSelectedScheduled(null)}
          onSaved={async () => {
            setSelectedScheduled(null);
            await loadScheduled();
            onLogged?.();
          }}
        />
      )}
      {completingScheduled && (
        <CompleteFollowupModal
          item={completingScheduled}
          agency={agency}
          statuses={statuses}
          onClose={() => setCompletingScheduled(null)}
          onComplete={(contact) => completeScheduled(completingScheduled, contact)}
        />
      )}
    </div>
  );
}

function ContactLogModal({ item, isFirstContact, onClose, onSaved, onDelete, deleting }) {
  const [date, setDate] = useState(item.date || "");
  const [method, setMethod] = useState(item.method || "Phone Call");
  const [description, setDescription] = useState(item.discussed || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!date) return;
    setSaving(true);
    const res = await fetch(`/api/followups/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        method,
        discussed: description || null,
      }),
    });
    setSaving(false);
    if (res.ok) onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-4 py-6" onClick={onClose}>
      <div className="modal-surface w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold text-white">Contact log</h3>
            {isFirstContact && <p className="mt-0.5 text-xs text-neutral-400">First contact</p>}
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">Close</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-400">Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
            </label>
            <label className="text-xs text-neutral-400">Method
              <select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]">
                {CONTACT_METHODS.map((contactMethod) => <option key={contactMethod}>{contactMethod}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs text-neutral-400">What happened?
            <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was discussed, agreed or learned..." className="mt-1 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
          </label>
        </div>
        <div className="modal-footer flex items-center gap-3 border-t px-5 py-4">
          <button type="button" onClick={() => onDelete(item)} disabled={saving || deleting} className="rounded-lg border border-rose-900 px-3 py-2 text-sm text-rose-300 hover:border-rose-600 hover:bg-rose-950/50 disabled:opacity-40">
            {deleting ? "Deleting..." : "Delete"}
          </button>
          <button type="button" onClick={save} disabled={saving || deleting || !date} className="ml-auto rounded-lg bg-[#f01546] px-4 py-2 text-sm font-medium text-white hover:bg-[#f2426a] disabled:opacity-40">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompleteFollowupModal({ item, agency, statuses, onClose, onComplete }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Phone Call");
  const [statusId, setStatusId] = useState("");
  const [description, setDescription] = useState(item.reason || "");
  const [createTicket, setCreateTicket] = useState(false);
  const [ticketTags, setTicketTags] = useState([]);
  const [ticketPriority, setTicketPriority] = useState("medium");
  const [ticketDueDate, setTicketDueDate] = useState("");
  const [ticketDetails, setTicketDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function complete(event) {
    event.preventDefault();
    if (!date) return;
    setSaving(true);
    setError("");
    const result = await onComplete({ date, method, statusId, description, createTicket, ticketTags, ticketPriority, ticketDueDate, ticketDetails });
    setSaving(false);
    if (result) setError(result);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-6" onClick={onClose}>
      <div className="modal-surface w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold text-white">Complete follow-up</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Log what happened and move this item to History.</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">Close</button>
        </div>

        <form onSubmit={complete}>
          <div className="space-y-4 px-5 py-4">
            <div className="followup-conversion-context px-3 py-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Scheduled for {formatDate(item.date)}</div>
              <div className="mt-1 text-sm text-neutral-200">{item.reason || "No reason was added."}</div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-neutral-400">Contact date
                <input autoFocus type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
              </label>
              <label className="block text-xs text-neutral-400">Method
                <select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]">
                  {CONTACT_METHODS.map((contactMethod) => <option key={contactMethod}>{contactMethod}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-xs text-neutral-400">Update status <span className="text-neutral-600">(optional)</span>
              <select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]">
                <option value="">Keep current status</option>
                {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
              </select>
            </label>

            <label className="block text-xs text-neutral-400">What happened?
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was discussed, agreed or learned..." className="mt-1 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-800/30 px-3 py-2 text-sm text-neutral-300">
              <input type="checkbox" checked={createTicket} onChange={(event) => setCreateTicket(event.target.checked)} className="h-4 w-4 accent-[#f01546]" />
              Also create a ticket for this contact
            </label>

            {createTicket && (
              <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-800/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-neutral-400">Priority
                    <select value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]"><option value="low">Low</option><option value="medium">Medium</option><option value="urgent">Urgent</option></select>
                  </label>
                  <label className="block text-xs text-neutral-400">Due date <span className="text-neutral-600">(optional)</span>
                    <input type="date" value={ticketDueDate} onChange={(event) => setTicketDueDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                  </label>
                </div>
                <div><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Requested actions</p><TicketActionPicker selected={ticketTags} onChange={setTicketTags} /></div>
                <label className="block text-xs text-neutral-400">Details <span className="text-neutral-600">(optional)</span>
                  <input value={ticketDetails} onChange={(event) => setTicketDetails(event.target.value)} placeholder="Extra context" className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
                </label>
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>

          <div className="modal-footer flex items-center justify-end gap-3 border-t px-5 py-4">
            <button type="button" onClick={onClose} disabled={saving} className="activity-action activity-action--quiet disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={saving || !date || (createTicket && ticketTags.length === 0)} className="primary-button disabled:opacity-40">
              {saving ? "Completing..." : "Complete and add to history"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScheduledFollowupModal({ item, onClose, onSaved }) {
  const [date, setDate] = useState(item.date || "");
  const [reason, setReason] = useState(item.reason || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!date) return;
    setSaving(true);
    const res = await fetch(`/api/scheduled-followups/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason || null }),
    });
    setSaving(false);
    if (res.ok) onSaved();
  }

  async function remove() {
    if (!confirm("Delete this scheduled follow-up?")) return;
    setDeleting(true);
    const res = await fetch(`/api/scheduled-followups/${item.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-4 py-6" onClick={onClose}>
      <div className="modal-surface w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold text-white">Scheduled follow-up</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Edit or remove this planned contact.</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white">Close</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs text-neutral-400">Date
            <input autoFocus type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
          </label>
          <label className="block text-xs text-neutral-400">Why should we contact them?
            <textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason or context for the follow-up..." className="mt-1 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#f01546]" />
          </label>
        </div>
        <div className="modal-footer flex items-center gap-3 border-t px-5 py-4">
          <button type="button" onClick={remove} disabled={saving || deleting} className="rounded-lg border border-rose-900 px-3 py-2 text-sm text-rose-300 hover:border-rose-600 hover:bg-rose-950/50 disabled:opacity-40">
            {deleting ? "Deleting..." : "Delete"}
          </button>
          <button type="button" onClick={save} disabled={saving || deleting || !date} className="ml-auto rounded-lg bg-[#f01546] px-4 py-2 text-sm font-medium text-white hover:bg-[#f2426a] disabled:opacity-40">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
