const { sendReminderEmails } = require("../utils/send-reminder-logic");

module.exports = async function handler(req, res) {
  console.log("🔔 Đang gọi sendReminderEmails...");
  try {
    await sendReminderEmails();
    res.status(200).send("✅ Đã gửi email nhắc hạn (nếu có).");
  } catch (error) {
    console.error("❌ Lỗi khi gửi email: ", error);
    res.status(500).send("❌ Lỗi khi gửi email.");
  }
};