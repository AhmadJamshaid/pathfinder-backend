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
const SYSTEM_PROMPT = `Career Counselor Pakistan. Simple English. Suggest 3 careers. ${SCHEMA_PROMPT}`;

// --- PROVIDER ENGINES ---

const generateWithOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OR Key missing");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "meta-llama/llama-3-8b-instruct:free", "messages": [{ "role": "user", "content": prompt }], "response_format": { "type": "json_object" } })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

const generateWithGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing");
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "llama3-8b-8192", "messages": [{ "role": "user", "content": prompt }], "response_format": { "type": "json_object" } })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

const generateWithCohere = async (prompt) => {
  if (!process.env.COHERE_API_KEY) throw new Error("Cohere Key missing");
  const resp = await fetch("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.COHERE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "command-r-plus", "message": prompt })
  });
  const data = await resp.json();
  return data.text;
};

app.post('/api/analyze-path', async (req, res) => {
  try {
    const prompt = `${SYSTEM_PROMPT}\n\nData: ${JSON.stringify(req.body)}`;
    let finalResult = null;
    let successfulProvider = null;

    // 1. Try Gemini
    try {
      console.log("Attempting Gemini...");
      const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
      finalResult = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
      if (finalResult) successfulProvider = "Gemini";
    } catch (e) { console.error("Gemini failed."); }

    // 2. Try Fallbacks
    if (!finalResult) {
      const fallbacks = [
        { name: "OpenRouter", fn: generateWithOpenRouter },
        { name: "Groq", fn: generateWithGroq },
        { name: "Cohere", fn: generateWithCohere }
      ];

      for (const f of fallbacks) {
        try {
          console.log(`Attempting ${f.name}...`);
          const text = await f.fn(prompt);
          finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
          if (finalResult) {
            successfulProvider = f.name;
            break;
          }
        } catch (e) { console.error(`${f.name} failed.`); }
      }
    }

    if (finalResult && finalResult.careers) {
      console.log(`SUCCESS: Analysis fulfilled by ${successfulProvider}`);
      return res.json({ 
        success: true, 
        provider: successfulProvider,
        data: finalResult 
      });
    }

    // Final failure message as requested
    console.error("CRITICAL: All AI providers failed.");
    return res.status(503).json({ error: 'All AI services are currently unavailable. Please try again later.' });

  } catch (error) {
    return res.status(500).json({ error: 'Internal system error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
