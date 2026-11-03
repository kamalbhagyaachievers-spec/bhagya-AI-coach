# Bhagya Achievers — AI Sales Coach

Agent apni call recording upload karta hai → Groq Whisper transcript banata hai → Gemini call ko
Module 7 (Objection Handling) ke hisaab se audit karta hai → Coach Hindi voice mein feedback deta hai
→ agent bol ke sawaal poochta hai, coach bol ke jawab deta hai.

## Files
- `index.html` — full-screen app (upload, coach avatar, waveforms, voice Q&A)
- `api/transcribe.js` — recording → transcript (Groq, free tier)
- `api/coach.js` — audit + Q&A (Google Gemini, free tier)
- `api/_knowledge.js` — company knowledge (Module 7). Naye modules yahan paste karo.

## Vercel Environment Variables
| Name | Value |
|---|---|
| `GROQ_API_KEY` | console.groq.com se |
| `GEMINI_API_KEY` | aistudio.google.com se |
| `GEMINI_MODEL` (optional) | default `gemini-2.5-flash` — agar error aaye "model not found", AI Studio mein jo latest Flash model dikhe uska naam daalo |

## Limits
- Recording 4.4 MB tak (Knowlarity ki normal MP3 ~25 min ≈ 3 MB).
- Free tier ki daily limits Groq/Google decide karte hain.
- Best Hindi awaaz: Microsoft Edge.
