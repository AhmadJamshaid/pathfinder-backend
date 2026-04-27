import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SCHEMA_PROMPT = `Return ONLY valid JSON: { "careers": [...], "reality_check": {...}, "alternative_paths": [...], "what_to_avoid": [...] }`;
const SYSTEM_PROMPT = `Career Counselor Pakistan. suggest 3 careers. ${SCHEMA_PROMPT}`;

// --- UTILS ---
const cleanJSON = (text) => {
  if (!text) return "";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

// --- ENGINES ---

const tryGemini = async (prompt) => {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing.");
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  if (!text) throw new Error("Gemini returned empty text.");
  return text;
};

const tryOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing.");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "meta-llama/llama-3-8b-instruct:free", "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"} })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "OpenRouter HTTP Error");
  const content = d.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content.");
  return content;
};

const tryGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing.");
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "llama3-8b-8192", "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"} })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Groq HTTP Error");
  const content = d.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content.");
  return content;
};

const tryCohere = async (prompt) => {
  if (!process.env.COHERE_API_KEY) throw new Error("COHERE_API_KEY is missing.");
  const r = await fetch("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.COHERE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "command-r-plus", "message": prompt })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || "Cohere HTTP Error");
  const text = d.text;
  if (!text) throw new Error("Cohere returned no text.");
  return text;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("--- New Scan Request Received ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  
  const providers = [
    { name: "Gemini", fn: tryGemini },
    { name: "OpenRouter", fn: tryOpenRouter },
    { name: "Groq", fn: tryGroq },
    { name: "Cohere", fn: tryCohere }
  ];

  let finalResult = null;
  let successfulProvider = null;

  for (const p of providers) {
    try {
      console.log(`Phase: Attempting ${p.name}...`);
      const rawText = await p.fn(prompt);
      
      const cleaned = cleanJSON(rawText);
      finalResult = JSON.parse(cleaned);
      
      if (finalResult && finalResult.careers) {
        successfulProvider = p.name;
        console.log(`SUCCESS: Analysis fulfilled by ${p.name}`);
        break;
      }
    } catch (e) {
      console.error(`ERROR in ${p.name}:`, e.message);
    }
  }

  if (finalResult) {
    return res.json({ success: true, provider: successfulProvider, data: finalResult });
  }

  return res.status(503).json({ error: 'All AI services are currently unavailable. Please check your API keys in Vercel.' });
});

app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
