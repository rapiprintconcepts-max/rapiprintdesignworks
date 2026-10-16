// Cloudflare Worker: streams multipart/form-data intake submissions to Power Automate.
// Secret (set with `wrangler secret put FLOW_URL`): your Power Automate HTTP trigger URL.

const ALLOWED_ORIGIN = "https://rapiprintdesignworks.com";
const MAX_BYTES = 90 * 1024 * 1024; // keep in sync with MAX_TOTAL_BYTES in contact.html

// Fixed CORS headers, sent on every response (including preflight).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};

function reply(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

export default {
  async fetch(request, env, ctx) {
    const ref = crypto.randomUUID().slice(0, 8); // correlates browser errors with `wrangler tail` logs

    try {
      // CORS preflight: 200, same CORS headers, no body.
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
      }

      const origin = request.headers.get("Origin") || "";

      if (request.method !== "POST") {
        return reply({ ok: false, error: "Method not allowed", ref }, 405);
      }
      if (origin !== ALLOWED_ORIGIN) {
        console.error("[" + ref + "] Rejected origin:", JSON.stringify(origin));
        return reply({ ok: false, error: "Origin not allowed", ref }, 403);
      }

      // The FLOW_URL secret must exist and be a valid https URL.
      const flowUrl = env && env.FLOW_URL;
      if (!flowUrl) {
        console.error("[" + ref + "] FLOW_URL secret is not set. Run: wrangler secret put FLOW_URL");
        return reply({ ok: false, error: "Server is not configured", ref }, 500);
      }
      try {
        const parsed = new URL(flowUrl);
        if (parsed.protocol !== "https:") throw new Error("FLOW_URL must use https");
      } catch (e) {
        console.error("[" + ref + "] FLOW_URL is not a valid URL:", e && e.message);
        return reply({ ok: false, error: "Server is not configured", ref }, 500);
      }

      // Must be multipart with a boundary; the header is forwarded verbatim.
      const contentType = request.headers.get("Content-Type") || "";
      if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
        console.error("[" + ref + "] Bad Content-Type:", contentType);
        return reply({ ok: false, error: "Expected multipart/form-data with a boundary", ref }, 415);
      }
      if (!request.body) {
        return reply({ ok: false, error: "Empty request body", ref }, 400);
      }

      const contentLength = request.headers.get("Content-Length");
      if (contentLength && Number(contentLength) > MAX_BYTES) {
        return reply({ ok: false, error: "Payload too large", ref }, 413);
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
        return reply({ ok: false, error: "Could not reach the flow", ref }, 502);
      }

      if (!upstream.ok) {
        let detail = "";
        try { detail = (await upstream.text()).slice(0, 500); } catch (e) { /* ignore */ }
        console.error("[" + ref + "] Flow returned " + upstream.status + ":", detail);
        return reply({ ok: false, error: "Flow returned " + upstream.status, ref }, 502);
      }

      // Release the upstream response body; we only need the status.
      try { await upstream.arrayBuffer(); } catch (e) { /* ignore */ }

      return reply({ ok: true, ref }, 200);
    } catch (err) {
      // Last-resort guard so the browser always gets a valid Response with CORS headers.
      console.error("[" + ref + "] Unhandled Worker error:", err && err.stack ? err.stack : err);
      return reply({ ok: false, error: "Internal error", ref }, 500);
    }
  }
};
