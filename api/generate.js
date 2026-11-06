const fetch = require('node-fetch');
const cloudinary = require('cloudinary').v2;

// Vercel एनवायरनमेंट वेरिएबल्स से क्लाउडनेरी कॉन्फ़िगरेशन
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
        throw new Error(`Model ${model} failed`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      currentModelIndex++;
      if (currentModelIndex >= models.length) {
        currentModelIndex = 0;
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
      }
      attempts++;
    }
  }
  throw new Error("सभी उपलब्ध Gemini मॉडल्स और API कीज़ विफल रहीं।");
}

async function saveBackupToCloudinary(dataObj) {
  try {
    const jsonString = JSON.stringify(dataObj);
    const uploadResponse = await cloudinary.uploader.upload(
      `data:application/json;base64,${Buffer.from(jsonString).toString('base64')}`,
      {
        resource_type: "raw",
        folder: "ai_master_backups",
        public_id: `backup_${Date.now()}`
      }
    );
    return uploadResponse.secure_url;
  } catch (error) {
    console.error("Cloudinary Backup Failed:", error);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { command, contextMemory, apiKeys, models, mode } = req.body;

  let modeInstruction = "";
  if (mode === "SOFTWARE_UPDATE") {
    modeInstruction = "आपका काम मुख्य सॉफ्टवेयर के फीचर्स, लेआउट या लॉजिक को अपडेट/सुधारने का कोड देना है।";
  } else {
    modeInstruction = "आपका काम यूजर के निर्देशानुसार एक बिल्कुल नया, संपूर्ण और वर्किंग वेब ऐप जनरेट करना है।";
  }

  const systemPrompt = `आप एक ऑटोमैटिक एआई मास्टर इंजन हैं। ${modeInstruction}
  यूजर का वॉइस कमांड है: "${command}". 
  पिछला संदर्भ: ${JSON.stringify(contextMemory)}.
  
  बिना किसी अतिरिक्त टेक्स्ट या व्याख्या के केवल शुद्ध JSON फॉर्मेट में कोड दें:
  {
    "index.html": "<!DOCTYPE html>...",
    "style.css": "body { ... }",
    "script.js": "console.log('App ready');"
  }`;

  try {
    const aiResponseText = await callGeminiWithFallback(systemPrompt, apiKeys, models);
    let cleanJson = aiResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedCode = JSON.parse(cleanJson);
    
    // क्लाउडनेरी पर बैकअप सेव करें
    const backupUrl = await saveBackupToCloudinary({ command, code: parsedCode, timestamp: new Date() });

    res.status(200).json({ success: true, code: parsedCode, cloudinaryUrl: backupUrl });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
