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

app.post('/api/process-mailing', async (req, res) => {
  try {
    const { mailing_id } = req.body;

    if (!mailing_id) {
      return res.status(400).json({
        success: false,
        error: 'mailing_id is required'
      });
    }

    console.log(`Starting mailing processing for mailing_id: ${mailing_id}`);

    const { data: recipients } = await supabase
      .from('mailing_recipients')
      .select('id')
      .eq('mailing_id', mailing_id)
      .eq('status', 'pending');

    if (!recipients || recipients.length === 0) {
      console.log(`No pending recipients for mailing ${mailing_id}`);
      return res.json({
        success: true,
        message: 'No pending recipients',
        mailing_id,
        processed: 0
      });
    }

    console.log(`Found ${recipients.length} pending recipients for mailing ${mailing_id}`);

    await supabase
      .from('mailings')
      .update({ status: 'sending' })
      .eq('id', mailing_id);

    res.json({
      success: true,
      message: 'Mailing processing started',
      mailing_id,
      total_recipients: recipients.length
    });

    processMailingQueue(mailing_id, recipients).catch(err => {
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

async function processMailingQueue(mailingId, recipients) {
  console.log(`[Queue ${mailingId}] Starting sequential processing of ${recipients.length} recipients`);

  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      console.log(`[Queue ${mailingId}] Processing recipient ${recipient.id} (${processedCount + 1}/${recipients.length})`);

      const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      const sendResponse = await fetch(`${serverUrl}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ recipient_id: recipient.id })
      });

      const sendResult = await sendResponse.json();

      if (sendResult.success) {
        successCount++;
        console.log(`[Queue ${mailingId}] Successfully sent to recipient ${recipient.id}`);
      } else {
        failedCount++;
        console.log(`[Queue ${mailingId}] Failed to send to recipient ${recipient.id}: ${sendResult.message}`);
      }

      processedCount++;

      if (processedCount < recipients.length) {
        const minDelay = 8000;
        const maxDelay = 25000;
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        console.log(`[Queue ${mailingId}] Waiting ${randomDelay}ms before next email...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }

    } catch (error) {
      failedCount++;
      console.error(`[Queue ${mailingId}] Error processing recipient ${recipient.id}:`, error);
    }
  }

  console.log(`[Queue ${mailingId}] Completed: ${successCount} success, ${failedCount} failed out of ${processedCount} total`);

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

      console.log(`[Queue ${mailingId}] Final status: ${finalStatus}`);
    }
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

    if (recipient.status !== 'pending') {
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
    const replaceNamePlaceholder = (text) => text.replace(/\[NAME\]/g, contactName);

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

    const { data: pingData } = await supabase
      .from('mailing_ping_tracking')
      .insert({
        mailing_recipient_id: recipient_id,
        initial_sent_at: new Date().toISOString(),
        response_received: false,
        ping_sent: false,
        status: 'awaiting_response'
      })
      .select();

    console.log('Ping tracking created:', pingData);

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
