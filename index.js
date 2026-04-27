import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- PROVIDER FUNCTIONS ---

const generateWithOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OR Key missing");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "meta-llama/llama-3-8b-instruct:free", "messages": [{ "role": "user", "content": prompt }] })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

const generateWithGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing");
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "llama3-8b-8192", "messages": [{ "role": "user", "content": prompt }] })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

const generateWithCohere = async (prompt) => {
  if (!process.env.COHERE_API_KEY) throw new Error("Cohere Key missing");
  console.log("Switching to Cohere (Final Backup Tier)...");
  const resp = await fetch("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.COHERE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ "model": "command-r-plus", "message": prompt })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || "Cohere failed");
  return data.text;
};

app.post('/api/analyze-path', async (req, res) => {
  try {
    const prompt = `Career Counselor for Pakistan. RETURN ONLY VALID JSON. Data: ${JSON.stringify(req.body)}`;
    let finalResult = null;
    let lastError = null;

    // TIER 1: GEMINI
    try {
      const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      finalResult = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) { lastError = e; }

    // TIER 2: OPENROUTER
    if (!finalResult) {
      try {
        const text = await generateWithOpenRouter(prompt);
        finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) { lastError = e; }
    }

    // TIER 3: GROQ
    if (!finalResult) {
      try {
        const text = await generateWithGroq(prompt);
        finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) { lastError = e; }
    }

    // TIER 4: COHERE
    if (!finalResult) {
      try {
        const text = await generateWithCohere(prompt);
        finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) { lastError = e; }
    }

    if (finalResult) return res.json({ success: true, data: finalResult });
    return res.status(500).json({ error: 'All providers failed.', detail: lastError?.message });

  } catch (error) {
    return res.status(500).json({ error: 'System error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
