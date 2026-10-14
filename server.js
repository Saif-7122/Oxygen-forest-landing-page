const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Simple .env parser to avoid extra external dependencies
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  try {
    const lines = fs.readFileSync(envFile, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (k && !process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  } catch (err) {
    console.warn("Could not read .env file:", err.message);
  }
}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// OpenAI Conversions API (CAPI) Configuration
const OPENAI_CAPI_KEY = process.env.OPENAI_CAPI_KEY || "";
const OPENAI_PIXEL_ID = process.env.OPENAI_PIXEL_ID || "TSqRGgfEN8Dvdh1CyRhTrx";
const LEAD_WEBHOOK_URL =
  process.env.LEAD_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbybcgpvQoKFxQnoB4lHy2n3_lIlj-WFtc9pxS3qLbEOiC89NtmHfyiM2TkgKmQ7m964/exec";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Only these file types are served; repo files like .py, .gs, package.json stay private.
const PUBLIC_EXT = new Set(Object.keys(MIME).filter((e) => e !== ".json"));

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const candidates = [p];
  if (!path.extname(p)) candidates.push(p + ".html"); // /thank-you -> thank-you.html

  for (const c of candidates) {
    const file = path.normalize(path.join(ROOT, c));
    if (!file.startsWith(ROOT + path.sep)) continue;
    if (!PUBLIC_EXT.has(path.extname(file).toLowerCase())) continue;
    if (file === __filename) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

// Parse request body (JSON or URL-encoded)
function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Guard against payloads larger than 1MB
      if (body.length > 1048576) {
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        try {
          return resolve(JSON.parse(body));
        } catch {
          return resolve({});
        }
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        try {
          const params = new URLSearchParams(body);
          const data = {};
          for (const [k, v] of params.entries()) {
            data[k] = v;
          }
          return resolve(data);
        } catch {
          return resolve({});
        }
      } else {
        // Fallback: try parsing JSON first, then URLSearchParams
        try {
          return resolve(JSON.parse(body));
        } catch {
          try {
            const params = new URLSearchParams(body);
            const data = {};
            for (const [k, v] of params.entries()) {
              data[k] = v;
            }
            return resolve(data);
          } catch {
            return resolve({});
          }
        }
      }
    });
    req.on("error", () => resolve({}));
  });
}

// Send Lead Created event to OpenAI Conversions API (CAPI)
function sendOpenAICapiEvent(lead, clientIp, userAgent, isValidateOnly = false) {
  return new Promise((resolve) => {
    if (!OPENAI_CAPI_KEY || !OPENAI_PIXEL_ID) {
      console.warn("OpenAI CAPI: Missing API key or Pixel ID");
      return resolve({ skipped: true, reason: "Missing credentials" });
    }

    // Normalize phone number to E.164 if possible
    let phone = (lead.phone || "").toString().trim().replace(/[\s()-]/g, "");
    if (phone && !phone.startsWith("+")) {
      phone = phone.length === 10 ? "+91" + phone : "+" + phone;
    }
    const phoneHash = phone ? crypto.createHash("sha256").update(phone).digest("hex") : undefined;

    const email = (lead.email || "").toString().trim().toLowerCase();
    const emailHash = email ? crypto.createHash("sha256").update(email).digest("hex") : undefined;

    const userData = {};
    if (phone) userData.phone_number = phone;
    if (phoneHash) userData.phone_number_sha256 = phoneHash;
    if (email) userData.email_address = email;
    if (emailHash) userData.email_address_sha256 = emailHash;
    if (lead.name) userData.first_name = lead.name.toString().trim();
    if (clientIp) userData.client_ip_address = clientIp;
    if (userAgent) userData.client_user_agent = userAgent;

    const eventId = lead.event_id || ("lead_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9));
    const eventTime = Number(lead.timestamp_ms) || Date.now();

    const eventObj = {
      id: eventId,
      timestamp_ms: eventTime,
      type: "lead_created",
      action_source: "web",
      source_url: lead.page || "https://oxygenforest.in/",
      user: userData,
      data: {
        type: "customer_action",
      },
    };

    if (lead.oppref) {
      eventObj.oppref = lead.oppref;
    }

    const payload = {
      validate_only: !!isValidateOnly,
      integration_source: "oxygen-forest-node-server",
      events: [eventObj],
    };

    const postData = JSON.stringify(payload);

    const req = https.request(
      `https://bzr.openai.com/v1/events?pid=${encodeURIComponent(OPENAI_PIXEL_ID)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_CAPI_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 10000,
      },
      (res) => {
        let respData = "";
        res.on("data", (chunk) => (respData += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(respData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`OpenAI CAPI success: event ${eventId} accepted`);
              resolve({ ok: true, statusCode: res.statusCode, data: parsed, event_id: eventId });
            } else {
              console.error(`OpenAI CAPI error (${res.statusCode}):`, respData);
              resolve({ ok: false, statusCode: res.statusCode, data: parsed, event_id: eventId });
            }
          } catch {
            resolve({ ok: res.statusCode < 300, statusCode: res.statusCode, raw: respData, event_id: eventId });
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      console.warn("OpenAI CAPI request timed out");
      resolve({ ok: false, error: "timeout" });
    });

    req.on("error", (err) => {
      console.error("OpenAI CAPI request failed:", err.message);
      resolve({ ok: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

// Forward lead data to Google Apps Script webhook
function forwardToGoogleSheet(lead) {
  if (!LEAD_WEBHOOK_URL) return;
  try {
    const postData = new URLSearchParams({
      name: lead.name || "",
      phone: lead.phone || "",
      purpose: lead.purpose || "",
      visit: lead.visit || "",
      buyer: lead.buyer || "",
      source: lead.source || "server",
      page: lead.page || "https://oxygenforest.in/",
      gclid: lead.gclid || "",
      oppref: lead.oppref || "",
      utm_source: lead.utm_source || "",
      utm_medium: lead.utm_medium || "",
      utm_campaign: lead.utm_campaign || "",
      event_id: lead.event_id || "",
      ts: new Date().toISOString(),
    }).toString();

    const urlObj = new URL(LEAD_WEBHOOK_URL);
    const req = https.request(
      urlObj,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 8000,
      },
      (res) => {
        res.on("data", () => {});
      }
    );
    req.on("error", (err) => console.warn("Google Sheet webhook error:", err.message));
    req.write(postData);
    req.end();
  } catch (err) {
    console.warn("Could not forward lead to Google Sheet:", err.message);
  }
}

// Extract client IP address
function getClientIp(req) {
  const xForwarded = req.headers["x-forwarded-for"];
  if (xForwarded) {
    return xForwarded.split(",")[0].trim();
  }
  return req.socket ? req.socket.remoteAddress : "";
}

// Extract oppref cookie if present
function getOpprefFromCookie(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)__oppref=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

http
  .createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // CORS preflight for API requests
    if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      return res.end();
    }

    // Lead API endpoint: POST /api/lead or POST /api/capi/lead
    if (req.method === "POST" && (pathname === "/api/lead" || pathname === "/api/capi/lead")) {
      try {
        const lead = await parseRequestBody(req);
        const clientIp = getClientIp(req);
        const userAgent = req.headers["user-agent"] || "";

        if (!lead.oppref) {
          lead.oppref = getOpprefFromCookie(req);
        }

        if (!lead.event_id) {
          lead.event_id = "lead_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
        }

        // Fire CAPI event to OpenAI
        const capiResult = await sendOpenAICapiEvent(lead, clientIp, userAgent);

        // Forward to Google Sheet webhook
        forwardToGoogleSheet(lead);

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(
          JSON.stringify({
            ok: true,
            event_id: lead.event_id,
            capi: capiResult,
          })
        );
      } catch (err) {
        console.error("API /api/lead error:", err);
        res.writeHead(500, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Diagnostics / Status endpoint: GET /api/capi/test
    if (req.method === "GET" && pathname === "/api/capi/test") {
      try {
        const testEvent = {
          phone: "+918121777770",
          name: "OpenAI CAPI Diagnostic Test",
          page: "https://oxygenforest.in/",
          event_id: "diag_" + Date.now(),
        };
        const clientIp = getClientIp(req);
        const userAgent = req.headers["user-agent"] || "";
        const result = await sendOpenAICapiEvent(testEvent, clientIp, userAgent, true);

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(
          JSON.stringify({
            pixel_id: OPENAI_PIXEL_ID,
            key_configured: !!OPENAI_CAPI_KEY,
            key_preview: OPENAI_CAPI_KEY ? OPENAI_CAPI_KEY.slice(0, 15) + "..." : null,
            test_validation_result: result,
          })
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }

    // Static file serving
    let file;
    try {
      file = resolveFile(req.url);
    } catch {
      file = null;
    }

    if (!file) {
      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext],
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Server running on port ${PORT} with OpenAI CAPI enabled`));
