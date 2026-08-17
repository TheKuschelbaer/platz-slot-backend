// telegram-auth.js – prüft, ob Login-Daten vom Telegram-Login-Widget wirklich
// von Telegram stammen und nicht gefälscht wurden.
// Algorithmus exakt nach: https://core.telegram.org/widgets/login#checking-authorization

const crypto = require("crypto");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Daten dürfen höchstens so alt sein (Sekunden) – verhindert, dass jemand
// eine alte, mal abgefangene Anmeldung nochmal einspielt.
const MAX_ALTER_SEKUNDEN = 300;

function pruefeTelegramLogin(daten) {
  if (!BOT_TOKEN) {
    return { gueltig: false, grund: "TELEGRAM_BOT_TOKEN ist serverseitig nicht gesetzt" };
  }
  const { hash, ...rest } = daten;
  if (!hash) return { gueltig: false, grund: "Kein Hash übermittelt" };

  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();
  const erwarteterHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (erwarteterHash !== hash) {
    return { gueltig: false, grund: "Hash stimmt nicht überein – Daten könnten manipuliert sein" };
  }

  const alterSekunden = Math.floor(Date.now() / 1000) - Number(daten.auth_date);
  if (alterSekunden > MAX_ALTER_SEKUNDEN) {
    return { gueltig: false, grund: "Login-Daten sind zu alt (mehr als 5 Minuten)" };
  }

  return { gueltig: true };
}

module.exports = { pruefeTelegramLogin };
