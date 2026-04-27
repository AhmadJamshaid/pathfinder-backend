import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SCHEMA_PROMPT = `Return ONLY valid JSON: { "careers": [...], "reality_check": {...}, "alternative_paths": [...], "what_to_avoid": [...] }`;
const SYSTEM_PROMPT = `Career Counselor Pakistan. suggest 3 careers. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) throw new Error("Empty response from AI");
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

const tryOpenRouter = async (prompt) => {
  // Check key visibility
  console.log("API Key Check:", process.env.OPENROUTER_API_KEY ? "✅ KEY FOUND" : "❌ KEY MISSING");
  
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing from environment.");
  }
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });
  
  const data = await response.json();
  
  // --- HIGH VISIBILITY LOGGING (VERY IMPORTANT) ---
  console.log("OpenRouter response:", JSON.stringify(data, null, 2));
  
  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status} Error`);
  }
  
  // --- STRICT VALIDATION ---
  if (!data.choices || data.choices.length === 0) {
    throw new Error("OpenRouter API returned no choices. Check your credits or model status.");
  }
  
  const content = data.choices[0].message?.content;
  if (!content) throw new Error("Choice found but message content is empty.");
  
  return content;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [START] New Career Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  
  try {
    // Phase: OpenRouter ONLY (TEMPORARY DEBUG MODE)
    const rawText = await tryOpenRouter(prompt);
    const cleaned = cleanJSON(rawText);
    const finalResult = JSON.parse(cleaned);
    
    if (finalResult && finalResult.careers) {
      console.log(`✅ SUCCESS: Analysis fulfilled by OpenRouter`);
      return res.json({ success: true, provider: "OpenRouter", data: finalResult });
    }
  } catch (e) {
    console.error(`❌ FAILURE in OpenRouter:`, e.message);
    return res.status(503).json({ error: `AI Analysis Error: ${e.message}` });
  }
});

app.listen(PORT, () => console.log(`Debug-Mode Backend live on port ${PORT}`));
