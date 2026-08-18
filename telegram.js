// telegram.js – schickt Benachrichtigungen an einen Telegram-Kanal.
// Nutzt die eingebaute Telegram-Bot-API direkt per HTTP-Aufruf, kein
// zusätzliches npm-Paket nötig.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function telegramNachrichtSenden(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    // Kein Telegram konfiguriert (z. B. beim lokalen Testen) – einfach überspringen,
    // nicht den Server zum Absturz bringen.
    console.log("[Telegram] Nicht konfiguriert, Nachricht wird nur geloggt:", text);
    return;
  }

  try {
    const antwort = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!antwort.ok) {
      const fehlertext = await antwort.text();
      console.error("[Telegram] Fehler beim Senden:", antwort.status, fehlertext);
    }
  } catch (err) {
    console.error("[Telegram] Netzwerkfehler beim Senden:", err.message);
  }
}

const WOCHENTAGE_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE_LANG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function formatiereDatumLang(datumText) {
  const d = new Date(datumText + "T00:00:00");
  return `${d.getDate()}. ${MONATE_LANG[d.getMonth()]} ${d.getFullYear()}`;
}

function formatiereFreigabeNachricht(freigaben, teamName) {
  const APP_URL = process.env.APP_URL || "";
  if (freigaben.length === 1) {
    const f = freigaben[0];
    const tag = WOCHENTAGE_LANG[new Date(f.datum + "T00:00:00").getDay()];
    return (
      `⚽ <b>Slot frei!</b>\n` +
      `${teamName} hat freigegeben:\n` +
      `${tag}, ${formatiereDatumLang(f.datum)} um ${f.uhrzeit} Uhr (${f.ort})` +
      (APP_URL ? `\n\n${APP_URL}` : "")
    );
  }
  return (
    `⚽ <b>${freigaben.length} Slots frei!</b>\n` +
    `${teamName} hat mehrere Termine freigegeben.` +
    (APP_URL ? `\n\n${APP_URL}` : "")
  );
}

module.exports = { telegramNachrichtSenden, formatiereFreigabeNachricht };
