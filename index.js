import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SCHEMA_PROMPT = `Return ONLY JSON object. { "careers": [...], "reality_check": {...}, "alternative_paths": [...], "what_to_avoid": [...] }`;
const SYSTEM_PROMPT = `YOU ARE A JSON GENERATOR. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) return "";
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1).trim();
};

// --- ENGINES ---

const tryOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OR Key missing.");
  const models = ["google/gemini-2.0-flash-001", "meta-llama/llama-3.1-8b-instruct:free"];
  for (const model of models) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
      });
      const d = await r.json();
      if (r.ok && d.choices?.[0]?.message?.content) return d.choices[0].message.content;
      console.warn(`[DEBUG] OR Model ${model} failed: ${d.error?.message || r.status}`);
    } catch (e) {}
  }
  throw new Error("OpenRouter models exhausted.");
};

const tryGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing.");
  const models = ["llama3-8b-8192", "mixtral-8x7b-32768"];
  for (const model of models) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
      });
      const d = await r.json();
      if (r.ok && d.choices?.[0]?.message?.content) return d.choices[0].message.content;
      console.warn(`[DEBUG] Groq Model ${model} failed: ${d.error?.message || r.status}`);
    } catch (e) {}
  }
  throw new Error("Groq models exhausted.");
};

const tryGemini = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini Key missing.");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  return result.response.text();
};

app.post('/api/analyze-path', async (req, res) => {
  // ✅ HEALTH CHECK (VERY IMPORTANT)
  console.log("\n--- [HEALTH CHECK] Keys loaded:", {
    OR: !!process.env.OPENROUTER_API_KEY,
    Groq: !!process.env.GROQ_API_KEY,
    Gemini: !!process.env.GEMINI_API_KEY
  });

  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  const providers = [
    { name: "OpenRouter", fn: tryOpenRouter },
    { name: "Groq", fn: tryGroq },
    { name: "Gemini", fn: tryGemini }
  ];

  for (const p of providers) {
    try {
      console.log(`[PROCESS] Trying ${p.name}...`);
      const rawText = await p.fn(prompt);
      const cleaned = cleanJSON(rawText);
      const parsedData = JSON.parse(cleaned);
      if (parsedData && parsedData.careers) {
        console.log(`✅ SUCCESS: ${p.name}`);
        return res.json({ success: true, provider: p.name, data: parsedData });
      }
    } catch (e) {
      console.error(`❌ ${p.name} Total Failure:`, e.message);
    }
  }

  return res.status(503).json({ error: 'All AI services exhausted.' });
});

app.listen(PORT, () => console.log(`Health-Check Backend live on port ${PORT}`));
