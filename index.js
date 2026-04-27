import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE ABSOLUTE BLUEPRINT ---
const SCHEMA_PROMPT = `
You MUST return ONLY a JSON object. NO EXPLANATION. NO EXTRA TEXT.
Structure:
{
  "careers": [
    {
      "title": "string",
      "match": number,
      "demandTag": "string",
      "attributeTag": "string",
      "role_overview": "string",
      "why_fit": "string",
      "income": "string",
      "time_to_earn": "string",
      "skills": [{ "name": "string", "simple_explanation": "string", "type": "core|secondary" }],
      "roadmap": [{ "title": "string", "desc": "string" }]
    }
  ],
  "reality_check": { "competition": "string", "risk": "string", "effort": "string" },
  "alternative_paths": [{ "title": "string", "description": "string" }],
  "what_to_avoid": [{ "pitfall": "string", "reason": "string" }]
}
`;

const SYSTEM_PROMPT = `YOU ARE A JSON GENERATOR. Career Counselor Pakistan. ${SCHEMA_PROMPT}`;

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
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.0-flash-001", messages: [{ role: "user", content: prompt }] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "OR Error");
  return d.choices?.[0]?.message?.content;
};

const tryGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing.");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama3-8b-8192", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Groq Error");
  return d.choices?.[0]?.message?.content;
};

const tryGemini = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini Key missing.");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  return result.response.text();
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [PROD MODE] New Career Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  
  const providers = [
    { name: "OpenRouter", fn: tryOpenRouter },
    { name: "Groq", fn: tryGroq },
    { name: "Gemini", fn: tryGemini }
  ];

  for (const p of providers) {
    try {
      console.log(`[DEBUG] Attempting ${p.name}...`);
      const rawText = await p.fn(prompt);
      const cleaned = cleanJSON(rawText);
      const parsedData = JSON.parse(cleaned);
      
      if (parsedData && parsedData.careers) {
        console.log(`✅ SUCCESS: Analysis fulfilled by ${p.name}`);
        console.log("FINAL CLEAN DATA:", JSON.stringify(parsedData, null, 2));
        return res.json({ success: true, provider: p.name, data: parsedData });
      }
    } catch (e) {
      console.error(`❌ ${p.name} Failed:`, e.message);
    }
  }

  return res.status(503).json({ error: 'All AI services unavailable.' });
});

app.listen(PORT, () => console.log(`Production-Ready Backend live on port ${PORT}`));
