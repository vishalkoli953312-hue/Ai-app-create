const fetch = require('node-fetch');

async function callGeminiWithFallback(prompt, apiKeys) {
  let keys = apiKeys && apiKeys.length > 0 ? apiKeys : [process.env.GEMINI_API_KEY_1];
  let currentKeyIndex = 0;
  let attempts = 0;

  while (attempts < keys.length) {
    const apiKey = keys[currentKeyIndex];
    if (!apiKey) {
      currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      attempts++;
      continue;
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`API error with key index ${currentKeyIndex}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.warn(`Key index ${currentKeyIndex} failed. Switching to next key...`);
      currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      attempts++;
    }
  }
  throw new Error("Sabhi Gemini API keys fail ho gayi hain. Kripya settings mein sahi keys dalein.");
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { command, contextMemory, apiKeys } = req.body;

  const systemPrompt = `Aap ek expert AI web developer hain. User ka voice command hai: "${command}". 
  Pichhla context/memory yeh hai: ${JSON.stringify(contextMemory)}.
  Iske adhaar par HTML, CSS, aur JavaScript code tayar karein. 
  Response sirf shuddh JSON format mein dein, jisme files ke naam aur unka code ho, jaise:
  {
    "index.html": "<!DOCTYPE html>...",
    "style.css": "body { ... }",
    "script.js": "console.log('1');"
  }`;

  try {
    const aiResponseText = await callGeminiWithFallback(systemPrompt, apiKeys);
    let cleanJson = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedCode = JSON.parse(cleanJson);
    
    res.status(200).json({ success: true, code: parsedCode });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
