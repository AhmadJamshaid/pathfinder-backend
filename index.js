import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- PROVIDER 1: GEMINI ---
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite-001'];

// --- PROVIDER 2: OPENROUTER ---
const generateWithOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OpenRouter Key missing");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "meta-llama/llama-3-8b-instruct:free",
      "messages": [{ "role": "user", "content": prompt }],
      "response_format": { "type": "json_object" }
    })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

// --- PROVIDER 3: GROQ ---
const generateWithGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing");
  console.log("Switching to Groq (Final Emergency Backup)...");
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "llama3-8b-8192",
      "messages": [{ "role": "user", "content": prompt }],
      "response_format": { "type": "json_object" }
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || "Groq failed");
  return data.choices[0].message.content;
};

app.post('/api/analyze-path', async (req, res) => {
  try {
    const userData = req.body;
    const SYSTEM_PROMPT = "You are a career counselor for students in Pakistan. Output EXACTLY 3 career options in valid JSON.";
    const prompt = `${SYSTEM_PROMPT}\n\nUser Data: ${JSON.stringify(userData)}`;

    let finalResult = null;
    let lastError = null;

    // --- PHASE 1: GEMINI ---
    for (const modelName of GEMINI_MODELS) {
      try {
        const model = ai.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        finalResult = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
        if (finalResult) break;
      } catch (err) { lastError = err; }
    }

    // --- PHASE 2: OPENROUTER ---
    if (!finalResult) {
      try {
        const orText = await generateWithOpenRouter(prompt);
        finalResult = JSON.parse(orText.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (err) { lastError = err; }
    }

    // --- PHASE 3: GROQ ---
    if (!finalResult) {
      try {
        const groqText = await generateWithGroq(prompt);
        finalResult = JSON.parse(groqText.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (err) { lastError = err; }
    }

    if (finalResult) return res.json({ success: true, data: finalResult });

    return res.status(500).json({ error: 'All AI providers exhausted.', details: lastError?.message });

  } catch (error) {
    return res.status(500).json({ error: 'System crash.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
