import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { supabase } from './config/supabase.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * Parse and normalize allowed origins from env.
 * Example env value:
 *   CORS_ORIGIN="http://localhost:5173,https://af022b9b5f5d.ngrok-free.app,https://mail-delivery-master.netlify.app"
 */
const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = rawOrigins
  .split(',')
  .map(s => (s || '').trim())
  .filter(Boolean)
  .map(o => (o.endsWith('/') ? o.slice(0, -1) : o)); // remove trailing slash

console.log('CORS allowed origins:', allowedOrigins);

app.use(
  cors({
    // origin callback: allow if origin is in whitelist, allow requests with no origin (curl/postman)
    origin: (origin, callback) => {
      // origin === undefined for non-browser requests (curl, Postman)
      if (!origin) return callback(null, true);

      const norm = origin.endsWith('/') ? origin.slice(0, -1) : origin;
      if (allowedOrigins.includes(norm)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'apikey', 'Accept', 'Origin']
  })
);

// respond to preflight requests for any route
app.options('*', cors());

/**
 * Friendly handler for CORS rejection to return 403 instead of generic 500
 * This middleware should come after the cors() middleware.
 */
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    console.warn(`CORS denied for origin: ${req.headers.origin}`);
    return res.status(403).json({ success: false, message: 'CORS origin denied' });
  }
  // pass other errors down the chain
  next(err);
});

app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MailServerCE Email Processing Server'
  });
});

/**
 * Helper: resolve ping content from the contact's subgroup(s) without walking parent_group_id.
 * - Checks contact_group_members for groups the contact belongs to.
 * - Fetches those groups and picks the first group that contains any ping fields.
 * - Falls back to mailing-level ping fields if none found.
 */
async function resolvePingContentForContact(contactId, mailing) {
  try {
    const { data: groupMembers, error: gmErr } = await supabase
      .from('contact_group_members')
      .select('group_id')
      .eq('contact_id', contactId);

    if (gmErr) {
      console.warn('resolvePingContentForContact: error fetching group members', gmErr);
    }

    if (!groupMembers || groupMembers.length === 0) {
      // no groups -> fallback to mailing
      return {
        ping_subject: mailing?.ping_subject || null,
        ping_text_content: mailing?.ping_text_content || null,
        ping_html_content: mailing?.ping_html_content || null,
        ping_delay_hours: mailing?.ping_delay_hours ?? null,
        ping_delay_days: mailing?.ping_delay_days ?? null
      };
    }

    const groupIds = groupMembers.map(g => g.group_id);

    const { data: groups, error: groupsErr } = await supabase
      .from('contact_groups')
      .select('id, ping_subject, ping_text_content, ping_html_content, ping_delay_hours, ping_delay_days')
      .in('id', groupIds);

    if (groupsErr) {
      console.warn('resolvePingContentForContact: error fetching groups', groupsErr);
      // fallback to mailing
      return {
        ping_subject: mailing?.ping_subject || null,
        ping_text_content: mailing?.ping_text_content || null,
        ping_html_content: mailing?.ping_html_content || null,
        ping_delay_hours: mailing?.ping_delay_hours ?? null,
        ping_delay_days: mailing?.ping_delay_days ?? null
      };
    }

    // find first group that has any ping fields
    const groupWithPing = (groups || []).find(g =>
      (g.ping_subject && String(g.ping_subject).trim() !== '') ||
      (g.ping_text_content && String(g.ping_text_content).trim() !== '') ||
      (g.ping_html_content && String(g.ping_html_content).trim() !== '')
    );

    const chosen = groupWithPing || (groups && groups[0]) || null;

    if (!chosen) {
      return {
        ping_subject: mailing?.ping_subject || null,
        ping_text_content: mailing?.ping_text_content || null,
        ping_html_content: mailing?.ping_html_content || null,
        ping_delay_hours: mailing?.ping_delay_hours ?? null,
        ping_delay_days: mailing?.ping_delay_days ?? null
      };
    }

    return {
      ping_subject: chosen.ping_subject || null,
      ping_text_content: chosen.ping_text_content || null,
      ping_html_content: chosen.ping_html_content || null,
      ping_delay_hours: chosen.ping_delay_hours ?? null,
      ping_delay_days: chosen.ping_delay_days ?? null
    };

  } catch (err) {
    console.error('resolvePingContentForContact unexpected error', err);
    return {
      ping_subject: mailing?.ping_subject || null,
      ping_text_content: mailing?.ping_text_content || null,
      ping_html_content: mailing?.ping_html_content || null,
      ping_delay_hours: mailing?.ping_delay_hours ?? null,
      ping_delay_days: mailing?.ping_delay_days ?? null
    };
  }
}

/**
 * POST /api/process-mailing
 * Starts processing a mailing. Now attempts to atomically mark mailing.status = 'sending'
 * only if it's not already 'sending'. If another process already marked it as 'sending',
 * this request will return early and not start a duplicate worker.
 */
app.post('/api/process-mailing', async (req, res) => {
  try {
    const { mailing_id } = req.body;

    if (!mailing_id) {
      return res.status(400).json({
        success: false,
        error: 'mailing_id is required'
      });
    }

    console.log(`Starting mailing processing request for mailing_id: ${mailing_id}`);

    // A: Attempt to atomically set status = 'sending' only if current status != 'sending'
    const { data: updatedMailing, error: updErr } = await supabase
      .from('mailings')
      .update({ status: 'sending' })
      .eq('id', mailing_id)
      .neq('status', 'sending')
      .select();

    if (updErr) {
      console.error('Error while attempting to mark mailing as sending:', updErr);
      return res.status(500).json({ success: false, error: 'Failed to mark mailing as sending' });
    }

    // If nothing was updated, someone else likely started processing this mailing already
    if (!updatedMailing || updatedMailing.length === 0) {
      console.log(`Mailing ${mailing_id} is already being processed by another worker`);
      return res.json({
        success: true,
        message: 'Mailing already being processed',
        mailing_id
      });
    }

    // Safe to continue: get pending recipients
    const { data: recipients } = await supabase
      .from('mailing_recipients')
      .select('id')
      .eq('mailing_id', mailing_id)
      .eq('status', 'pending');

    if (!recipients || recipients.length === 0) {
      console.log(`No pending recipients for mailing ${mailing_id}`);
      // update mailing to completed if there are no recipients? keep original behavior: return processed 0
      return res.json({
        success: true,
        message: 'No pending recipients',
        mailing_id,
        processed: 0
      });
    }

    console.log(`Found ${recipients.length} pending recipients for mailing ${mailing_id}`);

    res.json({
      success: true,
      message: 'Mailing processing started',
      mailing_id,
      total_recipients: recipients.length
    });

    // Start actual queue processing (B: atomic per-recipient grabbing inside processMailingQueue)
    processMailingQueue(mailing_id).catch(err => {
      console.error(`Error processing mailing queue ${mailing_id}:`, err);
    });

  } catch (error) {
    console.error('Error processing mailing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * processMailingQueue
 * New behavior (B): do NOT iterate over a previously fetched recipients array.
 * Instead, repeatedly attempt to atomically "grab" exactly one pending recipient
 * (update status pending->processing with a conditional update and select the row).
 * This prevents two parallel workers from processing the same recipient.
 *
 * For each grabbed recipient we call the existing /api/send-email endpoint
 * (keeps send-email route intact). We preserve the original random delay between sends.
 */
async function processMailingQueue(mailingId) {
  console.log(`[Queue ${mailingId}] Starting atomic loop`);

  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  while (true) {
    try {
      // Attempt to atomically claim one pending recipient: pending -> processing
      const { data: grabbed, error: grabErr } = await supabase
        .from('mailing_recipients')
        .update({ status: 'processing', processing_started_at: new Date().toISOString() })
        .eq('mailing_id', mailingId)
        .eq('status', 'pending')
        .limit(1)
        .select('*')
        .single()
        .catch(e => ({ data: null, error: e }));

      if (grabErr) {
        // If the error indicates no rows, break; otherwise log and break to avoid tight loop
        console.warn(`[Queue ${mailingId}] grab error (or no rows):`, grabErr);
        break;
      }

      if (!grabbed) {
        // Nothing grabbed — likely no pending rows left
        console.log(`[Queue ${mailingId}] no pending recipients to grab`);
        break;
      }

      processedCount++;
      console.log(`[Queue ${mailingId}] Grabbed recipient ${grabbed.id} (${processedCount}) for processing`);

      // Call existing /api/send-email endpoint for the grabbed recipient
      try {
        const sendResponse = await fetch(`${serverUrl}/api/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ recipient_id: grabbed.id })
        });

        let sendResult = null;
        try {
          sendResult = await sendResponse.json();
        } catch (parseErr) {
          console.error(`[Queue ${mailingId}] Failed to parse send-email response for recipient ${grabbed.id}:`, parseErr);
          sendResult = { success: false, message: 'Invalid JSON response from send-email' };
        }

        if (sendResult && sendResult.success) {
          successCount++;
          console.log(`[Queue ${mailingId}] Successfully sent to recipient ${grabbed.id}`);
        } else {
          failedCount++;
          console.log(`[Queue ${mailingId}] Failed to send to recipient ${grabbed.id}: ${sendResult?.message || 'unknown error'}`);
        }

      } catch (sendErr) {
        failedCount++;
        console.error(`[Queue ${mailingId}] Error when calling send-email for recipient ${grabbed.id}:`, sendErr);
      }

      // Wait random delay between sends, unless there are no pending recipients left (we check quickly)
      // Here we perform the same random delay logic as before.
      // But to avoid unnecessary wait when queue is empty, you might choose to skip at the end — keeping original behavior.
      const minDelay = 8000;
      const maxDelay = 25000;
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      console.log(`[Queue ${mailingId}] Waiting ${randomDelay}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, randomDelay));

    } catch (outer) {
      // If anything unexpected happens, log and break to avoid infinite error loops.
      console.error(`[Queue ${mailingId}] Outer loop error:`, outer);
      break;
    }
  }

  console.log(`[Queue ${mailingId}] Completed loop: processed=${processedCount} success=${successCount} failed=${failedCount}`);

  // After loop, check if any pending recipients remain; if none — update mailing final status
  try {
    const { data: pendingCheck } = await supabase
      .from('mailing_recipients')
      .select('id')
      .eq('mailing_id', mailingId)
      .eq('status', 'pending');

    if (!pendingCheck || pendingCheck.length === 0) {
      const { data: stats } = await supabase
        .from('mailings')
        .select('success_count, failed_count')
        .eq('id', mailingId)
        .single();

      if (stats) {
        const finalStatus = (stats.success_count || 0) > 0 ? 'completed' : 'failed';
        await supabase
          .from('mailings')
          .update({ status: finalStatus })
          .eq('id', mailingId);

        console.log(`[Queue ${mailingId}] Final status set to: ${finalStatus}`);
      }
    }
  } catch (postErr) {
    console.error(`[Queue ${mailingId}] Error during finalization:`, postErr);
  }
}

app.post('/api/send-email', async (req, res) => {
  let recipient_id = null;

  try {
    const { recipient_id: reqRecipientId } = req.body;
    recipient_id = reqRecipientId;

    if (!recipient_id) {
      return res.status(400).json({
        success: false,
        error: 'recipient_id is required'
      });
    }

    const authHeader = req.headers.authorization || '';
    const apikeyHeader = req.headers.apikey || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isServiceRole = token === serviceKey || apikeyHeader === serviceKey;

    if (!isServiceRole) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or missing service role key'
      });
    }

    const { data: recipients, error: recipientError } = await supabase
      .from('mailing_recipients')
      .select('*, mailing:mailings(*), contact:contacts(*), sender_email:emails(*)')
      .eq('id', recipient_id)
      .single();

    if (recipientError || !recipients) {
      throw new Error('Recipient not found');
    }

    const recipient = recipients;
    const { mailing, contact, sender_email } = recipient;

    if (recipient.status !== 'pending' && recipient.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Already processed'
      });
    }

    let emailSubject = '';
    let emailTextContent = null;
    let emailHtmlContent = null;

    const { data: groupMembers } = await supabase
      .from('contact_group_members')
      .select('group_id')
      .eq('contact_id', contact.id);

    if (groupMembers && groupMembers.length > 0) {
      const groupId = groupMembers[0].group_id;
      const { data: groups } = await supabase
        .from('contact_groups')
        .select('default_subject, default_text_content, default_html_content')
        .eq('id', groupId)
        .single();

      if (groups) {
        emailSubject = groups.default_subject || '';
        emailTextContent = groups.default_text_content || null;
        emailHtmlContent = groups.default_html_content || null;
      }
    }

    if (!emailSubject && mailing?.subject) emailSubject = mailing.subject;
    if (!emailTextContent && mailing?.text_content) emailTextContent = mailing.text_content;
    if (!emailHtmlContent && mailing?.html_content) emailHtmlContent = mailing.html_content;

    if (!emailTextContent && !emailHtmlContent) {
      throw new Error('No email content');
    }

    const minDelay = 8000;
    const maxDelay = 25000;
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    console.log(`Waiting ${randomDelay}ms before sending email to ${contact.email}`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    const contactName = contact.name || '';
    const replaceNamePlaceholder = (text) => String(text || '').replace(/\[NAME\]/g, contactName);

    const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
    const smtpPort = Number(process.env.SMTP_PORT || '465');
    const smtpUser = sender_email.email;
    const smtpPass = sender_email.password;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const dateHeader = new Date().toUTCString();
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${smtpHost}>`;

    const hasText = !!emailTextContent;
    const hasHtml = !!emailHtmlContent;

    let htmlContent = '';
    let textContent = '';

    if (hasText && hasHtml) {
      const processedText = replaceNamePlaceholder(emailTextContent);
      const processedHtml = replaceNamePlaceholder(emailHtmlContent);
      const textAsHtml = processedText.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>').replace(/\r/g, '<br>');
      htmlContent = `<div style="font-family: Arial, sans-serif;">${textAsHtml}</div><br>${processedHtml}`;
      textContent = processedText;
    } else if (hasText) {
      textContent = replaceNamePlaceholder(emailTextContent);
    } else {
      htmlContent = replaceNamePlaceholder(emailHtmlContent);
    }

    const mailOptions = {
      from: smtpUser,
      to: contact.email,
      subject: replaceNamePlaceholder(emailSubject),
      text: textContent || undefined,
      html: htmlContent || undefined,
      date: dateHeader,
      messageId: messageId
    };

    await transporter.sendMail(mailOptions);

    const emailBody = `From: ${smtpUser}\r\nTo: ${contact.email}\r\nSubject: ${replaceNamePlaceholder(emailSubject)}\r\nDate: ${dateHeader}\r\nMessage-ID: ${messageId}\r\nMIME-Version: 1.0\r\n${hasText && hasHtml ? `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${htmlContent}\r\n` : hasText ? `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${textContent}\r\n` : `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${htmlContent}\r\n`}`;

    (async () => {
      try {
        console.log(`Saving email to Sent folder for ${smtpUser}`);
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        const saveResponse = await fetch(`${supabaseUrl}/functions/v1/save-to-sent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: smtpUser,
            password: smtpPass,
            message_body: emailBody
          })
        });

        const saveResult = await saveResponse.json();
        if (saveResult.success) {
          console.log('Email successfully saved to Sent folder');
        } else {
          console.warn('Failed to save to Sent folder:', saveResult.message || saveResult.error);
        }
      } catch (saveError) {
        console.error('Error saving email to Sent folder:', saveError);
      }
    })();

    await supabase
      .from('mailing_recipients')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', recipient_id);

    const mailingId = recipient.mailing_id;
    const { data: currentMailing } = await supabase
      .from('mailings')
      .select('sent_count, success_count')
      .eq('id', mailingId)
      .single();

    if (currentMailing) {
      await supabase
        .from('mailings')
        .update({
          sent_count: (currentMailing.sent_count || 0) + 1,
          success_count: (currentMailing.success_count || 0) + 1
        })
        .eq('id', mailingId);
    }

    const { data: pendingRecipients } = await supabase
      .from('mailing_recipients')
      .select('id')
      .eq('mailing_id', mailingId)
      .eq('status', 'pending');

    if (!pendingRecipients || pendingRecipients.length === 0) {
      await supabase
        .from('mailings')
        .update({ status: 'completed' })
        .eq('id', mailingId);
    }

    await supabase
      .from('emails')
      .update({
        sent_count: (sender_email.sent_count || 0) + 1,
        success_count: (sender_email.success_count || 0) + 1
      })
      .eq('id', sender_email.id);

    // ----------------- create ping tracking with subgroup data (no parent lookup) -----------------
    try {
      const pingContent = await resolvePingContentForContact(contact.id, mailing);

      const initialSentAt = new Date().toISOString();

      // optional scheduled time calculation
      let pingScheduledAt = null;
      const hours = Number(pingContent.ping_delay_hours || 0);
      const days = Number(pingContent.ping_delay_days || 0);
      if (hours > 0 || days > 0) {
        const delayMs = (hours * 3600 + days * 86400) * 1000;
        pingScheduledAt = new Date(Date.now() + delayMs).toISOString();
      }

      const insertPayload = {
        mailing_recipient_id: recipient_id,
        initial_sent_at: initialSentAt,
        response_received: false,
        response_received_at: null,
        ping_sent: false,
        ping_sent_at: null,
        ping_subject: pingContent.ping_subject,
        ping_text_content: pingContent.ping_text_content,
        ping_html_content: pingContent.ping_html_content,
        ping_delay_hours: pingContent.ping_delay_hours,
        ping_delay_days: pingContent.ping_delay_days,
        ping_scheduled_at: pingScheduledAt, // if table doesn't have this column, remove it
        status: 'awaiting_response'
      };

      const { data: pingData, error: pingErr } = await supabase
        .from('mailing_ping_tracking')
        .insert(insertPayload)
        .select();

      if (pingErr) {
        console.warn('Failed to create ping tracking row:', pingErr);
      } else {
        console.log('Ping tracking created:', pingData);
      }
    } catch (pingCreateErr) {
      console.error('Error creating ping tracking:', pingCreateErr);
    }
    // ----------------- END ping creation -----------------

    res.json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    const errMsg = error.message || String(error);
    console.error('Error:', errMsg);

    try {
      if (recipient_id) {
        await supabase
          .from('mailing_recipients')
          .update({ status: 'failed', error_message: errMsg })
          .eq('id', recipient_id)
          .then(() => {}).catch(() => {});

        const { data: recipientData } = await supabase
          .from('mailing_recipients')
          .select('mailing_id, sender_email_id')
          .eq('id', recipient_id)
          .single()
          .catch(() => ({ data: null }));

        if (recipientData) {
          const mailingId = recipientData.mailing_id;
          const senderEmailId = recipientData.sender_email_id;

          const { data: mailingStats } = await supabase
            .from('mailings')
            .select('sent_count, failed_count, success_count')
            .eq('id', mailingId)
            .single()
            .catch(() => ({ data: null }));

          if (mailingStats) {
            await supabase
              .from('mailings')
              .update({
                sent_count: (mailingStats.sent_count || 0) + 1,
                failed_count: (mailingStats.failed_count || 0) + 1
              })
              .eq('id', mailingId)
              .catch(() => {});
          }

          const { data: pendingRecipients } = await supabase
            .from('mailing_recipients')
            .select('id')
            .eq('mailing_id', mailingId)
            .eq('status', 'pending')
            .catch(() => ({ data: null }));

          if (!pendingRecipients || pendingRecipients.length === 0) {
            const { data: stats } = await supabase
              .from('mailings')
              .select('success_count, failed_count')
              .eq('id', mailingId)
              .single()
              .catch(() => ({ data: null }));

            if (stats) {
              const finalStatus = (stats.success_count || 0) > 0 ? 'completed' : 'failed';
              await supabase
                .from('mailings')
                .update({ status: finalStatus })
                .eq('id', mailingId)
                .catch(() => {});
            }
          }

          if (senderEmailId) {
            const { data: emailStats } = await supabase
              .from('emails')
              .select('sent_count, failed_count')
              .eq('id', senderEmailId)
              .single()
              .catch(() => ({ data: null }));

            if (emailStats) {
              await supabase
                .from('emails')
                .update({
                  sent_count: (emailStats.sent_count || 0) + 1,
                  failed_count: (emailStats.failed_count || 0) + 1
                })
                .eq('id', senderEmailId)
                .catch(() => {});
            }
          }
        }
      }
    } catch (outer) {
      console.error('Error during failure handling:', outer);
    }

    res.status(500).json({
      success: false,
      message: errMsg
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`MailServerCE Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`CORS enabled for: ${allowedOrigins.join(', ')}`);
});
