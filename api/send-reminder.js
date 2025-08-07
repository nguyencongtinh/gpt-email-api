import { sendReminderEmails } from '../utils/google-auth';

export default async function handler(req, res) {
  try {
    await sendReminderEmails();
    res.status(200).send("Reminder emails sent successfully.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to send reminder emails.");
  }
}
