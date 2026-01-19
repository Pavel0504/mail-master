import { supabase } from './config/supabase.js';

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
      console.log(`[${new Date().toISOString()}] Checking for scheduled mailings...`);

      // Получаем все pending рассылки с scheduled_at
      const { data: scheduledMailings, error } = await supabase
        .from('mailings')
        .select('*')
        .eq('status', 'pending')
        .not('scheduled_at', 'is', null);

      if (error) {
        console.error('Error fetching scheduled mailings:', error);
        return;
      }

      if (!scheduledMailings || scheduledMailings.length === 0) {
        console.log('No scheduled mailings to process');
        return;
      }

      console.log(`Found ${scheduledMailings.length} scheduled mailing(s) to check`);

      let processedCount = 0;

      for (const mailing of scheduledMailings) {
        try {
          // Парсим scheduled_at и timezone
          const scheduledDate = new Date(mailing.scheduled_at);
          const timezone = mailing.timezone || 'UTC';

          // Получаем текущее время в указанной таймзоне
          const nowInTimezone = new Date().toLocaleString('en-US', { timeZone: timezone });
          const currentTimeInTZ = new Date(nowInTimezone);

          // Получаем scheduled время в той же таймзоне
          const scheduledTimeInTZ = new Date(scheduledDate.toLocaleString('en-US', { timeZone: timezone }));

          console.log(`Checking mailing ${mailing.id}: "${mailing.subject}"`);
          console.log(`  Scheduled for: ${mailing.scheduled_at} (${timezone})`);
          console.log(`  Current time in ${timezone}: ${currentTimeInTZ.toISOString()}`);
          console.log(`  Scheduled time in ${timezone}: ${scheduledTimeInTZ.toISOString()}`);

          // Проверяем, пришло ли время отправки
          if (currentTimeInTZ >= scheduledDate) {
            console.log(`  Time to send! (current >= scheduled)`);

            const { data: recipients } = await supabase
              .from('mailing_recipients')
              .select('id')
              .eq('mailing_id', mailing.id)
              .eq('status', 'pending');

            if (!recipients || recipients.length === 0) {
              console.log(`  No pending recipients for mailing ${mailing.id}, marking as completed`);
              await supabase
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
              processedCount++;
            } else {
              const errorText = await response.text();
              console.error(`  Failed to trigger mailing ${mailing.id}: ${response.status} ${errorText}`);
            }
          } else {
            console.log(`  Not yet time to send (current < scheduled)`);
          }

        } catch (mailingError) {
          console.error(`Error processing mailing ${mailing.id}:`, mailingError);
        }
      }

      if (processedCount > 0) {
        console.log(`Processed ${processedCount} scheduled mailing(s)`);
      }

    } catch (error) {
      console.error('Error in processScheduledMailings:', error);
    }
  }
}
