// POST raw audio bytes -> Groq Whisper -> transcript with timestamps
export async function POST(request) {
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return json({ error: "GROQ_API_KEY Vercel settings mein nahi daali gayi." }, 500);

    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: "Recording khali hai." }, 400);
    const type = request.headers.get("content-type") || "audio/mpeg";
    const name = request.headers.get("x-file-name") || "call.mp3";

    const form = new FormData();
    form.append("file", new Blob([buf], { type }), name);
    form.append("model", process.env.GROQ_MODEL || "whisper-large-v3");
    form.append("language", "hi");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "Groq: " + (data?.error?.message || r.status) }, 502);

    const lines = (data.segments || []).map(s => `[${mmss(s.start)}] ${s.text.trim()}`);
    return json({ transcript: lines.length ? lines.join("\n") : (data.text || ""), duration: data.duration });
  } catch (e) {
    return json({ error: "Transcribe error: " + e.message }, 500);
  }
}

function mmss(t) { t = Math.floor(t || 0); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }
function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } }); }
