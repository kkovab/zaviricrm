"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, isTicketOverdue } from "@/lib/constants";

const TAGS = ["Email", "Prices", "Link", "Promotion", "XML", "Phone", "Website", "Admin"];
const TAG_COLORS = {
  Email: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  Prices: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  Link: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  Promotion: "border-pink-500/30 bg-pink-500/15 text-pink-300",
  XML: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  Phone: "border-cyan-500/30 bg-cyan-500/15 text-cyan-300",
  Website: "border-indigo-500/30 bg-indigo-500/15 text-indigo-300",
  Admin: "border-orange-500/30 bg-orange-500/15 text-orange-300",
};

const EMPTY_FORM = { agencyId: "", title: "", details: "", dueDate: "", tags: [] };

export default function TicketsBoard({ agencies, onBack, onChanged }) {
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
    if (!form.agencyId || !form.title.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agency_id: form.agencyId,
        title: form.title.trim(),
        details: form.details.trim() || null,
        tags: form.tags,
        due_date: form.dueDate || null,
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
    });
  }, [tickets, tab, agencyFilter, search]);

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 bg-neutral-950 px-4 py-4 sm:px-6 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="Logo" className="h-8 w-8 rounded shrink-0" />
            <div>
              <h1 className="text-lg font-semibold">Agency Outreach</h1>
              <p className="text-xs text-neutral-500">{counts.open} open tickets</p>
            </div>
            <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900 p-1 ml-1 sm:ml-3">
              <button
                onClick={onBack}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
              >
                Agencies
              </button>
              <button className="rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-white">
                Tickets
                {counts.open > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#f01546] px-1.5 py-0.5 text-[10px] font-semibold">
                    {counts.open}
                  </span>
                )}
              </button>
            </div>
          </div>
          <button
            onClick={() => setComposerOpen((open) => !open)}
            className="rounded-lg bg-[#f01546] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#f2426a]"
          >
            {composerOpen ? "Close" : "+ New ticket"}
          </button>
        </div>
      </header>

      <main className="thin-scroll flex-1 overflow-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-[1500px]">
          {composerOpen && (
            <form
              onSubmit={createTicket}
              className="mb-5 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-xl shadow-black/10"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">New ticket</h2>
                  <p className="mt-0.5 text-xs text-neutral-500">Add the agency, action and everything that needs to be sent.</p>
                </div>
                <button type="button" onClick={resetComposer} className="text-xs text-neutral-500 hover:text-white">
                  Cancel
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(180px,.8fr)_minmax(280px,1.4fr)_160px]">
                <FieldLabel label="Agency">
                  <select value={form.agencyId} onChange={(e) => setField("agencyId", e.target.value)} className="ticket-field">
                    <option value="">Select agency...</option>
                    {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
                  </select>
                </FieldLabel>
                <FieldLabel label="Action">
                  <input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Send an onboarding email" className="ticket-field" />
                </FieldLabel>
                <FieldLabel label="Due date">
                  <input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} className="ticket-field" />
                </FieldLabel>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,1.4fr)_minmax(340px,1fr)]">
                <FieldLabel label="Details / what should be said">
                  <textarea value={form.details} onChange={(e) => setField("details", e.target.value)} placeholder="Short brief, exact message or any context your friend needs..." rows={3} className="ticket-field resize-none" />
                </FieldLabel>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Tags</p>
                  <TagPicker selected={form.tags} onToggle={toggleTag} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button disabled={saving || !form.agencyId || !form.title.trim()} className="rounded-lg bg-[#f01546] px-5 py-2 text-sm font-medium disabled:opacity-40">
                  {saving ? "Adding..." : "Add ticket"}
                </button>
              </div>
            </form>
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
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50">
            <div className="thin-scroll overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-[44px_190px_minmax(310px,1.5fr)_minmax(225px,1fr)_125px_120px] gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  <span></span><span>Agency</span><span>Ticket</span><span>Contact</span><span>Due</span><span className="text-right">Actions</span>
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
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .ticket-field { width: 100%; border: 1px solid #404040; border-radius: .5rem; background: #262626; padding: .5rem .65rem; color: white; font-size: .875rem; outline: none; }
        .ticket-field:focus { border-color: #f01546; box-shadow: 0 0 0 1px rgba(240, 21, 70, .25); }
      `}</style>
    </div>
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
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${TAG_COLORS[children] || "border-neutral-600 bg-neutral-700/50 text-neutral-300"}`}>{children}</span>;
}

function TagPicker({ selected, onToggle }) {
  return <div className="flex flex-wrap gap-1.5">{TAGS.map((tag) => <button type="button" key={tag} onClick={() => onToggle(tag)} className={`rounded-full border px-2.5 py-1 text-xs transition ${selected.includes(tag) ? TAG_COLORS[tag] : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"}`}>{tag}</button>)}</div>;
}

function TicketRow({ ticket, editing, saving, onEdit, onCancelEdit, onSave, onToggle, onDelete }) {
  const overdue = isTicketOverdue(ticket);
  const agency = ticket.agency || {};
  const [draft, setDraft] = useState({ title: ticket.title, details: ticket.details || "", dueDate: ticket.due_date || "", tags: ticket.tags || [] });

  useEffect(() => {
    if (editing) setDraft({ title: ticket.title, details: ticket.details || "", dueDate: ticket.due_date || "", tags: ticket.tags || [] });
  }, [editing, ticket]);

  function toggleDraftTag(tag) {
    setDraft((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag] }));
  }

  return (
    <div className={`border-b border-neutral-800/80 last:border-0 ${overdue ? "bg-rose-950/15" : "hover:bg-neutral-900/70"}`}>
      <div className="grid grid-cols-[44px_190px_minmax(310px,1.5fr)_minmax(225px,1fr)_125px_120px] gap-3 px-3 py-3.5 text-sm">
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
          {agency.email && <a href={`mailto:${agency.email}`} className="block truncate text-sky-300 hover:underline" title={agency.email}>✉ {agency.email}</a>}
          {agency.phone && <a href={`tel:${agency.phone}`} className="block truncate text-neutral-300 hover:text-white">☎ {agency.phone}</a>}
          {agency.mobile_alt && <a href={`tel:${agency.mobile_alt}`} className="block truncate text-neutral-400 hover:text-white">Mobile: {agency.mobile_alt}</a>}
          <div className="flex flex-wrap gap-x-2 gap-y-1 pt-1 text-[11px]">
            {agency.website && <ExternalLink href={agency.website}>Website</ExternalLink>}
            {agency.oglasnik_profil && <ExternalLink href={agency.oglasnik_profil}>Oglasnik</ExternalLink>}
          </div>
          {!agency.email && !agency.phone && !agency.mobile_alt && <span className="text-neutral-600">No contact info</span>}
        </div>
        <div>
          {ticket.due_date ? <p className={overdue ? "font-medium text-rose-300" : "text-neutral-300"}>{formatDate(ticket.due_date)}{overdue && <span className="mt-1 block text-[10px] uppercase tracking-wide">Overdue</span>}</p> : <span className="text-neutral-600">No date</span>}
        </div>
        <div className="flex justify-end gap-3 text-xs">
          <button onClick={onEdit} className="h-fit text-neutral-400 hover:text-white">Edit</button>
          <button onClick={onDelete} className="h-fit text-neutral-600 hover:text-rose-400">Delete</button>
        </div>
      </div>
      {editing && (
        <div className="border-t border-neutral-800 bg-neutral-900 px-[59px] py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1.2fr)_150px]">
            <FieldLabel label="Action"><input value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} className="ticket-field" /></FieldLabel>
            <FieldLabel label="Details"><textarea value={draft.details} onChange={(e) => setDraft((current) => ({ ...current, details: e.target.value }))} rows={2} className="ticket-field resize-none" /></FieldLabel>
            <FieldLabel label="Due date"><input type="date" value={draft.dueDate} onChange={(e) => setDraft((current) => ({ ...current, dueDate: e.target.value }))} className="ticket-field" /></FieldLabel>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Tags</p><TagPicker selected={draft.tags} onToggle={toggleDraftTag} /></div>
            <div className="flex shrink-0 gap-2"><button onClick={onCancelEdit} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300">Cancel</button><button disabled={saving || !draft.title.trim()} onClick={() => onSave({ title: draft.title.trim(), details: draft.details.trim() || null, tags: draft.tags, due_date: draft.dueDate || null })} className="rounded-lg bg-[#f01546] px-4 py-1.5 text-xs font-medium disabled:opacity-40">{saving ? "Saving..." : "Save"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExternalLink({ href, children }) {
  const safeHref = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-[#f2426a] hover:underline">{children} ↗</a>;
}
