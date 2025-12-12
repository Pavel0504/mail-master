import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendEmailRequest {
  recipient_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let recipient_id: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const requestBody = await req.json() as SendEmailRequest;
    recipient_id = requestBody.recipient_id;

    const recipientRes = await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}&select=*,mailing:mailings(*),contact:contacts(*),sender_email:emails(*)`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    });

    const recipients = await recipientRes.json();
    if (!recipients || recipients.length === 0) {
      throw new Error("Recipient not found");
    }

    const recipient = recipients[0];
    const { mailing, contact, sender_email } = recipient;

    if (recipient.status !== "pending") {
      return new Response(
        JSON.stringify({ success: false, message: "Already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Получаем контент письма из подгруппы контакта
    let emailSubject = "";
    let emailTextContent = null;
    let emailHtmlContent = null;

    // Загружаем подгруппы контакта
    const groupMembersRes = await fetch(
      `${supabaseUrl}/rest/v1/contact_group_members?contact_id=eq.${contact.id}&select=group_id`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    const groupMembers = await groupMembersRes.json();

    if (groupMembers && groupMembers.length > 0) {
      const groupId = groupMembers[0].group_id;

      const groupRes = await fetch(
        `${supabaseUrl}/rest/v1/contact_groups?id=eq.${groupId}&select=default_subject,default_text_content,default_html_content`,
        {
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
        }
      );

      const groups = await groupRes.json();

      if (groups && groups.length > 0) {
        const group = groups[0];
        emailSubject = group.default_subject || "";
        emailTextContent = group.default_text_content || null;
        emailHtmlContent = group.default_html_content || null;
      }
    }

    // Если контент из группы пустой, пробуем взять из рассылки (fallback)
    if (!emailSubject && mailing.subject) {
      emailSubject = mailing.subject;
    }
    if (!emailTextContent && mailing.text_content) {
      emailTextContent = mailing.text_content;
    }
    if (!emailHtmlContent && mailing.html_content) {
      emailHtmlContent = mailing.html_content;
    }

    // Проверяем что есть контент для отправки
    if (!emailTextContent && !emailHtmlContent) {
      throw new Error("No email content");
    }

    // Рандомная задержка от 8 до 25 секунд перед отправкой
    // Это помогает избежать попадания в спам
    const minDelay = 8000; // 8 секунд
    const maxDelay = 25000; // 25 секунд
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    console.log(`Waiting ${randomDelay}ms before sending email to ${contact.email}`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    const contactName = contact.name || "";

    const replaceNamePlaceholder = (text: string) => {
      return text.replace(/\[NAME\]/g, contactName);
    };

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

    // Если есть и текст, и HTML - объединяем их в одно HTML письмо
    if (hasText && hasHtml) {
      emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
      emailBody += `Content-Transfer-Encoding: 8bit\r\n`;
      emailBody += `\r\n`;

      // Текст в начале, затем HTML
      const processedText = replaceNamePlaceholder(emailTextContent);
      const processedHtml = replaceNamePlaceholder(emailHtmlContent);

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
      emailBody += `${replaceNamePlaceholder(emailTextContent)}\r\n`;
    } else if (hasHtml) {
      // Только HTML
      emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
      emailBody += `Content-Transfer-Encoding: 8bit\r\n`;
      emailBody += `\r\n`;
      emailBody += `${replaceNamePlaceholder(emailHtmlContent)}\r\n`;
    }

    const conn = await Deno.connect({
      hostname: smtpHost,
      port: smtpPort,
      transport: "tcp",
    });

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

    const base64User = btoa(smtpUser);
    await writeLine(base64User);
    await readLine();

    const base64Pass = btoa(smtpPass);
    await writeLine(base64Pass);
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

    // Сохраняем письмо в папку Sent (асинхронно, не блокируем основной процесс)
    (async () => {
      try {
        console.log(`Saving email to Sent folder for ${smtpUser}`);
        const saveResponse = await fetch(`${supabaseUrl}/functions/v1/save-to-sent`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: smtpUser,
            password: smtpPass,
            message_body: emailBody,
          }),
        });

        const saveResult = await saveResponse.json();
        if (saveResult.success) {
          console.log("Email successfully saved to Sent folder");
        } else {
          console.warn("Failed to save to Sent folder:", saveResult.message || saveResult.error);
        }
      } catch (saveError) {
        console.error("Error saving email to Sent folder:", saveError);
      }
    })();

    // Обновляем статус получателя
    await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        status: "sent",
        sent_at: new Date().toISOString(),
      }),
    });

    // Получаем информацию о рассылке для обновления счетчиков
    const mailingId = recipient.mailing_id;

    // Обновляем счетчики рассылки
    const { data: currentMailing } = await fetch(
      `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}&select=sent_count,success_count`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    ).then(r => r.json()).then(d => ({ data: d[0] }));

    if (currentMailing) {
      await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          sent_count: (currentMailing.sent_count || 0) + 1,
          success_count: (currentMailing.success_count || 0) + 1,
        }),
      });
    }

    // Проверяем, остались ли еще получатели со статусом pending
    const { data: pendingRecipients } = await fetch(
      `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailingId}&status=eq.pending&select=id`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    ).then(r => r.json()).then(d => ({ data: d }));

    // Если больше нет pending получателей - меняем статус рассылки на completed
    if (!pendingRecipients || pendingRecipients.length === 0) {
      await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          status: "completed",
        }),
      });
    }

    // Обновляем счетчики почты
    await fetch(`${supabaseUrl}/rest/v1/emails?id=eq.${sender_email.id}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        sent_count: (sender_email.sent_count || 0) + 1,
        success_count: (sender_email.success_count || 0) + 1,
      }),
    });

    // Создаем запись ping tracking для отслеживания ответов
    const sentAt = new Date().toISOString();
    const pingTrackingRes = await fetch(`${supabaseUrl}/rest/v1/mailing_ping_tracking`, {
      method: "POST",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        mailing_recipient_id: recipient_id,
        initial_sent_at: sentAt,
        response_received: false,
        ping_sent: false,
        status: "awaiting_response",
      }),
    });

    const pingTrackingData = await pingTrackingRes.json();

    if (pingTrackingRes.ok) {
      console.log("Ping tracking created:", pingTrackingData);
    } else {
      console.error("Failed to create ping tracking:", pingTrackingData);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error.message);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Обновляем статус получателя на failed
    if (recipient_id) {
      await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          status: "failed",
          error_message: error.message,
        }),
      }).catch(() => {});

      // Получаем информацию о получателе для обновления счетчиков
      try {
        const { data: recipientData } = await fetch(
          `${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}&select=mailing_id,sender_email_id`,
          {
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
          }
        ).then(r => r.json()).then(d => ({ data: d[0] }));

        if (recipientData) {
          const mailingId = recipientData.mailing_id;
          const senderEmailId = recipientData.sender_email_id;

          // Обновляем счетчики рассылки
          const { data: currentMailing } = await fetch(
            `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}&select=sent_count,failed_count`,
            {
              headers: {
                "apikey": supabaseServiceKey,
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
            }
          ).then(r => r.json()).then(d => ({ data: d[0] }));

          if (currentMailing) {
            await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`, {
              method: "PATCH",
              headers: {
                "apikey": supabaseServiceKey,
                "Authorization": `Bearer ${supabaseServiceKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
              },
              body: JSON.stringify({
                sent_count: (currentMailing.sent_count || 0) + 1,
                failed_count: (currentMailing.failed_count || 0) + 1,
              }),
            });
          }

          // Проверяем, остались ли еще получатели со статусом pending
          const { data: pendingRecipients } = await fetch(
            `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailingId}&status=eq.pending&select=id`,
            {
              headers: {
                "apikey": supabaseServiceKey,
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
            }
          ).then(r => r.json()).then(d => ({ data: d }));

          // Если больше нет pending получателей - проверяем финальный статус рассылки
          if (!pendingRecipients || pendingRecipients.length === 0) {
            const { data: mailingStats } = await fetch(
              `${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}&select=success_count,failed_count`,
              {
                headers: {
                  "apikey": supabaseServiceKey,
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                },
              }
            ).then(r => r.json()).then(d => ({ data: d[0] }));

            if (mailingStats) {
              const finalStatus = mailingStats.success_count > 0 ? "completed" : "failed";
              await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`, {
                method: "PATCH",
                headers: {
                  "apikey": supabaseServiceKey,
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                  "Content-Type": "application/json",
                  "Prefer": "return=minimal",
                },
                body: JSON.stringify({
                  status: finalStatus,
                }),
              });
            }
          }

          // Обновляем счетчики почты
          if (senderEmailId) {
            const { data: emailData } = await fetch(
              `${supabaseUrl}/rest/v1/emails?id=eq.${senderEmailId}&select=sent_count,failed_count`,
              {
                headers: {
                  "apikey": supabaseServiceKey,
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                },
              }
            ).then(r => r.json()).then(d => ({ data: d[0] }));

            if (emailData) {
              await fetch(`${supabaseUrl}/rest/v1/emails?id=eq.${senderEmailId}`, {
                method: "PATCH",
                headers: {
                  "apikey": supabaseServiceKey,
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                  "Content-Type": "application/json",
                  "Prefer": "return=minimal",
                },
                body: JSON.stringify({
                  sent_count: (emailData.sent_count || 0) + 1,
                  failed_count: (emailData.failed_count || 0) + 1,
                }),
              });
            }
          }
        }
      } catch (updateError) {
        console.error("Failed to update counters:", updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});