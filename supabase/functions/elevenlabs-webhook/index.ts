import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Injected automatically by Supabase Edge Runtime
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Set via Supabase dashboard → Edge Functions → Secrets
const WEBHOOK_SECRET = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseOutcome(callSuccessful: string): string {
  // ElevenLabs values: "success" | "failure" | "unknown"
  if (callSuccessful === "success") return "answered";
  if (callSuccessful === "failure") return "no_answer";
  return "unknown";
}

function parseCallSuccess(callSuccessful: string): boolean {
  return callSuccessful === "success";
}

function parseSentiment(callSuccess: boolean, summary: string): string {
  if (callSuccess) return "positive";
  const lower = (summary || "").toLowerCase();
  if (lower.match(/interest|yes|want|tell me more|send|absolutely|sure/)) return "positive";
  if (lower.match(/not interest|no thank|remove|stop|don.t call|do not call/)) return "negative";
  return "neutral";
}

function parseLeadStatus(callSuccess: boolean): string {
  return callSuccess ? "qualified" : "contacted";
}

function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  return [
    raw,
    digits,
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null,
    digits.length === 10 ? `+1${digits}` : null,
    digits.length === 10 ? `1${digits}` : null,
  ].filter(Boolean) as string[];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    // Verify secret
    if (WEBHOOK_SECRET) {
      const url      = new URL(req.url);
      const provided = req.headers.get("x-elevenlabs-secret") ?? url.searchParams.get("secret");
      if (provided !== WEBHOOK_SECRET) {
        console.warn("[elevenlabs-webhook] Unauthorized");
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const body = await req.json();

    // ElevenLabs post-call webhook type
    if (body.type !== "post_call_transcription") {
      return json({ received: true });
    }

    const conversationId  = body.conversation_id as string;
    const agentId         = body.agent_id as string;
    const durationSeconds = (body.call_duration_secs ?? 0) as number;
    const analysis        = body.analysis ?? {};
    const callSuccessful  = (analysis.call_successful ?? "unknown") as string;
    const summary         = (analysis.transcript_summary ?? "") as string;

    // Extract phone from metadata if ElevenLabs passes it through
    const metadata    = body.metadata ?? {};
    const toNumber    = (metadata.to_number ?? metadata.phone ?? "") as string;

    const outcome     = parseOutcome(callSuccessful);
    const callSuccess = parseCallSuccess(callSuccessful);
    const sentiment   = parseSentiment(callSuccess, summary);
    const leadStatus  = parseLeadStatus(callSuccess);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find lead — first by conversation_id stored in last_call_id, then by phone
    let lead: { id: string; call_attempt_count: number | null; outreach_stage: string } | null = null;

    const { data: byCallId } = await supabase
      .from("fica_outreach_log")
      .select("lead_id")
      .eq("last_call_id", conversationId)
      .maybeSingle();

    if (byCallId?.lead_id) {
      const { data } = await supabase
        .from("fica_leads")
        .select("id, call_attempt_count, outreach_stage")
        .eq("id", byCallId.lead_id)
        .maybeSingle();
      lead = data;
    }

    // Fallback: look up by phone number if passed in metadata
    if (!lead && toNumber) {
      const variants = phoneVariants(toNumber);
      for (const phone of variants) {
        const { data } = await supabase
          .from("fica_leads")
          .select("id, call_attempt_count, outreach_stage")
          .eq("phone", phone)
          .maybeSingle();
        if (data) { lead = data; break; }
      }
    }

    if (!lead) {
      console.warn(`[elevenlabs-webhook] No lead found for conversation ${conversationId}`);
      return json({ received: true });
    }

    // Build update
    const update: Record<string, unknown> = {
      outcome,
      call_success:   callSuccess,
      sentiment,
      lead_status:    leadStatus,
      call_summary:   summary || null,
      last_called_at: new Date().toISOString(),
      call_duration:  durationSeconds,
    };

    if (callSuccess) {
      update.outreach_stage = "called_success";
      update.lead_qualified = true;
    } else if (outcome === "answered") {
      update.outreach_stage = "not_interested";
      update.lead_qualified = false;
    }
    // no_answer / unknown → leave stage; fica_vapi.js manages retries

    const { error: updateErr } = await supabase
      .from("fica_leads")
      .update(update)
      .eq("id", lead.id);

    if (updateErr) {
      console.error("[elevenlabs-webhook] DB update failed:", updateErr.message);
      return json({ error: "DB update failed" }, 500);
    }

    // Update outreach log with result
    await supabase
      .from("fica_outreach_log")
      .update({ status: outcome, body: summary || null })
      .eq("last_call_id", conversationId);

    console.log(
      `[elevenlabs-webhook] lead=${lead.id} conversation=${conversationId} ` +
      `outcome=${outcome} success=${callSuccess} sentiment=${sentiment} duration=${durationSeconds}s`
    );

    return json({ received: true, leadId: lead.id, outcome, callSuccess });

  } catch (err) {
    console.error("[elevenlabs-webhook] Fatal:", err);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
