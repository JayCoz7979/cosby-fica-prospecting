import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Injected automatically by Supabase Edge Runtime:
const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Set via: supabase secrets set VAPI_WEBHOOK_SECRET=<your-secret>
const WEBHOOK_SECRET = Deno.env.get("VAPI_WEBHOOK_SECRET");

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseOutcome(endedReason: string): string {
  const map: Record<string, string> = {
    "customer-ended-call":     "answered",
    "assistant-ended-call":    "answered",
    "exceeded-max-duration":   "answered",
    "customer-did-not-answer": "no_answer",
    "no-answer":               "no_answer",
    "silence-timed-out":       "no_answer",
    "voicemail":               "voicemail",
    "busy":                    "busy",
    "failed":                  "failed",
    "pipeline-error":          "failed",
    "assistant-error":         "failed",
  };
  return map[endedReason] ?? endedReason ?? "unknown";
}

function parseCallSuccess(successEval: unknown): boolean {
  if (typeof successEval === "boolean") return successEval;
  if (typeof successEval === "string") {
    const v = successEval.toLowerCase();
    return v === "true" || v === "success";
  }
  return false;
}

function parseSentiment(outcome: string, callSuccess: boolean, summary: string): string {
  if (callSuccess) return "positive";
  if (["no_answer", "voicemail", "busy"].includes(outcome)) return "neutral";
  const lower = summary.toLowerCase();
  if (lower.match(/interest|yes|want|tell me more|send|absolutely|sure/)) return "positive";
  if (lower.match(/not interest|no thank|remove|stop|don.t call|do not call/)) return "negative";
  return "neutral";
}

function parseLeadStatus(outcome: string, callSuccess: boolean): string {
  if (callSuccess) return "qualified";
  if (outcome === "answered") return "contacted";
  return "open";
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
    // Verify secret if configured
    if (WEBHOOK_SECRET) {
      const url      = new URL(req.url);
      const provided = req.headers.get("x-vapi-secret") ?? url.searchParams.get("secret");
      if (provided !== WEBHOOK_SECRET) {
        console.warn("[vapi-webhook] Unauthorized");
        return json({ error: "Unauthorized" }, 401);
      }
    }

    const body    = await req.json();
    const message = body?.message;

    // Acknowledge non-report events silently
    if (!message || message.type !== "end-of-call-report") {
      return json({ received: true });
    }

    const call           = message.call ?? {};
    const customerNumber = call?.customer?.number as string | undefined;

    if (!customerNumber) {
      console.warn("[vapi-webhook] Missing customer.number");
      return json({ received: true });
    }

    // Extract call data
    const endedReason     = (message.endedReason ?? call.endedReason ?? "") as string;
    const durationSeconds = (message.durationSeconds ?? call.duration ?? 0) as number;
    const analysisSummary = (message.analysis?.summary ?? message.summary ?? "") as string;
    const transcript      = (message.transcript ?? "") as string;
    const successEval     = message.analysis?.successEvaluation;
    const callId          = (call.id ?? "") as string;

    const outcome     = parseOutcome(endedReason);
    const callSuccess = parseCallSuccess(successEval);
    const sentiment   = parseSentiment(outcome, callSuccess, analysisSummary);
    const leadStatus  = parseLeadStatus(outcome, callSuccess);
    const callSummary = analysisSummary || (transcript ? transcript.slice(0, 1200) : null);

    // Find lead by phone (try multiple formats)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const variants = phoneVariants(customerNumber);

    let lead: { id: string; call_attempt_count: number | null; outreach_stage: string } | null = null;
    for (const phone of variants) {
      const { data } = await supabase
        .from("fica_leads")
        .select("id, call_attempt_count, outreach_stage")
        .eq("phone", phone)
        .maybeSingle();
      if (data) { lead = data; break; }
    }

    if (!lead) {
      console.warn(`[vapi-webhook] No lead found for ${customerNumber}`);
      return json({ received: true });
    }

    // Build update payload
    const update: Record<string, unknown> = {
      outcome,
      call_success:   callSuccess,
      sentiment,
      lead_status:    leadStatus,
      call_summary:   callSummary,
      last_called_at: new Date().toISOString(),
      call_duration:  durationSeconds,
    };

    if (callSuccess) {
      update.outreach_stage = "called_success";
      update.lead_qualified = true;
    } else if (outcome === "answered") {
      // Answered but prospect declined
      update.outreach_stage = "not_interested";
      update.lead_qualified = false;
    }
    // no_answer / voicemail / busy → leave stage alone; fica_vapi.js manages retries

    const { error: updateErr } = await supabase
      .from("fica_leads")
      .update(update)
      .eq("id", lead.id);

    if (updateErr) {
      console.error("[vapi-webhook] DB update failed:", updateErr.message);
      return json({ error: "DB update failed" }, 500);
    }

    // Append to outreach log
    await supabase.from("fica_outreach_log").insert({
      lead_id:       lead.id,
      status:        outcome,
      last_call_id:  callId || null,
      body:          callSummary,
      sent_at:       new Date().toISOString(),
      attempt_count: (lead.call_attempt_count ?? 0) + 1,
    });

    console.log(
      `[vapi-webhook] lead=${lead.id} outcome=${outcome} success=${callSuccess} ` +
      `sentiment=${sentiment} duration=${durationSeconds}s`
    );

    return json({ received: true, leadId: lead.id, outcome, callSuccess });

  } catch (err) {
    console.error("[vapi-webhook] Fatal:", err);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
