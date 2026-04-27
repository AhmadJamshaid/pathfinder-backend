import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// Provider 1: Gemini
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite-001', 'gemini-2.5-flash'];

// --- OPENROUTER FALLBACK ENGINE ---
const generateWithOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API Key not configured.");
  }

  console.log("Switching to OpenRouter (Llama-3 Fallback)...");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "meta-llama/llama-3-8b-instruct:free", // Using a reliable free model
      "messages": [
        { "role": "user", "content": prompt }
      ],
      "response_format": { "type": "json_object" }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenRouter failed");
  
  return data.choices[0].message.content;
};

app.post('/api/analyze-path', async (req, res) => {
  try {
    const userData = req.body;
    const SYSTEM_PROMPT = `
You are a career counselor for students in Pakistan. 
Return EXACTLY 3 career suggestions in JSON format.
    `.trim();
    const prompt = `${SYSTEM_PROMPT}\n\nUser Data: ${JSON.stringify(userData)}`;

    let finalResult = null;
    let lastError = null;

    // --- PHASE 1: TRY GEMINI MODELS ---
    for (const modelName of GEMINI_MODELS) {
      try {
        console.log(`Trying Gemini: ${modelName}`);
        const model = ai.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        finalResult = JSON.parse(text);
        break;
      } catch (err) {
        console.error(`Gemini ${modelName} failed: ${err.message}`);
        lastError = err;
      }
    }

    // --- PHASE 2: EMERGENCY FALLBACK TO OPENROUTER ---
    if (!finalResult) {
      try {
        const orText = await generateWithOpenRouter(prompt);
        finalResult = JSON.parse(orText.replace(/```json/g, '').replace(/```/g, '').trim());
        console.log("Success! Request fulfilled by OpenRouter.");
      } catch (orErr) {
        console.error("OpenRouter Fallback also failed:", orErr.message);
        lastError = orErr;
      }
    }

    if (finalResult) {
      return res.json({ success: true, data: finalResult });
    }

    return res.status(500).json({ 
      error: 'All AI providers are currently unavailable.',
      details: lastError?.message 
    });

  } catch (error) {
    console.error('System Error:', error);
    return res.status(500).json({ error: 'Critical system failure.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
