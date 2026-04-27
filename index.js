import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE STRICT BLUEPRINT ---
const SCHEMA_PROMPT = `
You MUST return ONLY a JSON object. NO PLACEHOLDERS (like "--" or "Evaluating").
Every field MUST be filled with detailed, real information.

Structure:
{
  "careers": [
    {
      "title": "Official Career Name",
      "match": number (70-100),
      "demandTag": "e.g. High Demand",
      "attributeTag": "e.g. Creative",
      "role_overview": "A 20-word detailed summary of this job in Pakistan.",
      "why_fit": "A specific sentence explaining why this matches their strengths.",
      "income": "Realistic monthly PKR salary (e.g. 80,000 - 150,000 PKR)",
      "time_to_earn": "Time until first paycheck (e.g. 3-6 months)",
      "skills": [
        { "name": "Skill Name", "simple_explanation": "What it is", "type": "core" },
        { "name": "Skill Name 2", "simple_explanation": "What it is", "type": "secondary" }
      ],
      "roadmap": [
        { "title": "Phase 1", "desc": "Specific actionable steps to start." },
        { "title": "Phase 2", "desc": "How to get the first client or job." }
      ]
    }
  ],
  "reality_check": {
    "competition": "Detailed description of Pakistan's market competition.",
    "risk": "Detailed description of financial or career risks.",
    "effort": "Detailed description of daily work intensity."
  },
  "alternative_paths": [
    { "title": "Backup Career", "description": "Why this is a good secondary option." }
  ],
  "what_to_avoid": [
    { "pitfall": "Specific mistake to avoid", "reason": "Why it hurts your career" }
  ]
}
`;

const SYSTEM_PROMPT = `YOU ARE A SENIOR CAREER ADVISOR. Suggest EXACTLY 3 careers. NO CONVERSATION. NO LAME ANSWERS. ${SCHEMA_PROMPT}`;

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
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ 
      model: "google/gemini-2.0-flash-001", 
      messages: [{ role: "user", content: prompt }] 
    })
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OR API Error");
  return data.choices?.[0]?.message?.content;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [STRICT DATA MODE] New Scan ---");
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

app.listen(PORT, () => console.log(`Data-Enforcer Backend live on port ${PORT}`));
