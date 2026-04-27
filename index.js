import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SCHEMA_PROMPT = `
Return ONLY valid JSON:
{
  "careers": [
    {
      "title": "string",
      "role_overview": "string",
      "why_fit": "string",
      "income": "string (PKR)",
      "time_to_earn": "string",
      "skills": [{"name": "string", "simple_explanation": "string", "type": "Technical|Soft"}],
      "roadmap": [{"title": "string", "desc": "string"}],
      "match": number,
      "demandTag": "string",
      "attributeTag": "string"
    }
  ],
  "reality_check": { "competition": "string", "risk": "string", "effort": "string" },
  "alternative_paths": [{"title": "string", "description": "string"}],
  "what_to_avoid": [{"pitfall": "string", "reason": "string" }]
}`;

const SYSTEM_PROMPT = `You are a career counselor in Pakistan. Suggest 3 options. ${SCHEMA_PROMPT}`;

// --- ENGINES ---

const cleanJSON = (text) => text.replace(/```json/g, '').replace(/```/g, '').trim();

const tryGemini = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("No Gemini Key");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  return cleanJSON(result.response.text());
};

const tryOpenRouter = async (prompt) => {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "meta-llama/llama-3-8b-instruct:free", "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"} })
  });
  const d = await r.json();
  return d.choices[0].message.content;
};

const tryGroq = async (prompt) => {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "llama3-8b-8192", "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"} })
  });
  const d = await r.json();
  return d.choices[0].message.content;
};

const tryCohere = async (prompt) => {
  const r = await fetch("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.COHERE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "command-r-plus", "message": prompt })
  });
  const d = await r.json();
  return d.text;
};

app.post('/api/analyze-path', async (req, res) => {
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  const providers = [
    { name: "Gemini", fn: tryGemini },
    { name: "OpenRouter", fn: tryOpenRouter },
    { name: "Groq", fn: tryGroq },
    { name: "Cohere", fn: tryCohere }
  ];

  for (const p of providers) {
    try {
      console.log(`Trying ${p.name}...`);
      const text = await p.fn(prompt);
      const data = JSON.parse(cleanJSON(text));
      if (data && data.careers) {
        console.log(`SUCCESS: ${p.name}`);
        return res.json({ success: true, provider: p.name, data });
      }
    } catch (e) { console.error(`${p.name} failed: ${e.message}`); }
  }

  res.status(503).json({ error: 'All AI services are currently unavailable. Please try again later.' });
});

app.listen(PORT, () => console.log(`Server live at ${PORT}`));
