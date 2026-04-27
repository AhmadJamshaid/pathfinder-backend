import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE MASTER BLUEPRINT (Shared by all AI providers) ---
const SCHEMA_PROMPT = `
You must return ONLY a JSON object with this exact structure:
{
  "careers": [
    {
      "title": "string",
      "role_overview": "string",
      "why_fit": "string",
      "income": "string (in PKR)",
      "time_to_earn": "string",
      "skills": [{ "name": "string", "simple_explanation": "string", "type": "Technical|Soft|Tool" }],
      "roadmap": [{ "title": "string", "desc": "string" }],
      "match": number (0-100),
      "demandTag": "string (e.g. High Demand)",
      "attributeTag": "string (e.g. Creativity)"
    }
  ],
  "reality_check": { "competition": "string", "risk": "string", "effort": "string" },
  "alternative_paths": [{ "title": "string", "description": "string" }],
  "what_to_avoid": [{ "pitfall": "string", "reason": "string" }]
}
`;

const SYSTEM_PROMPT = `
You are a friendly career counselor for students in Pakistan. 
Write in simple English like a helpful teacher.
Suggest exactly 3 career options.
${SCHEMA_PROMPT}
`.trim();

// --- PROVIDER ENGINES ---

const generateWithOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OR Key missing");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ 
      "model": "meta-llama/llama-3-8b-instruct:free", 
      "messages": [{ "role": "user", "content": prompt }],
      "response_format": { "type": "json_object" } // Forces JSON output
    })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

const generateWithGroq = async (prompt) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Groq Key missing");
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ 
      "model": "llama3-8b-8192", 
      "messages": [{ "role": "user", "content": prompt }],
      "response_format": { "type": "json_object" } 
    })
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
    const prompt = `${SYSTEM_PROMPT}\n\nUser Profile Data: ${JSON.stringify(req.body)}`;
    let finalResult = null;
    let lastError = null;

    // TIER 1: GEMINI
    try {
      const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
      finalResult = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) { lastError = e; console.log("Gemini failed, trying fallbacks..."); }

    // FALLBACK CHAIN
    if (!finalResult) {
      const providers = [
        { name: "OpenRouter", fn: generateWithOpenRouter },
        { name: "Groq", fn: generateWithGroq },
        { name: "Cohere", fn: generateWithCohere }
      ];

      for (const provider of providers) {
        try {
          console.log(`Attempting fallback: ${provider.name}...`);
          const text = await provider.fn(prompt);
          finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
          if (finalResult) {
            console.log(`Success! Request fulfilled by ${provider.name}`);
            break;
          }
        } catch (e) { lastError = e; console.error(`${provider.name} failed.`); }
      }
    }

    if (finalResult && finalResult.careers) {
      return res.json({ success: true, data: finalResult });
    }

    return res.status(500).json({ error: 'All providers failed to return valid data.', detail: lastError?.message });

  } catch (error) {
    return res.status(500).json({ error: 'System error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
