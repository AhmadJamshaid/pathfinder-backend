import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- DEBUG STATUS ENDPOINT ---
app.get('/api/status', (req, res) => {
  res.json({
    message: "PathFinder Backend Status",
    keys_loaded: {
      OpenRouter: !!process.env.OPENROUTER_API_KEY,
      Groq: !!process.env.GROQ_API_KEY,
      Gemini: !!process.env.GEMINI_API_KEY
    },
    deployment: "Vercel / Standalone",
    timestamp: new Date().toISOString()
  });
});

const SCHEMA_PROMPT = `Return ONLY JSON object. { "careers": [...], "reality_check": {...}, "alternative_paths": [...], "what_to_avoid": [...] }`;
const SYSTEM_PROMPT = `YOU ARE A JSON GENERATOR. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) return "";
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1).trim();
};

const tryOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OR Key missing in Vercel.");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.0-flash-001", messages: [{ role: "user", content: prompt }] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "OR API Error");
  return d.choices?.[0]?.message?.content;
};

const tryGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing in Vercel.");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama3-8b-8192", messages: [{ role: "user", content: prompt }] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Groq API Error");
  return d.choices?.[0]?.message?.content;
};

const tryGemini = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini Key missing in Vercel.");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  return result.response.text();
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [STATUS CHECK] Scanning Keys ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  const providers = [
    { name: "OpenRouter", fn: tryOpenRouter },
    { name: "Groq", fn: tryGroq },
    { name: "Gemini", fn: tryGemini }
  ];

  const errors = [];

  for (const p of providers) {
    try {
      console.log(`[DEBUG] Attempting ${p.name}...`);
      const rawText = await p.fn(prompt);
      const cleaned = cleanJSON(rawText);
      const parsedData = JSON.parse(cleaned);
      if (parsedData && parsedData.careers) {
        return res.json({ success: true, provider: p.name, data: parsedData });
      }
    } catch (e) {
      console.error(`❌ ${p.name} failed:`, e.message);
      errors.push(`${p.name}: ${e.message}`);
    }
  }

  return res.status(503).json({ 
    success: false, 
    error: 'All providers failed.', 
    details: errors 
  });
});

app.listen(PORT, () => console.log(`Status-Aware Backend live on port ${PORT}`));
