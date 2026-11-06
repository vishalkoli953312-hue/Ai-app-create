const fetch = require('node-fetch');

// डिफ़ॉल्ट मॉडल्स की लिस्ट (यूजर अपनी पसंद के मॉडल भी भेज सकता है)
const DEFAULT_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

async function callGeminiWithFallback(prompt, apiKeys, modelList) {
  const keys = apiKeys && apiKeys.length > 0 ? apiKeys : [process.env.GEMINI_API_KEY_1];
  const models = modelList && modelList.length > 0 ? modelList : DEFAULT_MODELS;

  let currentKeyIndex = 0;
  let currentModelIndex = 0;
  let attempts = 0;
  const maxAttempts = keys.length * models.length * 3;

  while (attempts < maxAttempts) {
    const apiKey = keys[currentKeyIndex];
    const model = models[currentModelIndex];

    if (!apiKey) {
      currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      attempts++;
      continue;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Model ${model} failed with key index ${currentKeyIndex}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      // ऑटोमैटिक स्विच: अगले मॉडल या अगली की पर जाएँ
      currentModelIndex++;
      if (currentModelIndex >= models.length) {
        currentModelIndex = 0;
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      }
      attempts++;
    }
  }
  throw new Error("सभी उपलब्ध Gemini मॉडल्स और API कीज़ की लिमिट समाप्त हो चुकी है या विफल रहीं।");
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { command, contextMemory, apiKeys, models, cloudinaryConfig } = req.body;

  const systemPrompt = `आप एक अत्यंत शक्तिशाली एआई मास्टर सॉफ्टवेयर कंट्रोल और ऐप क्रिएटर हैं। 
  यूजर का वॉइस कमांड है: "${command}". 
  पिछला संदर्भ/मेमोरी यह है: ${JSON.stringify(contextMemory)}.
  आपको बिना रुके, पूरी तरह से कंप्लीट, रॉ और शुद्ध JSON फॉर्मेट में ऐप का कोड देना है जिसमें index.html, style.css और script.js शामिल हों। फॉर्मेट इस प्रकार होना चाहिए:
  {
    "index.html": "<!DOCTYPE html>...",
    "style.css": "body { ... }",
    "script.js": "console.log('App ready');"
  }`;

  try {
    const aiResponseText = await callGeminiWithFallback(systemPrompt, apiKeys, models);
    let cleanJson = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedCode = JSON.parse(cleanJson);
    
    res.status(200).json({ success: true, code: parsedCode, cloudinaryUsed: !!cloudinaryConfig });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
