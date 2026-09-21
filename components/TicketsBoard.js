"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, isTicketOverdue } from "@/lib/constants";
import { TICKET_ACTIONS } from "@/lib/ticketData";
import ActionMenu from "./ActionMenu";
import AgencyInfoModal from "./AgencyInfoModal";

const PRIORITY_ORDER = { urgent: 0, medium: 1, low: 2 };

const EMPTY_FORM = { agencyId: "", title: "", details: "", dueDate: "", tags: [], priority: "medium", email: "" };

export default function TicketsBoard({ agencies, onChanged, onAgencyChanged }) {
  const [tickets, setTickets] = useState([]);
  const [tab, setTab] = useState("open");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [agencyToEdit, setAgencyToEdit] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't load tickets.");
      setTickets(json.data || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectAgencyForTicket(agencyId) {
    setForm((current) => ({ ...current, agencyId, email: "" }));
  }

  function toggleTag(tag) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }

  function resetComposer() {
    setForm(EMPTY_FORM);
    setComposerOpen(false);
  }

  async function createTicket(event) {
    event.preventDefault();
    const generatedTitle = form.tags.join(" · ");
    const title = form.title.trim() || generatedTitle;
    if (!form.agencyId || !title) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agency_id: form.agencyId,
        title,
        details: form.details.trim() || null,
        tags: form.tags,
        due_date: form.dueDate || null,
        priority: form.priority,
        email: form.email.trim() || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Couldn't create ticket.");
      return;
    }
    resetComposer();
    await load();
    onChanged?.();
  }

  async function updateTicket(ticket, fields) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Couldn't update ticket.");
      return false;
    }
    setTickets((current) => current.map((item) => (item.id === ticket.id ? json.data : item)));
    onChanged?.();
    return true;
  }

  async function deleteTicket(ticket) {
    if (!confirm(`Delete "${ticket.title}"?`)) return;
    const res = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Couldn't delete ticket.");
      return;
    }
    setTickets((current) => current.filter((item) => item.id !== ticket.id));
    onChanged?.();
  }

  const counts = useMemo(
    () => ({
      open: tickets.filter((ticket) => !ticket.done).length,
      done: tickets.filter((ticket) => ticket.done).length,
    }),
    [tickets]
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (tab === "open" ? ticket.done : !ticket.done) return false;
      if (agencyFilter && ticket.agency_id !== agencyFilter) return false;
      if (!query) return true;
      const agency = ticket.agency || {};
      return [
        ticket.title,
        ticket.details,
        ticket.email,
        ticket.agency_name,
        agency.contact_person,
        agency.email,
        agency.phone,
        ...(ticket.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    }).sort((a, b) => {
      const priorityDifference = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (priorityDifference !== 0) return priorityDifference;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [tickets, tab, agencyFilter, search]);

  const hasTicketAction = form.tags.length > 0;

  return (
      <main className="thin-scroll min-h-0 flex-1 overflow-auto px-4 py-5 text-white sm:px-6">
        <div className="w-full">
          {composerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6" onClick={() => { if (!saving) resetComposer(); }}>
              <form onSubmit={createTicket} onClick={(event) => event.stopPropagation()} className="ticket-composer-modal modal-surface w-full max-w-4xl overflow-visible rounded-2xl border shadow-2xl">
                <div className="modal-header flex items-center justify-between gap-3 border-b px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-white">New ticket</h2>
                    <p className="mt-0.5 text-xs text-neutral-500">Pick the agency and requested actions so the next person knows exactly what to do.</p>
                  </div>
                  <button type="button" onClick={resetComposer} disabled={saving} className="text-sm text-neutral-500 hover:text-white disabled:opacity-40">Close</button>
                </div>

                <div className="space-y-4 px-5 py-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_150px_150px]">
                    <FieldLabel label="Agency">
                      <AgencyPicker agencies={agencies} value={form.agencyId} onChange={selectAgencyForTicket} />
                    </FieldLabel>
                    <FieldLabel label="Due date">
                      <input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} className="ticket-field" />
                    </FieldLabel>
                    <FieldLabel label="Priority">
                      <select value={form.priority} onChange={(e) => setField("priority", e.target.value)} className="ticket-field">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </FieldLabel>
                  </div>
                  <FieldLabel label="Ticket email (optional)">
                    <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder={agencies.find((agency) => agency.id === form.agencyId)?.email ? `Default: ${agencies.find((agency) => agency.id === form.agencyId).email}` : "Email given specifically for this ticket"} className="ticket-field" />
                  </FieldLabel>
                  <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.4fr)_minmax(340px,1fr)]">
                    <FieldLabel label="Details / what should be said">
                      <textarea value={form.details} onChange={(e) => setField("details", e.target.value)} placeholder="Short brief, exact message or any context your friend needs..." rows={3} className="ticket-field resize-none" />
                    </FieldLabel>
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Requested actions</p>
                      <TagPicker selected={form.tags} onToggle={toggleTag} />
                    </div>
                  </div>
                </div>

                <div className="modal-footer flex justify-end gap-3 border-t px-5 py-4">
                  <button type="button" onClick={resetComposer} disabled={saving} className="activity-action activity-action--quiet disabled:opacity-40">Cancel</button>
                  <button disabled={saving || !form.agencyId || !hasTicketAction} className="primary-button disabled:opacity-40">
                    {saving ? "Adding..." : "Add ticket"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start justify-between rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-3 text-rose-400 hover:text-white">×</button>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
              <TicketFilter active={tab === "open"} onClick={() => setTab("open")} label="Open" count={counts.open} />
              <TicketFilter active={tab === "done"} onClick={() => setTab("done")} label="Done" count={counts.done} done />
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search task, agency, email or tag..." className="ticket-field min-w-[240px] flex-1 sm:max-w-sm" />
            <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} className="ticket-field w-auto min-w-[180px]">
              <option value="">All agencies</option>
              {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
            </select>
            <button onClick={() => setComposerOpen((open) => !open)} className="primary-button ml-auto">
              {composerOpen ? "Close composer" : "+ New ticket"}
            </button>
          </div>

          <div className="ticket-mobile-list md:hidden">
            {loading ? (
              <div className="p-10 text-center text-sm text-neutral-500">Loading tickets...</div>
            ) : visible.length === 0 ? (
              <div className="p-10 text-center"><p className="text-sm text-neutral-400">No tickets in this view.</p></div>
            ) : visible.map((ticket) => (
              <TicketMobileCard
                key={ticket.id}
                ticket={ticket}
                editing={editingId === ticket.id}
                saving={saving}
                onEdit={() => setEditingId(ticket.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={async (fields) => { if (await updateTicket(ticket, fields)) setEditingId(null); }}
                onToggle={() => updateTicket(ticket, { done: !ticket.done })}
                onDelete={() => deleteTicket(ticket)}
                onSetEmail={() => setAgencyToEdit(agencies.find((agency) => agency.id === ticket.agency_id) || null)}
              />
            ))}
          </div>

          <div className="modal-surface hidden overflow-visible rounded-xl border border-neutral-800 bg-neutral-900/50 md:block">
            <div className="thin-scroll overflow-x-auto">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-[18px_44px_190px_minmax(310px,1.5fr)_minmax(225px,1fr)_125px_120px] gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  <span></span><span></span><span>Agency</span><span>Ticket</span><span>Contact</span><span>Due</span><span className="text-right">Actions</span>
                </div>
                {loading ? (
                  <div className="p-10 text-center text-sm text-neutral-500">Loading tickets...</div>
                ) : visible.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-sm text-neutral-400">No tickets in this view.</p>
                    {tab === "open" && <button onClick={() => setComposerOpen(true)} className="mt-2 text-sm text-[#f2426a] hover:text-[#ff6b8c]">Create the first one</button>}
                  </div>
                ) : visible.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    editing={editingId === ticket.id}
                    saving={saving}
                    onEdit={() => setEditingId(ticket.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={async (fields) => {
                      if (await updateTicket(ticket, fields)) setEditingId(null);
                    }}
                    onToggle={() => updateTicket(ticket, { done: !ticket.done })}
                    onDelete={() => deleteTicket(ticket)}
                    onSetEmail={() => setAgencyToEdit(agencies.find((agency) => agency.id === ticket.agency_id) || null)}
                  />
                ))}
              </div>
            </div>
          </div>

          {agencyToEdit && (
            <AgencyInfoModal
              agency={agencyToEdit}
              initialFocus="email"
              onClose={() => setAgencyToEdit(null)}
              onSaved={async () => {
                await onAgencyChanged?.();
                await load();
              }}
            />
          )}
        </div>
      </main>
  );
}

function TicketFilter({ active, onClick, label, count, done = false }) {
  const activeColor = done ? "bg-emerald-700 text-white" : "bg-neutral-700 text-white";
  return <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-sm transition ${active ? activeColor : "text-neutral-500 hover:text-white"}`}>{label} <span className="ml-1 text-xs opacity-70">{count}</span></button>;
}

function FieldLabel({ label, children }) {
  return <label><span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>{children}</label>;
}

function Tag({ children }) {
  const isAction = TICKET_ACTIONS.includes(children);
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${isAction ? "border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-neutral-100" : "border-neutral-600 bg-neutral-700/50 text-neutral-300"}`}>{children}</span>;
}

function TagPicker({ selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TICKET_ACTIONS.map((tag) => <button type="button" key={tag} onClick={() => onToggle(tag)} className={`rounded-full border px-2.5 py-1 text-xs transition ${selected.includes(tag) ? "border-[color:var(--brand)]/55 bg-[color:var(--brand-soft)] text-white" : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"}`}>{tag}</button>)}
      {selected.filter((tag) => !TICKET_ACTIONS.includes(tag)).map((tag) => <button type="button" key={tag} onClick={() => onToggle(tag)} className="rounded-full border border-neutral-600 bg-neutral-700/50 px-2.5 py-1 text-xs text-neutral-200 transition hover:border-neutral-400">{tag} ×</button>)}
    </div>
  );
}

function AgencyPicker({ agencies, value, onChange }) {
  const selectedAgency = agencies.find((agency) => agency.id === value);
  const [query, setQuery] = useState(selectedAgency?.name || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedAgency?.name || "");
  }, [selectedAgency?.id, selectedAgency?.name]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return agencies.filter((agency) => !normalized || agency.name.toLowerCase().includes(normalized)).slice(0, 8);
  }, [agencies, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        placeholder="Search agency..."
        className="ticket-field"
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
          {matches.length === 0 ? <p className="px-2 py-2 text-xs text-neutral-500">No agencies found.</p> : matches.map((agency) => (
            <button
              type="button"
              key={agency.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(agency.id); setQuery(agency.name); setOpen(false); }}
              className="block w-full rounded-md px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
            >
              {agency.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRow({ ticket, editing, saving, onEdit, onCancelEdit, onSave, onToggle, onDelete, onSetEmail }) {
  const overdue = isTicketOverdue(ticket);
  const agency = ticket.agency || {};
  const [draft, setDraft] = useState({ title: ticket.title, details: ticket.details || "", dueDate: ticket.due_date || "", tags: ticket.tags || [], priority: ticket.priority || "medium", email: ticket.email || "" });

  useEffect(() => {
    if (editing) setDraft({ title: ticket.title, details: ticket.details || "", dueDate: ticket.due_date || "", tags: ticket.tags || [], priority: ticket.priority || "medium", email: ticket.email || ticket.agency?.email || "" });
  }, [editing, ticket]);

  function toggleDraftTag(tag) {
    setDraft((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  }

  return (
    <div className={`ticket-row border-b border-neutral-800/80 last:border-0 ${overdue ? "is-overdue" : ""}`}>
      <div className="grid grid-cols-[18px_44px_190px_minmax(310px,1.5fr)_minmax(225px,1fr)_125px_120px] gap-3 px-3 py-3.5 text-sm">
        <div className="flex justify-center pt-1" title={`${ticket.priority || "medium"} priority`}>
          <PriorityFlag priority={ticket.priority} />
        </div>
        <div className="pt-0.5">
          <button onClick={onToggle} disabled={saving} title={ticket.done ? "Restore ticket" : "Mark complete"} className={`flex h-5 w-5 items-center justify-center rounded border transition ${ticket.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-600 text-transparent hover:border-emerald-500"}`}>✓</button>
        </div>
        <div className="min-w-0">
          <p className={`truncate font-medium ${ticket.done ? "text-neutral-500" : "text-white"}`}>{ticket.agency_name || "Unknown agency"}</p>
          {agency.contact_person && <p className="mt-0.5 truncate text-xs text-neutral-400">{agency.contact_person}</p>}
          {agency.location && <p className="mt-1 truncate text-[11px] text-neutral-600" title={agency.location}>{agency.location}</p>}
        </div>
        <div className="min-w-0">
          <p className={`font-medium leading-5 ${ticket.done ? "text-neutral-500 line-through" : "text-neutral-100"}`}>{ticket.title}</p>
          {ticket.details && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-neutral-400">{ticket.details}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">{(ticket.tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
        </div>
        <div className="min-w-0 space-y-1 text-xs">
          {agency.email && <a href={`mailto:${agency.email}`} className="block truncate text-neutral-400 hover:text-sky-300 hover:underline" title="Default agency email">Default: {agency.email}</a>}
          {ticket.email && <a href={`mailto:${ticket.email}`} className="block truncate text-sky-300 hover:underline" title="Ticket email">Ticket: {ticket.email}</a>}
          {!agency.email && !ticket.email && <button type="button" onClick={onSetEmail} className="block text-left font-medium text-[color:var(--brand)] hover:underline">No email — set one</button>}
          {agency.phone && <a href={`tel:${agency.phone}`} className="block truncate text-neutral-300 hover:text-white">☎ {agency.phone}</a>}
          {agency.mobile_alt && <a href={`tel:${agency.mobile_alt}`} className="block truncate text-neutral-400 hover:text-white">Mobile: {agency.mobile_alt}</a>}
          <div className="flex flex-wrap gap-x-2 gap-y-1 pt-1 text-[11px]">
            {agency.website && <ExternalLink href={agency.website}>Website</ExternalLink>}
            {agency.oglasnik_profil && <ExternalLink href={agency.oglasnik_profil}>Oglasnik</ExternalLink>}
          </div>
          {!agency.email && !ticket.email && !agency.phone && !agency.mobile_alt && <span className="text-neutral-600">No contact info</span>}
        </div>
        <div>
          {ticket.due_date ? <p className={overdue ? "ticket-overdue-date" : "text-neutral-300"}>{formatDate(ticket.due_date)}{overdue && <span className="ticket-overdue-label">Overdue</span>}</p> : <span className="text-neutral-600">No date</span>}
        </div>
        <div className="flex justify-end text-xs">
          <ActionMenu
            label={`Actions for ${ticket.title}`}
            iconOnly
            items={[
              { label: "Edit ticket", onClick: onEdit },
              { separator: true },
              { label: "Delete ticket", danger: true, onClick: onDelete },
            ]}
          />
        </div>
      </div>
      {editing && (
        <div className="border-t border-neutral-800 bg-neutral-900 px-[89px] py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(200px,1.2fr)_140px_130px_minmax(190px,.9fr)]">
            <FieldLabel label="Action"><input value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} className="ticket-field" /></FieldLabel>
            <FieldLabel label="Details"><textarea value={draft.details} onChange={(e) => setDraft((current) => ({ ...current, details: e.target.value }))} rows={2} className="ticket-field resize-none" /></FieldLabel>
            <FieldLabel label="Due date"><input type="date" value={draft.dueDate} onChange={(e) => setDraft((current) => ({ ...current, dueDate: e.target.value }))} className="ticket-field" /></FieldLabel>
            <FieldLabel label="Priority"><select value={draft.priority} onChange={(e) => setDraft((current) => ({ ...current, priority: e.target.value }))} className="ticket-field"><option value="low">Low</option><option value="medium">Medium</option><option value="urgent">Urgent</option></select></FieldLabel>
            <FieldLabel label="Ticket email (optional)"><input type="email" value={draft.email} onChange={(e) => setDraft((current) => ({ ...current, email: e.target.value }))} placeholder={agency.email ? `Default: ${agency.email}` : "Email for this ticket"} className="ticket-field" /></FieldLabel>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Tags</p><TagPicker selected={draft.tags} onToggle={toggleDraftTag} /></div>
            <div className="flex shrink-0 gap-2"><button onClick={onCancelEdit} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300">Cancel</button><button disabled={saving || !draft.title.trim()} onClick={() => onSave({ title: draft.title.trim(), details: draft.details.trim() || null, tags: draft.tags, due_date: draft.dueDate || null, priority: draft.priority, email: draft.email.trim() || null })} className="rounded-lg bg-[#f01546] px-4 py-1.5 text-xs font-medium disabled:opacity-40">{saving ? "Saving..." : "Save"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketMobileCard({ ticket, editing, saving, onEdit, onCancelEdit, onSave, onToggle, onDelete, onSetEmail }) {
  const overdue = isTicketOverdue(ticket);
  const agency = ticket.agency || {};
  const [draft, setDraft] = useState({ title: ticket.title, details: ticket.details || "", dueDate: ticket.due_date || "", tags: ticket.tags || [], priority: ticket.priority || "medium", email: ticket.email || "" });

  useEffect(() => {
    if (editing) setDraft({ title: ticket.title, details: ticket.details || "", dueDate: ticket.due_date || "", tags: ticket.tags || [], priority: ticket.priority || "medium", email: ticket.email || ticket.agency?.email || "" });
  }, [editing, ticket]);

  function toggleTag(tag) {
    setDraft((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  }

  return (
    <article className={`ticket-mobile-card ${overdue ? "is-overdue" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5"><PriorityFlag priority={ticket.priority} /></div>
        <button onClick={onToggle} disabled={saving} aria-label={ticket.done ? "Restore ticket" : "Mark ticket complete"} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${ticket.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-600 text-transparent"}`}>✓</button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className={`truncate text-sm font-semibold ${ticket.done ? "text-neutral-500" : "text-white"}`}>{ticket.agency_name || "Unknown agency"}</p>
            {ticket.due_date && <div className={overdue ? "ticket-mobile-due is-overdue" : "ticket-mobile-due"}>{formatDate(ticket.due_date)}{overdue && <span>Overdue</span>}</div>}
          </div>
          <p className={`mt-1 text-sm font-medium leading-5 ${ticket.done ? "text-neutral-500 line-through" : "text-neutral-100"}`}>{ticket.title}</p>
          {ticket.details && <p className="mt-1 text-xs leading-5 text-neutral-400">{ticket.details}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">{(ticket.tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {agency.email && <a href={`mailto:${agency.email}`} className="text-neutral-400 hover:text-sky-300 hover:underline">Default: {agency.email}</a>}
            {ticket.email && <a href={`mailto:${ticket.email}`} className="text-sky-300 hover:underline">Ticket: {ticket.email}</a>}
            {!agency.email && !ticket.email && <button type="button" onClick={onSetEmail} className="font-medium text-[color:var(--brand)] hover:underline">No email — set one</button>}
            {agency.phone && <a href={`tel:${agency.phone}`} className="text-neutral-300">☎ {agency.phone}</a>}
          </div>
          <div className="mt-3 flex justify-end">
            <ActionMenu label={`Actions for ${ticket.title}`} iconOnly items={[{ label: "Edit ticket", onClick: onEdit }, { separator: true }, { label: "Delete ticket", danger: true, onClick: onDelete }]} />
          </div>
        </div>
      </div>

      {editing && (
        <div className="ticket-mobile-editor mt-4 space-y-3">
          <FieldLabel label="Action"><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="ticket-field" /></FieldLabel>
          <FieldLabel label="Details"><textarea value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} rows={3} className="ticket-field resize-none" /></FieldLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldLabel label="Due date"><input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} className="ticket-field" /></FieldLabel>
            <FieldLabel label="Priority"><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))} className="ticket-field"><option value="low">Low</option><option value="medium">Medium</option><option value="urgent">Urgent</option></select></FieldLabel>
          </div>
          <FieldLabel label="Ticket email (optional)"><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder={agency.email ? `Default: ${agency.email}` : "Email for this ticket"} className="ticket-field" /></FieldLabel>
          <div><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Requested actions</p><TagPicker selected={draft.tags} onToggle={toggleTag} /></div>
          <div className="flex justify-end gap-2"><button onClick={onCancelEdit} className="activity-action activity-action--quiet">Cancel</button><button disabled={saving || !draft.title.trim()} onClick={() => onSave({ title: draft.title.trim(), details: draft.details.trim() || null, tags: draft.tags, due_date: draft.dueDate || null, priority: draft.priority, email: draft.email.trim() || null })} className="primary-button disabled:opacity-40">{saving ? "Saving..." : "Save"}</button></div>
        </div>
      )}
    </article>
  );
}

function PriorityFlag({ priority = "medium" }) {
  return <span className={`ticket-priority-flag is-${priority}`} aria-label={`${priority} priority`} />;
}

function ExternalLink({ href, children }) {
  const safeHref = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-[#f2426a] hover:underline">{children} ↗</a>;
}
