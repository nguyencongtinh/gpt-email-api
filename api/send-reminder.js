const { sendReminderEmails } = require("../utils/send-reminder-logic");

module.exports = async (req, res) => {
  try {
    console.log("🔔 Đang gọi sendReminderEmails...");
    await sendReminderEmails();
    res.status(200).send("✅ Đã gửi xong nhắc hạn.");
  } catch (error) {
    console.error("❌ Lỗi khi gửi email: ", error);
    res.status(500).send("❌ Lỗi khi gửi email.");
  }
};
