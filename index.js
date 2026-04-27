import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE MANDATORY BLUEPRINT ---
const SCHEMA_PROMPT = `
You MUST return ONLY a JSON object with this exact structure:
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

const SYSTEM_PROMPT = `Career Counselor Pakistan. suggest 3 careers. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) return "";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
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
  
  // ✅ Extract raw content string
  const aiText = data.choices?.[0]?.message?.content;
  if (!aiText) throw new Error("No choices returned from AI.");
  
  return aiText;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [STRICT PARSE MODE] New Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  
  try {
    const rawAiResponse = await tryOpenRouter(prompt);
    const cleanedText = cleanJSON(rawAiResponse);
    
    // ✅ Strict JSON Parse with Catch
    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("❌ JSON Parse Failed. Raw Text:", cleanedText);
      return res.status(500).json({ error: "Invalid AI response structure." });
    }
    
    if (parsedData && parsedData.careers) {
      console.log(`✅ SUCCESS: Valid JSON received.`);
      return res.json({ success: true, provider: "OpenRouter", data: parsedData });
    }
    
  } catch (err) {
    console.error(`❌ GLOBAL FAILURE:`, err.message);
    return res.status(503).json({ error: `System Error: ${err.message}` });
  }
});

app.listen(PORT, () => console.log(`Strict-Parse Backend live on port ${PORT}`));
