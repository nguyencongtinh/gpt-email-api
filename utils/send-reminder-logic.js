console.log('📄 SHEET_ID:', process.env.SHEET_ID);

const auth = require("./google-auth");
const { google } = require("googleapis");

async function sendReminderEmails() {
  const sheets = google.sheets({ version: "v4", auth });
  const gmail = google.gmail({ version: "v1", auth });

  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || "Sheet1";

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:F`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log("❗ Không có dữ liệu trong sheet.");
    return;
  }

  const today = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  const header = rows[0];
  const emailIndex = header.indexOf("Email");
  const expireDateIndex = header.indexOf("Hạn dùng");
  const gptNameIndex = header.indexOf("Tên GPTs");
  const sent5Index = header.indexOf("Đã gửi trước 5 ngày");
  const sent1Index = header.indexOf("Đã gửi trước 1 ngày");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const email = row[emailIndex];
    const gptName = row[gptNameIndex];
    const expireDateStr = row[expireDateIndex];
    const sent5 = row[sent5Index] || "";
    const sent1 = row[sent1Index] || "";

    const expireDate = new Date(expireDateStr);
    const diffDays = Math.ceil((expireDate - today) / msPerDay);

    let shouldSend = false;
    let columnToUpdate = null;

    if (diffDays === 5 && sent5 !== "Đã gửi") {
      shouldSend = true;
      columnToUpdate = sent5Index;
    } else if (diffDays === 1 && sent1 !== "Đã gửi") {
      shouldSend = true;
      columnToUpdate = sent1Index;
    }

    if (shouldSend) {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: Buffer.from(
            `To: ${email}\r\n` +
            "Subject: [GPTs] Nhắc nhở sắp hết hạn\r\n" +
            "Content-Type: text/plain; charset=utf-8\r\n\r\n" +
            `GPT "${gptName}" của bạn sẽ hết hạn sau ${diffDays} ngày. Vui lòng gia hạn nếu bạn muốn tiếp tục sử dụng.`
          ).toString("base64"),
        },
      });

      const updateRange = `${sheetName}!${String.fromCharCode(65 + columnToUpdate)}${i + 1}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Đã gửi"]],
        },
      });

      console.log(`📧 Đã gửi nhắc hạn ${diffDays} ngày tới ${email}`);
    }
  }
}

module.exports = { sendReminderEmails };
