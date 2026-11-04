// POST { mode: "audit" | "qa", agent, transcript, feedback, history, question }
// Reliability: tries several Gemini models with retries, then falls back to Groq's LLM.
import { KNOWLEDGE } from "./_knowledge.js";
 
const PERSONA = `You are "Coach", a warm, expert human sales trainer at Bhagya Achievers.
You speak to the sales agent directly, like a real senior trainer sitting next to them,
in natural spoken Hinglish (mix of Hindi and English the way Indian offices talk).
Be encouraging but honest. Short, clear sentences. Never use bullet points, markdown or emojis.
Base every judgement on the company knowledge below. Never invent company facts that are not in it.
 
${KNOWLEDGE}`;
 
const SAY_RULE = `For every piece of speech give two versions:
"show": the Hinglish text in Roman script, to display on screen;
"say": the SAME content written for a Hindi text-to-speech voice — Hindi words in Devanagari,
and English words also written phonetically in Devanagari (e.g. "फीडबैक", "स्कोर", "व्हाट्सऐप"),
numbers written as Hindi words. No symbols like ₹ or / in "say" (write "रुपये").`;
 
export async function POST(request) {
  try {
    const body = await request.json();
    const agent = (body.agent || "").trim() || "dost";
    const prompt = body.mode === "audit" ? auditPrompt(agent, body) : qaPrompt(agent, body);
    if (!prompt) return json({ error: "Transcript nahi mila." }, 400);
 
    const errors = [];
    // 1) Gemini — several models, retry on overload
    if (process.env.GEMINI_API_KEY) {
      const models = [process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL,
        "gemini-flash-latest", "gemini-flash-lite-latest"].filter((m, i, a) => m && a.indexOf(m) === i);
      for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await gemini(model, prompt);
          if (r.ok) return json(r.data);
          errors.push(`Gemini ${model}: ${r.msg}`);
          if (!r.retry) break;            // model not available / bad key → next model
          await sleep(1500 * (attempt + 1));
        }
      }
    }
    // 2) Groq LLM fallback (same free Groq key)
    if (process.env.GROQ_API_KEY) {
      const models = [process.env.GROQ_CHAT_MODEL, "openai/gpt-oss-120b", "llama-3.3-70b-versatile"]
        .filter((m, i, a) => m && a.indexOf(m) === i);
      for (const model of models) {
        const r = await groq(model, prompt);
        if (r.ok) return json(r.data);
        errors.push(`Groq ${model}: ${r.msg}`);
      }
    }
    console.error(errors.join(" | "));
    return json({ error: "Abhi saare AI servers busy hain, 1 minute baad dobara dabaiye. (" + (errors[errors.length - 1] || "no key") + ")" }, 503);
  } catch (e) {
    return json({ error: "Coach error: " + e.message }, 500);
  }
}
 
function auditPrompt(agent, body) {
  if (!body.transcript) return null;
  return `${PERSONA}
 
TASK: Below is the auto-generated transcript of a sales call (timestamps in [mm:ss]; speakers are
not labelled — work out from context who is the agent and who is the student; transcription may
have small errors, so judge the meaning). The agent's name is "${agent}".
 
Audit the call against Module 7 and the delivery rules, then coach the agent out loud.
 
Return ONLY JSON in this exact shape:
{
  "score": number (0-10, one decimal allowed),
  "summary": "2-3 line summary for the manager in Hinglish",
  "mistakes": [ { "time": "mm:ss", "issue": "what went wrong", "better": "exact better line to say" } ],
  "strengths": [ "short point" ],
  "parts": [ { "show": "...", "say": "..." } ]
}
"parts" is the spoken coaching, 5 to 8 parts, in this order:
1) greet: "Hi ${agent}! Kaise ho? Maine aapki call suni..."
2) one or two genuine strengths
3) one part per important mistake: roughly when it happened, what they said, why it hurts,
   and "next time aap aise bol sakte ho: ..." with the script line
4) score out of 10 and the ONE focus for the next call
5) motivating close, then ask: "Kya aapke koi sawaal hain? Mic dabake poochh lijiye."
${SAY_RULE}
 
TRANSCRIPT:
${String(body.transcript).slice(0, 100000)}`;
}
 
function qaPrompt(agent, body) {
  const hist = (body.history || []).slice(-8).map(h => `${h.role === "user" ? agent : "Coach"}: ${h.text}`).join("\n");
  return `${PERSONA}
 
You already reviewed ${agent}'s call. Your earlier feedback summary: ${body.feedback || "(none)"}
Call transcript (for reference): ${String(body.transcript || "").slice(0, 40000)}
 
Conversation so far:
${hist}
 
${agent} now asks: "${body.question}"
 
Answer like a human trainer speaking, 2 to 5 sentences, practical, using the approved scripts where
relevant. If it is outside the company knowledge, give sound sales advice and say it is not in the
company script yet.
Return ONLY JSON: { "show": "...", "say": "..." }
${SAY_RULE}`;
}
 
async function gemini(model, prompt) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, retry: [429, 500, 503, 504].includes(r.status), msg: d?.error?.message || r.status };
    const text = d?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    const data = parse(text);
    return data ? { ok: true, data } : { ok: false, retry: true, msg: "bad JSON" };
  } catch (e) { return { ok: false, retry: true, msg: e.message }; }
}
 
async function groq(model, prompt) {
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model, temperature: 0.5, response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, msg: d?.error?.message || r.status };
    const data = parse(d?.choices?.[0]?.message?.content || "");
    return data ? { ok: true, data } : { ok: false, msg: "bad JSON" };
  } catch (e) { return { ok: false, msg: e.message }; }
}
 
function parse(t) {
  try { return JSON.parse(String(t).trim().replace(/^```(?:json)?\s*|```$/g, "")); } catch { return null; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }); }
