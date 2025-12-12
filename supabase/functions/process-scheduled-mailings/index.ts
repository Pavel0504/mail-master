import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const now = new Date().toISOString();

    const mailingsRes = await fetch(
      `${supabaseUrl}/rest/v1/mailings?status=eq.pending&scheduled_at=lte.${now}&select=*`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    const mailings = await mailingsRes.json();

    if (!mailings || mailings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No mailings to process", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;

    for (const mailing of mailings) {
      await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ status: "sending" }),
      });

      const recipientsRes = await fetch(
        `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailing.id}&status=eq.pending&select=id`,
        {
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
        }
      );

      const recipients = await recipientsRes.json();

      for (const recipient of recipients) {
        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient_id: recipient.id }),
        }).catch((err) => console.error("Failed to send email:", err));
      }

      processedCount++;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Mailings processed", processed: processedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});