import { Bolt Database } from './config/supabase.js';

export class ScheduledMailingsProcessor {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.checkInterval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('Scheduled mailings processor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting scheduled mailings processor...');
    console.log('Will check for scheduled mailings every 60 seconds');

    this.checkInterval = setInterval(() => {
      this.processScheduledMailings().catch(err => {
        console.error('Error processing scheduled mailings:', err);
      });
    }, 60 * 1000);

    this.processScheduledMailings().catch(err => {
      console.error('Error in initial scheduled mailings check:', err);
    });
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.isRunning = false;
      console.log('Scheduled mailings processor stopped');
    }
  }

  async processScheduledMailings() {
    try {
      const now = new Date();
      const nowISO = now.toISOString();

      console.log(`[${new Date().toISOString()}] Checking for scheduled mailings...`);

      const { data: scheduledMailings, error } = await Bolt Database
        .from('mailings')
        .select('*')
        .eq('status', 'pending')
        .not('scheduled_at', 'is', null)
        .lte('scheduled_at', nowISO);

      if (error) {
        console.error('Error fetching scheduled mailings:', error);
        return;
      }

      if (!scheduledMailings || scheduledMailings.length === 0) {
        console.log('No scheduled mailings to process');
        return;
      }

      console.log(`Found ${scheduledMailings.length} scheduled mailing(s) ready to send`);

      for (const mailing of scheduledMailings) {
        try {
          console.log(`Processing scheduled mailing ${mailing.id}: "${mailing.subject}"`);
          console.log(`  Scheduled for: ${mailing.scheduled_at} (${mailing.timezone})`);
          console.log(`  Current time: ${nowISO}`);

          const { data: recipients } = await Bolt Database
            .from('mailing_recipients')
            .select('id')
            .eq('mailing_id', mailing.id)
            .eq('status', 'pending');

          if (!recipients || recipients.length === 0) {
            console.log(`  No pending recipients for mailing ${mailing.id}, skipping`);
            await Bolt Database
              .from('mailings')
              .update({ status: 'completed' })
              .eq('id', mailing.id);
            continue;
          }

          console.log(`  Found ${recipients.length} pending recipient(s), triggering send...`);

          const response = await fetch(`${this.serverUrl}/api/process-mailing`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mailing_id: mailing.id }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`  Successfully triggered mailing ${mailing.id}:`, result);
          } else {
            const errorText = await response.text();
            console.error(`  Failed to trigger mailing ${mailing.id}: ${response.status} ${errorText}`);
          }

        } catch (mailingError) {
          console.error(`Error processing mailing ${mailing.id}:`, mailingError);
        }
      }

    } catch (error) {
      console.error('Error in processScheduledMailings:', error);
    }
  }
}
