import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE ABSOLUTE BLUEPRINT ---
const SCHEMA_PROMPT = `
Return ONLY a JSON object. NO EXPLANATION. NO EXTRA TEXT.
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

const SYSTEM_PROMPT = `YOU ARE A JSON GENERATOR. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) return "";
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1).trim();
};

const tryOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Key missing.");
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify({ 
      model: "google/gemini-2.0-flash-001", 
      messages: [{ role: "user", content: prompt }] 
    })
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OR API Error");
  
  const aiText = data.choices?.[0]?.message?.content;
  if (!aiText) throw new Error("No content returned from AI.");
  
  return aiText;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [OPENROUTER-ONLY MODE] New Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Data: ${JSON.stringify(req.body)}`;
  
  try {
    const rawText = await tryOpenRouter(prompt);
    const cleanedText = cleanJSON(rawText);
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (e) {
      console.error("❌ JSON Parse Failed. Raw Text:", rawText);
      return res.status(500).json({ error: "Invalid AI response." });
    }
    
    if (parsedData && parsedData.careers) {
      console.log("FINAL CLEAN DATA:", JSON.stringify(parsedData, null, 2));
      return res.json({ success: true, data: parsedData });
    }
    
  } catch (err) {
    console.error(`❌ FAILURE:`, err.message);
    return res.status(503).json({ error: `System Error: ${err.message}` });
  }
});

app.listen(PORT, () => console.log(`OpenRouter-Only Backend live on port ${PORT}`));
