import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// A tiny MCP (Model Context Protocol) server, exposed as a single HTTP
// endpoint, so an AI tool you already use (Claude Code, Codex, etc) can be
// pointed at it as a remote MCP server and pull from / write to this CRM's
// data directly. That AI already knows how to search the web on its own -
// these tools aren't for that. They're for the other half: get the list of
// agencies that still need a phone/mobile number, and save back whatever
// the AI finds.
//
// Auth: a single static shared secret (MCP_SHARED_SECRET, set in Vercel's
// environment variables), sent as a bearer token: `Authorization: Bearer
// <secret>`. This endpoint is exempt from the app's normal cookie-based
// login (see middleware.js) since it's called by a tool, not a browser.
//
// This is a stateless server - it doesn't remember anything between calls,
// and doesn't push messages to the client - so on every request it just
// reads one JSON-RPC message in, and writes one JSON-RPC message out. That
// keeps it simple and lets it run as a normal serverless function.

export const maxDuration = 30;

const SERVER_NAME = "zaviri-crm";
const SERVER_VERSION = "1.0.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// The only fields update_agency_contact is allowed to touch - deliberately
// narrow, so a tool call from an AI agent can never touch status, notes,
// follow-ups, or anything else in the CRM.
const CONTACT_FIELDS = ["contact_person", "phone", "mobile_alt", "email", "website", "oglasnik_profil"];

// agency_overview (a view) has a computed "status" name column; the raw
// agencies table (used for writes) does not - it has status_id instead -
// so reads and the post-update select use separate field lists.
const AGENCY_CONTACT_FIELDS = "id, name, location, contact_person, phone, mobile_alt, email, website, oglasnik_profil";
const AGENCY_LIST_SELECT = `${AGENCY_CONTACT_FIELDS}, status`;

const TOOLS = [
  {
    name: "list_agencies",
    description:
      "List agencies from the CRM. Set missing_contact_only to true to get just the ones with no phone AND no mobile number on file - a work queue for finding contact info. Use search to filter by name.",
    inputSchema: {
      type: "object",
      properties: {
        missing_contact_only: {
          type: "boolean",
          description: "Only return agencies with no phone AND no mobile_alt on file. Default false.",
        },
        search: {
          type: "string",
          description: "Filter by agency name (partial match, case-insensitive).",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 50, max 200).",
        },
      },
    },
  },
  {
    name: "get_agency",
    description:
      "Look up one or more agencies by exact id or by name (partial match). Returns full contact details plus notes. Provide id or name, not both.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The agency's id (UUID)." },
        name: { type: "string", description: "Agency name or partial name to search for." },
      },
    },
  },
  {
    name: "update_agency_contact",
    description:
      "Save contact info you found for an agency back into the CRM. Only touches contact fields (contact_person, phone, mobile_alt, email, website, oglasnik_profil) - never status, notes, or anything else. Provide the agency's id (from list_agencies or get_agency) and only the fields you want to set.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The agency's id (UUID)." },
        contact_person: { type: "string" },
        phone: { type: "string" },
        mobile_alt: { type: "string" },
        email: { type: "string" },
        website: { type: "string" },
        oglasnik_profil: { type: "string" },
      },
      required: ["id"],
    },
  },
];

// ---- Auth ----

function checkAuth(request) {
  const expected = process.env.MCP_SHARED_SECRET;
  if (!expected) return false; // fail closed if the secret isn't configured
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(token) && token === expected;
}

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
  );
}

// ---- Tool implementations ----

async function listAgencies({ missing_contact_only, search, limit } = {}) {
  const supabase = supabaseServer();
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);

  // Fetch a generous batch and filter/cap in JS rather than leaning on
  // PostgREST's OR-filter query string syntax for the "both empty" case -
  // plain truthiness checks here are easy to get right and easy to verify.
  let query = supabase.from("agency_overview").select(AGENCY_LIST_SELECT).order("name", { ascending: true }).limit(500);
  if (search && search.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = data || [];
  if (missing_contact_only) {
    rows = rows.filter((r) => !r.phone && !r.mobile_alt);
  }
  return rows.slice(0, cap);
}

async function getAgency({ id, name } = {}) {
  if (!id && !name) throw new Error("Provide either id or name.");

  const supabase = supabaseServer();
  let query = supabase
    .from("agency_overview")
    .select(`${AGENCY_LIST_SELECT}, notes`)
    .limit(10);

  query = id ? query.eq("id", id) : query.ilike("name", `%${name.trim()}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function updateAgencyContact({ id, ...fields } = {}) {
  if (!id) throw new Error("id is required.");

  const update = {};
  for (const key of CONTACT_FIELDS) {
    if (key in fields && fields[key] !== undefined) update[key] = fields[key];
  }
  if (Object.keys(update).length === 0) {
    throw new Error(
      `Provide at least one contact field to update (${CONTACT_FIELDS.join(", ")}).`
    );
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("agencies")
    .update(update)
    .eq("id", id)
    .select(AGENCY_CONTACT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function callTool(name, args) {
  if (name === "list_agencies") {
    const rows = await listAgencies(args);
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  }
  if (name === "get_agency") {
    const rows = await getAgency(args);
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  }
  if (name === "update_agency_contact") {
    const row = await updateAgencyContact(args);
    return { content: [{ type: "text", text: JSON.stringify(row, null, 2) }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ---- JSON-RPC / MCP message handling ----

async function handleMessage(msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined;

  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      };
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return null;
    }
    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    }
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      try {
        const result = await callTool(name, args);
        return { jsonrpc: "2.0", id, result };
      } catch (err) {
        // A tool-execution error goes back as a normal result with
        // isError set, per the MCP spec - not a JSON-RPC protocol error.
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true },
        };
      }
    }
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (err) {
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32603, message: err.message || "Internal error" } };
  }
}

export async function POST(request) {
  if (!checkAuth(request)) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(handleMessage))).filter(Boolean);
    if (responses.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(responses);
  }

  const response = await handleMessage(body);
  if (response === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}

export async function GET(request) {
  if (!checkAuth(request)) return unauthorized();
  // This server never pushes messages on its own, so it doesn't offer an
  // SSE stream on GET - returning 405 here is valid per the MCP spec for a
  // server that only responds to requests.
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
    },
  });
}
