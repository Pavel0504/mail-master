import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProcessMailingRequest {
  mailing_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const requestBody = await req.json() as ProcessMailingRequest;
    const mailingId = requestBody.mailing_id;

    console.log(`Processing mailing ${mailingId}`);

    const recipientsRes = await fetch(
      `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailingId}&status=eq.pending&select=id`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    const recipients = await recipientsRes.json();

    if (!recipients || recipients.length === 0) {
      console.log(`No pending recipients for mailing ${mailingId}`);
      return new Response(
        JSON.stringify({ success: true, message: "No pending recipients", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${recipients.length} pending recipients`);

    await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailingId}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ status: "sending" }),
    });

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        console.log(`Sending email to recipient ${recipient.id} (${processedCount + 1}/${recipients.length})`);

        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient_id: recipient.id }),
        });

        const sendResult = await sendResponse.json();

        if (sendResult.success) {
          successCount++;
          console.log(`Successfully sent to recipient ${recipient.id}`);
        } else {
          failedCount++;
          console.log(`Failed to send to recipient ${recipient.id}: ${sendResult.message}`);
        }

        processedCount++;

        if (processedCount < recipients.length) {
          const minDelay = 8000;
          const maxDelay = 25000;
          const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          console.log(`Waiting ${randomDelay}ms before next email...`);
          await new Promise(resolve => setTimeout(resolve, randomDelay));
        }
      } catch (error) {
        failedCount++;
        console.error(`Error processing recipient ${recipient.id}:`, error);
      }
    }

    console.log(`Mailing ${mailingId} completed: ${successCount} success, ${failedCount} failed out of ${processedCount} total`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Mailing processed",
        processed: processedCount,
        success: successCount,
        failed: failedCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Process mailing error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
