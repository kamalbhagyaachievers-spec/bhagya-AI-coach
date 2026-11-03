// POST { mode: "audit" | "qa", agent, transcript, feedback, history, question }
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
    const key = process.env.GEMINI_API_KEY;
    if (!key) return json({ error: "GEMINI_API_KEY Vercel settings mein nahi daali gayi." }, 500);
    const body = await request.json();
    const agent = (body.agent || "").trim() || "dost";

    let prompt;
    if (body.mode === "audit") {
      if (!body.transcript) return json({ error: "Transcript nahi mila." }, 400);
      prompt = `${PERSONA}

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
${String(body.transcript).slice(0, 120000)}`;
    } else {
      const hist = (body.history || []).slice(-8).map(h => `${h.role === "user" ? agent : "Coach"}: ${h.text}`).join("\n");
      prompt = `${PERSONA}

You already reviewed ${agent}'s call. Your earlier feedback summary: ${body.feedback || "(none)"}
Call transcript (for reference): ${String(body.transcript || "").slice(0, 60000)}

Conversation so far:
${hist}

${agent} now asks: "${body.question}"

Answer like a human trainer speaking, 2 to 5 sentences, practical, using the approved scripts where
relevant. If it is outside the company knowledge, give sound sales advice and say it is not in the
company script yet. End with a short check like "Samajh aaya?" only sometimes.
Return ONLY JSON: { "show": "...", "say": "..." }
${SAY_RULE}`;
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "Gemini: " + (data?.error?.message || r.status) }, 502);
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    let out;
    try { out = JSON.parse(text.replace(/^```json\s*|```$/g, "")); }
    catch { return json({ error: "AI ka jawab samajh nahi aaya, dobara try karo." }, 502); }
    return json(out);
  } catch (e) {
    return json({ error: "Coach error: " + e.message }, 500);
  }
}

function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }); }
