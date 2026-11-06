const cloudinary = require('cloudinary').v2;

// Vercel पर्यावरण वेरिएबल्स से क्लाउडनेरी कॉन्फ़िगर करें
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// चैट या डेटा को क्लाउडनेरी पर JSON फाइल के रूप में अपलोड करने का फंक्शन
async function saveChatToCloudinary(chatData) {
  try {
    const jsonString = JSON.stringify(chatData);
    const uploadResponse = await cloudinary.uploader.upload(`data:application/json;base64,${Buffer.from(jsonString).toString('base64')}`, {
      resource_type: "raw",
      folder: "ai_master_chats",
      public_id: `chat_backup_${Date.now()}`
    });
    return uploadResponse.secure_url;
  } catch (error) {
    console.error("Cloudinary Backup Error:", error);
    return null;
  }
}
