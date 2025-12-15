import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendEmailRequest {
  recipient_id: string;
}

async function checkFetch(res: Response, url: string) {
  // Читаем тело ровно один раз, логируем при ошибке, парсим JSON если возможно
  const text = await res.text();
  if (!res.ok) {
    console.error(`Fetch error ${res.status} ${url}: ${text}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Fetch ${url} failed: ${res.status} ${text}`);
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let recipient_id: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
      return new Response(
        JSON.stringify({ success: false, message: "Server misconfiguration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- AUTH DETECTION ---
    const authHeader = req.headers.get("authorization") || "";
    const apikeyHeader = req.headers.get("apikey") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = token === supabaseServiceKey || apikeyHeader === supabaseServiceKey;

    console.log("send-email: headers present:", {
      hasAuthorization: Boolean(authHeader),
      hasApikey: Boolean(apikeyHeader),
      isServiceRole,
    });

    if (!isServiceRole) {
      return new Response(
        JSON.stringify({ code: 401, message: "Invalid or missing service role key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const svcHeaders = {
      "apikey": supabaseServiceKey,
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    };

    const requestBody = await req.json() as SendEmailRequest;
    recipient_id = requestBody.recipient_id;

    // Получаем запись получателя + связи
    const recipientUrl = `${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}&select=*,mailing:mailings(*),contact:contacts(*),sender_email:emails(*)`;
    const recipientRes = await fetch(recipientUrl, { headers: svcHeaders });
    const recipients = await checkFetch(recipientRes, recipientUrl);

    if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
      throw new Error("Recipient not found");
    }

    const recipient = Array.isArray(recipients) ? recipients[0] : recipients;
    const { mailing, contact, sender_email } = recipient;

    if (recipient.status !== "pending") {
      return new Response(
        JSON.stringify({ success: false, message: "Already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Получаем контент письма из подгруппы контакта
    let emailSubject = "";
    let emailTextContent: string | null = null;
    let emailHtmlContent: string | null = null;

    // Загружаем подгруппы контакта
    const groupMembersUrl = `${supabaseUrl}/rest/v1/contact_group_members?contact_id=eq.${contact.id}&select=group_id`;
    const groupMembersRes = await fetch(groupMembersUrl, { headers: svcHeaders });
    const groupMembers = await checkFetch(groupMembersRes, groupMembersUrl);

    if (groupMembers && Array.isArray(groupMembers) && groupMembers.length > 0) {
      const groupId = groupMembers[0].group_id;
      const groupUrl = `${supabaseUrl}/rest/v1/contact_groups?id=eq.${groupId}&select=default_subject,default_text_content,default_html_content`;
      const groupRes = await fetch(groupUrl, { headers: svcHeaders });
      const groups = await checkFetch(groupRes, groupUrl);
      if (groups && Array.isArray(groups) && groups.length > 0) {
        const group = groups[0];
        emailSubject = group.default_subject || "";
        emailTextContent = group.default_text_content || null;
        emailHtmlContent = group.default_html_content || null;
      }
    }

    // fallback to mailing content
    if (!emailSubject && mailing?.subject) emailSubject = mailing.subject;
    if (!emailTextContent && mailing?.text_content) emailTextContent = mailing.text_content;
    if (!emailHtmlContent && mailing?.html_content) emailHtmlContent = mailing.html_content;

    if (!emailTextContent && !emailHtmlContent) {
      throw new Error("No email content");
    }

    // Random delay (anti-spam)
    const minDelay = 8000;
    const maxDelay = 25000;
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    console.log(`Waiting ${randomDelay}ms before sending email to ${contact.email}`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    const contactName = contact.name || "";
    const replaceNamePlaceholder = (text: string) => text.replace(/\[NAME\]/g, contactName);

    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.hostinger.com";
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = sender_email.email;
    const smtpPass = sender_email.password;

    let emailBody = "";

    const dateHeader = new Date().toUTCString();
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${smtpHost}>`;

    emailBody += `From: ${smtpUser}\r\n`;
    emailBody += `To: ${contact.email}\r\n`;
    emailBody += `Subject: ${replaceNamePlaceholder(emailSubject)}\r\n`;
    emailBody += `Date: ${dateHeader}\r\n`;
    emailBody += `Message-ID: ${messageId}\r\n`;
    emailBody += `MIME-Version: 1.0\r\n`;

    const hasText = !!emailTextContent;
    const hasHtml = !!emailHtmlContent;

    if (hasText && hasHtml) {
      const processedText = replaceNamePlaceholder(emailTextContent as string);
      const processedHtml = replaceNamePlaceholder(emailHtmlContent as string);
      const textAsHtml = processedText.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>').replace(/\r/g, '<br>');
      emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
      emailBody += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
      emailBody += `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${textAsHtml}</div>\r\n<br>\r\n${processedHtml}\r\n`;
    } else if (hasText) {
      emailBody += `Content-Type: text/plain; charset=UTF-8\r\n`;
      emailBody += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
      emailBody += `${replaceNamePlaceholder(emailTextContent as string)}\r\n`;
    } else {
      emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
      emailBody += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
      emailBody += `${replaceNamePlaceholder(emailHtmlContent as string)}\r\n`;
    }

    // SMTP send
    const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort, transport: "tcp" });
    const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const readLine = async () => {
      const buffer = new Uint8Array(4096);
      const n = await tlsConn.read(buffer);
      if (n === null) return "";
      return decoder.decode(buffer.subarray(0, n));
    };
    const writeLine = async (line: string) => {
      await tlsConn.write(encoder.encode(line + "\r\n"));
    };

    await readLine();
    await writeLine(`EHLO ${smtpHost}`);
    await readLine();

    await writeLine("AUTH LOGIN");
    await readLine();

    await writeLine(btoa(smtpUser));
    await readLine();

    await writeLine(btoa(smtpPass));
    const authResponse = await readLine();
    if (!authResponse.startsWith("235")) {
      tlsConn.close();
      throw new Error("SMTP authentication failed: " + authResponse);
    }

    await writeLine(`MAIL FROM:<${smtpUser}>`);
    await readLine();

    await writeLine(`RCPT TO:<${contact.email}>`);
    const rcptResponse = await readLine();
    if (!rcptResponse.startsWith("250")) {
      tlsConn.close();
      throw new Error("Recipient rejected: " + rcptResponse);
    }

    await writeLine("DATA");
    await readLine();

    await writeLine(emailBody);
    await writeLine(".");
    const sendResponse = await readLine();
    if (!sendResponse.startsWith("250")) {
      tlsConn.close();
      throw new Error("Send failed: " + sendResponse);
    }

    await writeLine("QUIT");
    tlsConn.close();

    // Save to Sent (fire-and-forget) — обязательно передаём svcHeaders (apikey)
    (async () => {
      try {
        console.log(`Saving email to Sent folder for ${smtpUser}`);
        const saveUrl = `${supabaseUrl}/functions/v1/save-to-sent`;
        const saveResponse = await fetch(saveUrl, {
          method: "POST",
          headers: svcHeaders,
          body: JSON.stringify({
            email: smtpUser,
            password: smtpPass,
            message_body: emailBody,
          }),
        });
        try {
          const saveResult = await checkFetch(saveResponse, saveUrl);
          if (saveResult && (saveResult as any).success) {
            console.log("Email successfully saved to Sent folder");
          } else {
            console.warn("Failed to save to Sent folder:", saveResult);
          }
        } catch (e) {
          console.warn("Save-to-sent failed:", e);
        }
      } catch (saveError) {
        console.error("Error saving email to Sent folder:", saveError);
      }
    })();

    // Обновляем статус получателя
    const patchRecipientUrl = `${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}`;
    await fetch(patchRecipientUrl, {
      method: "PATCH",
      headers: { ...svcHeaders, "Prefer": "return=minimal" },
      body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString() }),
    });

    // Получаем информацию о рассылке для обновления счетчиков
    const mailingId = recipient.mailing_id;
    const mailingUrl = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}&select=sent_count,success_count`;
    const mailingRes = await fetch(mailingUrl, { headers: svcHeaders });
    const mailingData = await checkFetch(mailingRes, mailingUrl);
    const currentMailing = mailingData && Array.isArray(mailingData) ? mailingData[0] : mailingData;

    if (currentMailing) {
      const updateMailingUrl = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`;
      await fetch(updateMailingUrl, {
        method: "PATCH",
        headers: { ...svcHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify({
          sent_count: (currentMailing.sent_count || 0) + 1,
          success_count: (currentMailing.success_count || 0) + 1,
        }),
      });
    }

    // Проверяем pending recipients
    const pendingUrl = `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailingId}&status=eq.pending&select=id`;
    const pendingRes = await fetch(pendingUrl, { headers: svcHeaders });
    const pendingRecipients = await checkFetch(pendingRes, pendingUrl);

    if (!pendingRecipients || (Array.isArray(pendingRecipients) && pendingRecipients.length === 0)) {
      const completeUrl = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`;
      await fetch(completeUrl, {
        method: "PATCH",
        headers: { ...svcHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify({ status: "completed" }),
      });
    }

    // Update sender email counters
    const updateEmailUrl = `${supabaseUrl}/rest/v1/emails?id=eq.${sender_email.id}`;
    await fetch(updateEmailUrl, {
      method: "PATCH",
      headers: { ...svcHeaders, "Prefer": "return=minimal" },
      body: JSON.stringify({
        sent_count: (sender_email.sent_count || 0) + 1,
        success_count: (sender_email.success_count || 0) + 1,
      }),
    });

    // Create ping tracking
    const pingUrl = `${supabaseUrl}/rest/v1/mailing_ping_tracking`;
    const pingRes = await fetch(pingUrl, {
      method: "POST",
      headers: { ...svcHeaders, "Prefer": "return=representation" },
      body: JSON.stringify({
        mailing_recipient_id: recipient_id,
        initial_sent_at: new Date().toISOString(),
        response_received: false,
        ping_sent: false,
        status: "awaiting_response",
      }),
    });
    const pingData = await checkFetch(pingRes, pingUrl);
    console.log("Ping tracking created:", pingData);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Error:", errMsg);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const svcHeaders = {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      };

      if (recipient_id) {
        const patchFailUrl = `${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}`;
        await fetch(patchFailUrl, {
          method: "PATCH",
          headers: { ...svcHeaders, "Prefer": "return=minimal" },
          body: JSON.stringify({ status: "failed", error_message: errMsg }),
        }).catch(() => {});

        // Попытка обновить счётчики и финальный статус — best effort
        try {
          const recipientInfoUrl = `${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}&select=mailing_id,sender_email_id`;
          const recipientInfoRes = await fetch(recipientInfoUrl, { headers: svcHeaders });
          const recipientInfo = await checkFetch(recipientInfoRes, recipientInfoUrl);
          const recipientData = Array.isArray(recipientInfo) ? recipientInfo[0] : recipientInfo;

          if (recipientData) {
            const mailingId = recipientData.mailing_id;
            const senderEmailId = recipientData.sender_email_id;

            const mailingStatsUrl = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}&select=sent_count,failed_count,success_count`;
            const mailingStatsRes = await fetch(mailingStatsUrl, { headers: svcHeaders });
            const mailingStatsData = await checkFetch(mailingStatsRes, mailingStatsUrl);
            const mailingStats = Array.isArray(mailingStatsData) ? mailingStatsData[0] : mailingStatsData;

            if (mailingStats) {
              const updateMailingUrl = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`;
              await fetch(updateMailingUrl, {
                method: "PATCH",
                headers: { ...svcHeaders, "Prefer": "return=minimal" },
                body: JSON.stringify({
                  sent_count: (mailingStats.sent_count || 0) + 1,
                  failed_count: (mailingStats.failed_count || 0) + 1,
                }),
              }).catch(() => {});
            }

            // Проверяем pending recipients и финальный статус
            const pendingUrl = `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailingId}&status=eq.pending&select=id`;
            const pendingRes = await fetch(pendingUrl, { headers: svcHeaders });
            const pendingRecipients = await checkFetch(pendingRes, pendingUrl);
            if (!pendingRecipients || (Array.isArray(pendingRecipients) && pendingRecipients.length === 0)) {
              const mailingStatsUrl2 = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}&select=success_count,failed_count`;
              const mailingStatsRes2 = await fetch(mailingStatsUrl2, { headers: svcHeaders });
              const mailingStatsData2 = await checkFetch(mailingStatsRes2, mailingStatsUrl2);
              const stats = Array.isArray(mailingStatsData2) ? mailingStatsData2[0] : mailingStatsData2;
              if (stats) {
                const finalStatus = (stats.success_count || 0) > 0 ? "completed" : "failed";
                const finalUrl = `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`;
                await fetch(finalUrl, {
                  method: "PATCH",
                  headers: { ...svcHeaders, "Prefer": "return=minimal" },
                  body: JSON.stringify({ status: finalStatus }),
                }).catch(() => {});
              }
            }

            // Update sender email counters best-effort
            if (senderEmailId) {
              const emailStatsUrl = `${supabaseUrl}/rest/v1/emails?id=eq.${senderEmailId}&select=sent_count,failed_count`;
              const emailStatsRes = await fetch(emailStatsUrl, { headers: svcHeaders });
              const emailStatsData = await checkFetch(emailStatsRes, emailStatsUrl);
              const emailStats = Array.isArray(emailStatsData) ? emailStatsData[0] : emailStatsData;
              if (emailStats) {
                const updateEmailUrl = `${supabaseUrl}/rest/v1/emails?id=eq.${senderEmailId}`;
                await fetch(updateEmailUrl, {
                  method: "PATCH",
                  headers: { ...svcHeaders, "Prefer": "return=minimal" },
                  body: JSON.stringify({
                    sent_count: (emailStats.sent_count || 0) + 1,
                    failed_count: (emailStats.failed_count || 0) + 1,
                  }),
                }).catch(() => {});
              }
            }
          }
        } catch (inner) {
          console.error("Failed to update counters in error handler:", inner);
        }
      }
    } catch (outer) {
      console.error("Error during failure handling:", outer);
    }

    return new Response(
      JSON.stringify({ success: false, message: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
