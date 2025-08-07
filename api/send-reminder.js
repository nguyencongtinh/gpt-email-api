const { sendReminderEmails } = require('../utils/google-auth');

export default async function handler(req, res) {
  try {
    console.log("🔔 Đang gọi sendReminderEmails...");
    await sendReminderEmails();
    res.status(200).send("Reminder emails sent successfully.");
  } catch (err) {
    console.error("❌ Lỗi khi gửi email: ", err);
    res.status(500).send("Failed to send reminder emails.");
  }
}
