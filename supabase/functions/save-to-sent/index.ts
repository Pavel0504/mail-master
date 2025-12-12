// save-sent-json-auto-prefix.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * JSON input: { email, password, message_body }
 * This variant:
 * - buffers message_body (with MAX limits)
 * - tries candidate mailboxes, preferring INBOX.* variants
 * - if server suggests prefix ("should probably be prefixed with: INBOX.") it auto-retries with that prefix
 * - will NOT write message body unless server returned '+' continuation
 */ const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
const ENV = {
  MAX_REQUEST_BYTES: Number(Deno.env.get("MAX_REQUEST_BYTES") || 5 * 1024 * 1024),
  MAX_MESSAGE_BYTES: Number(Deno.env.get("MAX_MESSAGE_BYTES") || 5 * 1024 * 1024),
  IMAP_OP_TIMEOUT_MS: Number(Deno.env.get("IMAP_OP_TIMEOUT_MS") || 15_000),
  IMAP_READ_TIMEOUT_MS: Number(Deno.env.get("IMAP_READ_TIMEOUT_MS") || 8_000),
  REQUEST_TOTAL_TIMEOUT_MS: Number(Deno.env.get("REQUEST_TOTAL_TIMEOUT_MS") || 30_000),
  MAX_MAILBOX_ATTEMPTS: Number(Deno.env.get("MAX_MAILBOX_ATTEMPTS") || 6)
};
function nowMs() {
  return Date.now();
}
async function withTimeout(p, ms, msg = "operation timed out") {
  let timer;
  const timeout = new Promise((_, reject)=>{
    timer = setTimeout(()=>reject(new Error(msg)), ms);
  });
  try {
    return await Promise.race([
      p,
      timeout
    ]);
  } finally{
    if (timer) clearTimeout(timer);
  }
}
Deno.serve(async (req)=>{
  const execId = crypto.randomUUID();
  const startAll = nowMs();
  console.log(`[${execId}] entry method=${req.method} ts=${new Date().toISOString()}`);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  const handler = (async ()=>{
    try {
      // read request fully but with a hard limit
      const contentLengthHeader = req.headers.get("content-length");
      if (contentLengthHeader) {
        const cl = Number(contentLengthHeader);
        if (!Number.isFinite(cl) || cl <= 0) {
          return new Response(JSON.stringify({
            success: false,
            error: "Invalid Content-Length"
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
        if (cl > ENV.MAX_REQUEST_BYTES) {
          return new Response(JSON.stringify({
            success: false,
            error: `Payload too large (${cl} > ${ENV.MAX_REQUEST_BYTES})`
          }), {
            status: 413,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
      }
      const reader = req.body?.getReader();
      if (!reader) {
        return new Response(JSON.stringify({
          success: false,
          error: "Request body missing"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      const parts = [];
      let received = 0;
      for(;;){
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.length;
          if (received > ENV.MAX_REQUEST_BYTES) {
            return new Response(JSON.stringify({
              success: false,
              error: `Payload too large (streamed > ${ENV.MAX_REQUEST_BYTES})`
            }), {
              status: 413,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          }
          parts.push(value);
        }
      }
      const requestBytes = concatUint8Arrays(parts);
      console.log(`[${execId}] received ${requestBytes.length} request bytes`);
      // parse JSON
      let payload;
      try {
        payload = JSON.parse(new TextDecoder().decode(requestBytes));
      } catch (e) {
        console.warn(`[${execId}] invalid JSON: ${String(e)}`);
        return new Response(JSON.stringify({
          success: false,
          error: "Invalid JSON body"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      const email = payload?.email;
      const password = payload?.password;
      const messageBody = payload?.message_body;
      if (!email || !password || typeof messageBody !== "string") {
        return new Response(JSON.stringify({
          success: false,
          error: "Missing required fields: email, password, message_body"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      // prepare message bytes
      const encoder = new TextEncoder();
      const msgStr = messageBody.endsWith("\r\n") ? messageBody : messageBody + "\r\n";
      const messageBytes = encoder.encode(msgStr);
      const literalSize = messageBytes.length;
      console.log(`[${execId}] message size ${literalSize} bytes`);
      if (literalSize > ENV.MAX_MESSAGE_BYTES) {
        return new Response(JSON.stringify({
          success: false,
          error: `Message too large (${literalSize} > ${ENV.MAX_MESSAGE_BYTES})`
        }), {
          status: 413,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      // connect to IMAP
      const imapHost = Deno.env.get("IMAP_HOST") || "imap.hostinger.com";
      const imapPort = Number(Deno.env.get("IMAP_PORT") || "993");
      let conn = null;
      let tlsConn = null;
      const safeClose = (c)=>{
        try {
          c?.close();
        } catch (e) {}
      };
      try {
        conn = await withTimeout(Deno.connect({
          hostname: imapHost,
          port: imapPort,
          transport: "tcp"
        }), ENV.IMAP_OP_TIMEOUT_MS, "imap connect timed out");
        tlsConn = await withTimeout(Deno.startTls(conn, {
          hostname: imapHost
        }), ENV.IMAP_OP_TIMEOUT_MS, "imap startTls timed out");
        const decoder = new TextDecoder();
        const encLocal = new TextEncoder();
        const readOnce = async (timeoutMs = ENV.IMAP_READ_TIMEOUT_MS)=>{
          const buf = new Uint8Array(8192);
          const n = await withTimeout(tlsConn.read(buf), timeoutMs, "imap read timed out");
          if (n === null) return "";
          return decoder.decode(buf.subarray(0, n));
        };
        const writeLine = async (line)=>{
          console.log(`[${execId}] -> ${truncateForLog(line, 180)}`);
          await withTimeout(tlsConn.write(encLocal.encode(line + "\r\n")), ENV.IMAP_OP_TIMEOUT_MS, "imap write timed out");
        };
        // greeting
        let greeting = "";
        for(;;){
          const chunk = await readOnce();
          greeting += chunk;
          if (greeting.length > 0) break;
        }
        console.log(`[${execId}] imap greeting snippet="${truncateForLog(greeting, 200)}"`);
        // login
        const tagLogin = `A${Math.floor(Math.random() * 9000 + 1000)}`;
        await writeLine(`${tagLogin} LOGIN "${email.replace(/"/g, '\\"')}" "${password.replace(/"/g, '\\"')}"`);
        let loginResp = "";
        for(;;){
          const chunk = await readOnce();
          loginResp += chunk;
          if (loginResp.includes(`${tagLogin} OK`) || loginResp.includes(`${tagLogin} NO`) || loginResp.includes(`${tagLogin} BAD`)) break;
        }
        console.log(`[${execId}] login snippet="${truncateForLog(loginResp, 400)}"`);
        if (!loginResp.includes(`${tagLogin} OK`)) throw new Error(`IMAP login failed: ${truncateForLog(loginResp, 800)}`);
        // candidate mailboxes (prioritize INBOX.*)
        const baseCandidates = [
          'Sent',
          'Sent Messages',
          'Sent Items',
          'Отправленные',
          '[Gmail]/Sent Mail'
        ];
        const tried = new Set();
        // construct initial candidates: with INBOX. prefix first, then raw
        const candidates = [];
        for (const b of baseCandidates){
          candidates.push(`INBOX.${b}`);
        }
        for (const b of baseCandidates){
          candidates.push(b);
        }
        let appended = false;
        let attempts = 0;
        while(candidates.length > 0 && attempts < ENV.MAX_MAILBOX_ATTEMPTS){
          const mailbox = candidates.shift();
          if (tried.has(mailbox)) continue;
          tried.add(mailbox);
          attempts++;
          const tagAppend = `A${Math.floor(Math.random() * 9000 + 1000)}`;
          const appendCmd = `${tagAppend} APPEND "${mailbox}" {${literalSize}}`;
          await writeLine(appendCmd);
          // read response until either '+' or tag response (OK/NO/BAD)
          let contResp = "";
          for(;;){
            const chunk = await readOnce();
            contResp += chunk;
            // stop as soon as we see continuation or final tag for this append
            if (contResp.includes("+") || contResp.includes(`${tagAppend} OK`) || contResp.includes(`${tagAppend} NO`) || contResp.includes(`${tagAppend} BAD`)) break;
          }
          console.log(`[${execId}] append continuation snippet="${truncateForLog(contResp, 400)}"`);
          // If server suggests prefix, auto-enqueue prefixed mailbox if not tried
          const prefixMatch = contResp.match(/prefixed with:\s*([^\)\r\n]+)/i);
          if (prefixMatch) {
            const suggested = prefixMatch[1].trim();
            // suggested might include trailing punctuation, trim non-alphanum chars
            const sanitized = suggested.replace(/[^\w\[\]\/\.-]+$/g, "");
            const suggestedMailbox = sanitized + (mailbox.startsWith(sanitized) ? "" : mailbox);
            if (!tried.has(suggestedMailbox)) {
              console.log(`[${execId}] server suggested prefix '${sanitized}', will try mailbox '${suggestedMailbox}' next`);
              candidates.unshift(suggestedMailbox); // try immediately
              continue;
            }
          }
          // If server asked for continuation '+', then we can send message body.
          if (contResp.includes("+")) {
            console.log(`[${execId}] server requested literal continuation for mailbox '${mailbox}' — writing ${literalSize} bytes`);
            // write body (single write)
            await withTimeout(tlsConn.write(messageBytes), ENV.IMAP_OP_TIMEOUT_MS, "imap write message timed out");
            await withTimeout(tlsConn.write(encLocal.encode("\r\n")), ENV.IMAP_OP_TIMEOUT_MS, "imap write CRLF timed out");
            // read final response for this append
            let appendResp = "";
            for(;;){
              const chunk = await readOnce();
              appendResp += chunk;
              if (appendResp.includes(`${tagAppend} OK`) || appendResp.includes(`${tagAppend} NO`) || appendResp.includes(`${tagAppend} BAD`)) break;
            }
            console.log(`[${execId}] append response snippet="${truncateForLog(appendResp, 800)}"`);
            if (appendResp.includes(`${tagAppend} OK`)) {
              appended = true;
              console.log(`[${execId}] APPEND OK for '${mailbox}'`);
              break;
            } else {
              console.warn(`[${execId}] APPEND failed for '${mailbox}'. Trying next candidate if any.`);
              continue;
            }
          } else {
            // server didn't return '+' — skip this mailbox and try next
            console.log(`[${execId}] server did NOT request literal for '${mailbox}' — skip and try next candidate`);
            continue;
          }
        } // end mailbox loop
        // logout best-effort
        try {
          await writeLine(`A999 LOGOUT`);
        } catch (e) {}
        safeClose(tlsConn);
        safeClose(conn);
        const totalTime = nowMs() - startAll;
        console.log(`[${execId}] finished in ${totalTime}ms appended=${appended} attempts=${attempts}`);
        if (appended) {
          return new Response(JSON.stringify({
            success: true,
            message: "Appended to Sent (or equivalent)"
          }), {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: "Could not append message to any candidate mailbox. See logs."
          }), {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
      } catch (e) {
        safeClose(tlsConn);
        safeClose(conn);
        console.error(`[${execId}] internal error:`, e instanceof Error ? e.message : String(e));
        return new Response(JSON.stringify({
          success: false,
          error: String(e)
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    } catch (err) {
      console.error(`[${execId}] top-level handler error:`, err instanceof Error ? err.message : String(err));
      return new Response(JSON.stringify({
        success: false,
        error: String(err)
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
  })();
  try {
    return await withTimeout(handler, ENV.REQUEST_TOTAL_TIMEOUT_MS, "request handler timed out");
  } catch (e) {
    console.error(`[${execId}] handler timeout/error:`, e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e)
    }), {
      status: 504,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
// helpers
function concatUint8Arrays(parts) {
  if (parts.length === 0) return new Uint8Array();
  if (parts.length === 1) return parts[0];
  let total = 0;
  for (const p of parts)total += p.length;
  const res = new Uint8Array(total);
  let offset = 0;
  for (const p of parts){
    res.set(p, offset);
    offset += p.length;
  }
  return res;
}
function truncateForLog(s, max = 200) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + `...[${s.length} chars]` : s;
}
