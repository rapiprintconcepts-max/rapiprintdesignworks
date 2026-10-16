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
  async fetch(request, env, ctx) {
    const ref = crypto.randomUUID().slice(0, 8); // correlates browser errors with `wrangler tail` logs
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = allowed ? corsHeaders(origin) : {};

    try {
      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { status: allowed ? 204 : 403, headers: cors });
      }
      if (request.method !== "POST") {
        return reply({ ok: false, error: "Method not allowed", ref }, 405, cors);
      }
      if (!allowed) {
        console.error("[" + ref + "] Rejected origin:", JSON.stringify(origin));
        return reply({ ok: false, error: "Origin not allowed", ref }, 403, cors);
      }

      // The FLOW_URL secret must exist and be a valid https URL.
      const flowUrl = env && env.FLOW_URL;
      if (!flowUrl) {
        console.error("[" + ref + "] FLOW_URL secret is not set. Run: wrangler secret put FLOW_URL");
        return reply({ ok: false, error: "Server is not configured", ref }, 500, cors);
      }
      try {
        const parsed = new URL(flowUrl);
        if (parsed.protocol !== "https:") throw new Error("FLOW_URL must use https");
      } catch (e) {
        console.error("[" + ref + "] FLOW_URL is not a valid URL:", e && e.message);
        return reply({ ok: false, error: "Server is not configured", ref }, 500, cors);
      }

      // Must be multipart with a boundary; the header is forwarded verbatim.
      const contentType = request.headers.get("Content-Type") || "";
      if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
        console.error("[" + ref + "] Bad Content-Type:", contentType);
        return reply({ ok: false, error: "Expected multipart/form-data with a boundary", ref }, 415, cors);
      }
      if (!request.body) {
        return reply({ ok: false, error: "Empty request body", ref }, 400, cors);
      }

      const contentLength = request.headers.get("Content-Length");
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        return reply({ ok: false, error: "Payload too large", ref }, 413, cors);
      }

      // Stream the body unchanged. Same bytes + same Content-Type = same boundary,
      // so every field and file arrives exactly as the browser built it.
      const upstreamHeaders = { "Content-Type": contentType };
      if (contentLength) upstreamHeaders["Content-Length"] = contentLength; // avoid chunked encoding when size is known

      let upstream;
      try {
        upstream = await fetch(flowUrl, {
          method: "POST",
          headers: upstreamHeaders,
          body: request.body
        });
      } catch (err) {
        console.error("[" + ref + "] Could not reach the flow:", err && err.message ? err.message : err);
        return reply({ ok: false, error: "Could not reach the flow", ref }, 502, cors);
      }

      if (!upstream.ok) {
        let detail = "";
        try { detail = (await upstream.text()).slice(0, 500); } catch (e) { /* ignore */ }
        console.error("[" + ref + "] Flow returned " + upstream.status + ":", detail);
        return reply({ ok: false, error: "Flow returned " + upstream.status, ref }, 502, cors);
      }

      // Release the upstream response body; we only need the status.
      try { await upstream.arrayBuffer(); } catch (e) { /* ignore */ }

      return reply({ ok: true, ref }, 200, cors);
    } catch (err) {
      // Last-resort guard so the browser always gets a valid Response with CORS headers.
      console.error("[" + ref + "] Unhandled Worker error:", err && err.stack ? err.stack : err);
      return reply({ ok: false, error: "Internal error", ref }, 500, cors);
    }
  }
};
