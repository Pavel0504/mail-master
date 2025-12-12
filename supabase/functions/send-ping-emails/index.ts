import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // Получаем все ping tracking записи, которые ждут ответа и прошло достаточно времени
    const trackingsRes = await fetch(`${supabaseUrl}/rest/v1/mailing_ping_tracking?status=eq.awaiting_response&select=*,recipient:mailing_recipients!mailing_ping_tracking_mailing_recipient_id_fkey(id,contact:contacts(id,email,name),sender_email:emails(id,email,password),mailing:mailings(id,user_id))`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`
      }
    });
    const trackings = await trackingsRes.json();
    if (!trackings || trackings.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No ping emails to send",
        sent: 0
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    let sentCount = 0;
    let skippedCount = 0;
    for (const tracking of trackings){
      try {
        const contact = tracking.recipient?.contact;
        const senderEmail = tracking.recipient?.sender_email;
        if (!contact || !senderEmail) {
          skippedCount++;
          continue;
        }
        // Получаем глобальные настройки пинг-системы
        const { data: pingSettings } = await fetch(`${supabaseUrl}/rest/v1/ping_settings?select=wait_time_hours&limit=1`, {
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`
          }
        }).then((r)=>r.json()).then((d)=>({
            data: d[0]
          }));
        const waitTimeHours = pingSettings?.wait_time_hours || 10;
        // Проверяем прошло ли достаточно времени
        const initialSentAt = new Date(tracking.initial_sent_at);
        const now = new Date();
        const hoursPassed = (now.getTime() - initialSentAt.getTime()) / (1000 * 60 * 60);
        // Если время еще не пришло - пропускаем
        if (hoursPassed < waitTimeHours) {
          skippedCount++;
          continue;
        }
        // Получаем настройки контента из группы контакта (если есть)
        const groupMemberships = await fetch(`${supabaseUrl}/rest/v1/contact_group_members?contact_id=eq.${contact.id}&select=group_id`, {
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`
          }
        }).then((r)=>r.json());
        let pingSubject = "Follow-up";
        let pingTextContent = "";
        let pingHtmlContent = "";
        if (groupMemberships && groupMemberships.length > 0) {
          const groupId = groupMemberships[0].group_id;
          console.log(`Loading ping settings for group ${groupId}`);
          const { data: group } = await fetch(`${supabaseUrl}/rest/v1/contact_groups?id=eq.${groupId}&select=ping_subject,ping_text_content,ping_html_content`, {
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`
            }
          }).then((r)=>r.json()).then((d)=>({
              data: d[0]
            }));
          if (group) {
            console.log(`Group ping settings:`, group);
            // Используем значения из группы только если они не null и не undefined
            // Пустая строка - это валидное значение!
            if (group.ping_subject !== null && group.ping_subject !== undefined) {
              pingSubject = group.ping_subject;
            }
            if (group.ping_text_content !== null && group.ping_text_content !== undefined) {
              pingTextContent = group.ping_text_content;
            }
            if (group.ping_html_content !== null && group.ping_html_content !== undefined) {
              pingHtmlContent = group.ping_html_content;
            }
            console.log(`Using pingSubject: "${pingSubject}", pingTextContent length: ${pingTextContent.length}, pingHtmlContent length: ${pingHtmlContent.length}`);
          } else {
            console.log(`No group found for group_id ${groupId}`);
          }
        } else {
          console.log(`Contact ${contact.id} is not in any group`);
        }
        // Если нет контента для пинга - используем дефолтный
        if (!pingTextContent && !pingHtmlContent) {
          pingTextContent = `Hello [NAME],\n\nI wanted to follow up on my previous email. Have you had a chance to review it?\n\nBest regards`;
        }

        const contactName = contact.name || "";

        const replaceNamePlaceholder = (text: string) => {
          return text.replace(/\[NAME\]/g, contactName);
        };

        const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.hostinger.com";
        const smtpPort = Number(Deno.env.get("SMTP_PORT") || "465");
        let emailBody = "";
        const dateHeader = new Date().toUTCString();
        const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${smtpHost}>`;
        emailBody += `From: ${senderEmail.email}\r\n`;
        emailBody += `To: ${contact.email}\r\n`;
        emailBody += `Subject: ${replaceNamePlaceholder(pingSubject)}\r\n`;
        emailBody += `Date: ${dateHeader}\r\n`;
        emailBody += `Message-ID: ${messageId}\r\n`;
        emailBody += `MIME-Version: 1.0\r\n`;
        const hasText = !!pingTextContent;
        const hasHtml = !!pingHtmlContent;

        // Если есть и текст, и HTML - объединяем их в одно HTML письмо
        if (hasText && hasHtml) {
          emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
          emailBody += `Content-Transfer-Encoding: 8bit\r\n`;
          emailBody += `\r\n`;

          // Текст в начале, затем HTML
          const processedText = replaceNamePlaceholder(pingTextContent);
          const processedHtml = replaceNamePlaceholder(pingHtmlContent);

          // Преобразуем переводы строк в <br> для текстовой части
          const textAsHtml = processedText.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>').replace(/\r/g, '<br>');

          // Объединяем: текст + HTML
          emailBody += `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${textAsHtml}</div>\r\n`;
          emailBody += `<br>\r\n`;
          emailBody += `${processedHtml}\r\n`;
        } else if (hasText) {
          // Только текст
          emailBody += `Content-Type: text/plain; charset=UTF-8\r\n`;
          emailBody += `Content-Transfer-Encoding: 8bit\r\n`;
          emailBody += `\r\n`;
          emailBody += `${replaceNamePlaceholder(pingTextContent)}\r\n`;
        } else if (hasHtml) {
          // Только HTML
          emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
          emailBody += `Content-Transfer-Encoding: 8bit\r\n`;
          emailBody += `\r\n`;
          emailBody += `${replaceNamePlaceholder(pingHtmlContent)}\r\n`;
        }
        // SMTP отправка
        const conn = await Deno.connect({
          hostname: smtpHost,
          port: smtpPort,
          transport: "tcp"
        });
        const tlsConn = await Deno.startTls(conn, {
          hostname: smtpHost
        });
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const readLine = async ()=>{
          const buffer = new Uint8Array(4096);
          const n = await tlsConn.read(buffer);
          if (n === null) return "";
          return decoder.decode(buffer.subarray(0, n));
        };
        const writeLine = async (line)=>{
          await tlsConn.write(encoder.encode(line + "\r\n"));
        };
        await readLine();
        await writeLine(`EHLO ${smtpHost}`);
        await readLine();
        await writeLine("AUTH LOGIN");
        await readLine();
        const base64User = btoa(senderEmail.email);
        await writeLine(base64User);
        await readLine();
        const base64Pass = btoa(senderEmail.password);
        await writeLine(base64Pass);
        const authResponse = await readLine();
        if (!authResponse.startsWith("235")) {
          tlsConn.close();
          console.error("SMTP authentication failed for ping email:", authResponse);
          skippedCount++;
          continue;
        }
        await writeLine(`MAIL FROM:<${senderEmail.email}>`);
        await readLine();
        await writeLine(`RCPT TO:<${contact.email}>`);
        const rcptResponse = await readLine();
        if (!rcptResponse.startsWith("250")) {
          tlsConn.close();
          console.error("Recipient rejected for ping email:", rcptResponse);
          skippedCount++;
          continue;
        }
        await writeLine("DATA");
        await readLine();
        await tlsConn.write(encoder.encode(emailBody));
        await writeLine(".");
        const dataResponse = await readLine();
        await writeLine("QUIT");
        tlsConn.close();
        if (!dataResponse.startsWith("250")) {
          console.error("Ping email sending failed:", dataResponse);
          skippedCount++;
          continue;
        }
        // Сохраняем в папку Sent через функцию save-to-sent (fire-and-forget)
        (async ()=>{
          try {
            console.log(`Saving ping email to Sent folder for ${senderEmail.email}`);
            const saveResponse = await fetch(`${supabaseUrl}/functions/v1/save-to-sent`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${supabaseServiceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: senderEmail.email,
                password: senderEmail.password,
                message_body: emailBody,
              }),
            });

            const saveResult = await saveResponse.json();
            if (saveResult.success) {
              console.log("Ping email successfully saved to Sent folder");
            } else {
              console.warn("Failed to save ping email to Sent folder:", saveResult.message || saveResult.error);
            }
          } catch (saveError) {
            console.error("Error saving ping email to Sent folder:", saveError);
          }
        })();
        // Обновляем tracking запись
        const pingSentAt = new Date().toISOString();
        await fetch(`${supabaseUrl}/rest/v1/mailing_ping_tracking?id=eq.${tracking.id}`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            ping_sent: true,
            ping_sent_at: pingSentAt,
            ping_subject: pingSubject,
            ping_text_content: pingTextContent,
            ping_html_content: pingHtmlContent,
            status: "ping_sent",
            updated_at: pingSentAt
          })
        });
        sentCount++;
        console.log(`Ping email sent for tracking ${tracking.id}`);
      } catch (err) {
        console.error("Error sending ping email for tracking:", tracking.id, err);
        skippedCount++;
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: "Ping emails processed",
      sent: sentCount,
      skipped: skippedCount
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Send ping emails error:", errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
