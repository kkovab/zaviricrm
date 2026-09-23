import { NextResponse } from "next/server";
import { MCP_TOOLS, callMcpTool } from "@/lib/mcpTools";

// Stateless JSON-RPC MCP endpoint. It intentionally stays dependency-free:
// the CRM only needs request/response tools and does not need sessions or an
// SSE transport. Authentication is handled with a separate shared secret so
// machine clients do not need the browser login cookie.

export const maxDuration = 30;

const SERVER_NAME = "zaviri-crm";
const SERVER_VERSION = "2.0.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

function checkAuth(request) {
  const expected = process.env.MCP_SHARED_SECRET;
  if (!expected) return false;
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

async function handleMessage(message) {
  const { id, method, params } = message || {};
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
      return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
    }
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      try {
        const data = await callMcpTool(name, args);
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] },
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${error.message || "Tool execution failed."}` }],
            isError: true,
          },
        };
      }
    }
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (error) {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error.message || "Internal error" },
    };
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
    if (body.length === 0) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } },
        { status: 400 }
      );
    }
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
