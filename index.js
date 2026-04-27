import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE MANDATORY BLUEPRINT (Synced with ResultsSection.jsx) ---
const SCHEMA_PROMPT = `
You MUST return ONLY a JSON object with this exact structure:
{
  "careers": [
    {
      "title": "string",
      "match": number,
      "demandTag": "string",
      "attributeTag": "string",
      "role_overview": "Detailed summary of the career",
      "why_fit": "One sentence explaining why this fits the user",
      "income": "Expected PKR salary/month",
      "time_to_earn": "Time until first paycheck",
      "skills": [
        { "name": "string", "simple_explanation": "string", "type": "core|secondary" }
      ],
      "roadmap": [
        { "title": "Step title", "desc": "Actionable instruction" }
      ]
    }
  ],
  "reality_check": {
    "competition": "Describe competition level in Pakistan",
    "risk": "Describe the risk involved",
    "effort": "Describe intensity required"
  },
  "alternative_paths": [
    { "title": "string", "description": "string" }
  ],
  "what_to_avoid": [
    { "pitfall": "string", "reason": "string" }
  ]
}
`;

const SYSTEM_PROMPT = `Career Counselor Pakistan. suggest 3 careers. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) throw new Error("Empty response from AI");
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
  
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content returned.");
  
  return content;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [SYNC MODE] New Career Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  
  try {
    const rawText = await tryOpenRouter(prompt);
    const cleaned = cleanJSON(rawText);
    const finalResult = JSON.parse(cleaned);
    
    if (finalResult && finalResult.careers) {
      console.log(`✅ SUCCESS: Analysis fulfilled and synced.`);
      return res.json({ success: true, provider: "OpenRouter", data: finalResult });
    }
  } catch (e) {
    console.error(`❌ FAILURE:`, e.message);
    return res.status(503).json({ error: `AI Error: ${e.message}` });
  }
});

app.listen(PORT, () => console.log(`Sync-Master Backend live on port ${PORT}`));
