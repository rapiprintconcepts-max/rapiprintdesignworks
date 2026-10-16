// Cloudflare Worker: streams multipart/form-data intake submissions to Power Automate.
// Secret (set with `wrangler secret put FLOW_URL`): your Power Automate HTTP trigger URL.

const ALLOWED_ORIGINS = [
  "https://rapiprintdesignworks.com",
  "https://www.rapiprintdesignworks.com"
];
const MAX_BYTES = 90 * 1024 * 1024; // keep in sync with MAX_TOTAL_BYTES in contact.html

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function reply(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = allowed ? corsHeaders(origin) : {};

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }
    if (request.method !== "POST") {
      return reply({ ok: false, error: "Method not allowed" }, 405, cors);
    }
    if (!allowed) {
      return reply({ ok: false, error: "Origin not allowed" }, 403, cors);
    }

    // Must be multipart with a boundary; the header is forwarded verbatim.
    const contentType = request.headers.get("Content-Type") || "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
      return reply({ ok: false, error: "Expected multipart/form-data with a boundary" }, 415, cors);
    }

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_BYTES) {
      return reply({ ok: false, error: "Payload too large" }, 413, cors);
    }

    // Stream the body unchanged. Same bytes + same Content-Type = same boundary,
    // so every field and file arrives exactly as the browser built it.
    let upstream;
    try {
      upstream = await fetch(env.FLOW_URL, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: request.body
      });
    } catch (err) {
      return reply({ ok: false, error: "Could not reach the flow" }, 502, cors);
    }

    if (!upstream.ok) {
      return reply({ ok: false, error: "Flow returned " + upstream.status }, 502, cors);
    }
    return reply({ ok: true }, 200, cors);
  }
};
