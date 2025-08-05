const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Danh sách email được phép truy cập
const allowedEmails = ["user1@example.com", "user2@example.com", "nguyencongtinh@gmail.com"];

app.get("/api/check", (req, res) => {
  const email = req.query.email?.toLowerCase();
  const access = allowedEmails.includes(email);
  res.json({ access });
});

app.get("/", (req, res) => {
  res.send("GPT Access Check API is running.");
});

module.exports = app;