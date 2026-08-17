// server.js – der eigentliche Web-Server. Startpunkt der Anwendung.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");
const logik = require("./logik");
const telegram = require("./telegram");
const { pruefeTelegramLogin } = require("./telegram-auth");

const app = express();
app.use(cors());
app.use(express.json());

function neueId(praefix) {
  return `${praefix}_${crypto.randomUUID().slice(0, 8)}`;
}

// ---------- Health-Check (zum Testen, ob der Server läuft) ----------
app.get("/", (req, res) => {
  res.json({ status: "ok", nachricht: "Platz-Slot-Backend läuft." });
});

// ---------- Teams ----------
app.get("/api/teams", (req, res) => {
  const teams = db.prepare("SELECT * FROM teams ORDER BY name").all();
  res.json(teams);
});

app.patch("/api/teams/:id/logo", (req, res) => {
  const { logoUrl } = req.body;
  db.prepare("UPDATE teams SET logo_url = ? WHERE id = ?").run(logoUrl || null, req.params.id);
  res.json({ ok: true });
});

// ---------- Slots (fester Trainingsplan) ----------
app.get("/api/slots", (req, res) => {
  res.json(db.prepare("SELECT * FROM slots").all());
});

app.post("/api/slots", (req, res) => {
  const { teamId, wochentag, uhrzeit, ort, hinweis } = req.body;
  const id = neueId("s");
  db.prepare("INSERT INTO slots (id, team_id, wochentag, uhrzeit, ort, hinweis) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    teamId,
    wochentag,
    uhrzeit,
    ort,
    hinweis || null
  );
  res.json({ id });
});

app.delete("/api/slots/:id", (req, res) => {
  db.prepare("DELETE FROM slots WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Freigaben ----------
app.get("/api/freigaben", (req, res) => {
  res.json(db.prepare("SELECT * FROM freigaben ORDER BY datum").all());
});

// Erstellt eine oder mehrere Freigaben auf einmal (Einzeltermin ODER Zeitraum)
// body: { eintraege: [{ slotId, teamId, datum, uhrzeit }, ...] }
app.post("/api/freigaben", (req, res) => {
  const { eintraege } = req.body;
  const jetzt = Date.now();
  const einfuegen = db.prepare(
    "INSERT INTO freigaben (id, slot_id, team_id, datum, uhrzeit, status, vergeben_an, erstellt_am, punkt_zeitpunkt, punkt_vergeben) " +
      "VALUES (?, ?, ?, ?, ?, 'offen', NULL, ?, ?, 0)"
  );
  const erzeugt = [];
  db.exec("BEGIN");
  try {
    for (const e of eintraege) {
      const id = neueId("f");
      const [pzH, pzM] = e.uhrzeit.split(":").map(Number);
      const punktDatum = new Date(e.datum);
      punktDatum.setHours(pzH, pzM, 0, 0);
      const punktZeitpunkt = punktDatum.getTime();
      einfuegen.run(id, e.slotId, e.teamId, e.datum, e.uhrzeit, jetzt, punktZeitpunkt);
      erzeugt.push(id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // Telegram-Kanal benachrichtigen (läuft im Hintergrund, blockiert die Antwort nicht)
  const team = db.prepare("SELECT name FROM teams WHERE id = ?").get(eintraege[0]?.teamId);
  const angelegteFreigaben = db
    .prepare(
      `SELECT f.*, s.ort AS ort FROM freigaben f JOIN slots s ON f.slot_id = s.id WHERE f.id IN (${erzeugt.map(() => "?").join(",")})`
    )
    .all(...erzeugt);
  telegram.telegramNachrichtSenden(telegram.formatiereFreigabeNachricht(angelegteFreigaben, team?.name || "Ein Team"));

  res.json({ erzeugt });
});

app.post("/api/freigaben/:id/zusagen", (req, res) => {
  const { teamId } = req.body;
  db.prepare("UPDATE freigaben SET status = 'vergeben', vergeben_an = ? WHERE id = ?").run(teamId, req.params.id);
  res.json({ ok: true });
});

app.post("/api/freigaben/:id/zurueckziehen", (req, res) => {
  db.prepare("UPDATE freigaben SET status = 'offen', vergeben_an = NULL WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.delete("/api/freigaben/:id", (req, res) => {
  db.prepare("DELETE FROM freigaben WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Sperrzeiten ----------
app.get("/api/sperrzeiten", (req, res) => {
  res.json(db.prepare("SELECT * FROM sperrzeiten").all());
});

// Prüft nur auf Überlappung, legt noch nichts an (fürs Warn-Popup im Frontend)
app.post("/api/sperrzeiten/pruefen", (req, res) => {
  const { start, ende } = req.body;
  const ueberlappungen = logik.findeUeberlappendeSperrzeiten({ start, ende });
  res.json({ ueberlappungen });
});

app.post("/api/sperrzeiten", (req, res) => {
  const { grund, start, ende } = req.body;
  const id = neueId("sp");
  db.prepare("INSERT INTO sperrzeiten (id, grund, start, ende) VALUES (?, ?, ?, ?)").run(id, grund, start, ende);
  const entfernteFreigaben = logik.entferneFreigabenInSperrzeitraum({ start, ende });
  res.json({ id, entfernteFreigaben });
});

app.delete("/api/sperrzeiten/:id", (req, res) => {
  db.prepare("DELETE FROM sperrzeiten WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Einzelpersonen (Einzeltraining, kein eigenes Team) ----------
app.get("/api/einzelpersonen", (req, res) => {
  res.json(db.prepare("SELECT * FROM einzelpersonen ORDER BY name").all());
});

app.post("/api/einzelpersonen", (req, res) => {
  const { name, verknuepftesTeamId } = req.body;
  const id = neueId("einzel");
  db.prepare("INSERT INTO einzelpersonen (id, name, verknuepftes_team_id) VALUES (?, ?, ?)").run(
    id,
    name,
    verknuepftesTeamId || null
  );
  res.json({ id, name, verknuepftesTeamId: verknuepftesTeamId || null });
});

app.patch("/api/einzelpersonen/:id", (req, res) => {
  const { name } = req.body;
  db.prepare("UPDATE einzelpersonen SET name = ? WHERE id = ?").run(name, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/einzelpersonen/:id", (req, res) => {
  db.prepare("DELETE FROM einzelpersonen WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Telegram-Login ----------
// body: die vom Telegram-Login-Widget gelieferten Felder
// { id, first_name, last_name, username, photo_url, auth_date, hash }
app.post("/api/telegram-login", (req, res) => {
  const pruefung = pruefeTelegramLogin(req.body);
  if (!pruefung.gueltig) {
    return res.status(401).json({ fehler: pruefung.grund });
  }

  const telegramId = String(req.body.id);
  const anzeigename = [req.body.first_name, req.body.last_name].filter(Boolean).join(" ");

  let zuordnung = db.prepare("SELECT * FROM telegram_zuordnungen WHERE telegram_id = ?").get(telegramId);

  if (!zuordnung) {
    // Erstmaliger Login dieser Person: automatisch als neue Einzelperson anlegen
    const einzelpersonId = neueId("einzel");
    db.prepare("INSERT INTO einzelpersonen (id, name, verknuepftes_team_id) VALUES (?, ?, NULL)").run(
      einzelpersonId,
      anzeigename || `Telegram-Nutzer ${telegramId}`
    );
    db.prepare(
      "INSERT INTO telegram_zuordnungen (telegram_id, rolle, einzelperson_id, telegram_anzeigename, telegram_username, erstellt_am) VALUES (?, 'einzelperson', ?, ?, ?, ?)"
    ).run(telegramId, einzelpersonId, anzeigename, req.body.username || null, Date.now());
    zuordnung = { telegram_id: telegramId, rolle: "einzelperson", einzelperson_id: einzelpersonId };
  }

  if (zuordnung.rolle === "team") {
    return res.json({ rolle: "team", teamId: zuordnung.team_id });
  }
  if (zuordnung.rolle === "admin") {
    return res.json({ rolle: "admin", adminName: zuordnung.admin_name });
  }
  return res.json({ rolle: "einzelperson", einzelpersonId: zuordnung.einzelperson_id });
});

// ---------- Telegram-Zuordnungen verwalten (nur für Admins gedacht) ----------
app.get("/api/telegram-zuordnungen", (req, res) => {
  const zuordnungen = db
    .prepare(
      `SELECT z.*, t.name AS team_name, e.name AS einzelperson_name
       FROM telegram_zuordnungen z
       LEFT JOIN teams t ON z.team_id = t.id
       LEFT JOIN einzelpersonen e ON z.einzelperson_id = e.id
       ORDER BY z.erstellt_am DESC`
    )
    .all();
  res.json(zuordnungen);
});

// Ordnet eine bestehende Telegram-Zuordnung neu zu: Team, Admin oder Einzelperson
// body: { rolle: 'team'|'admin'|'einzelperson', teamId?, adminName? }
app.patch("/api/telegram-zuordnungen/:telegramId", (req, res) => {
  const { rolle, teamId, adminName } = req.body;
  const bestehend = db.prepare("SELECT * FROM telegram_zuordnungen WHERE telegram_id = ?").get(req.params.telegramId);
  if (!bestehend) return res.status(404).json({ fehler: "Zuordnung nicht gefunden" });

  if (rolle === "team") {
    db.prepare(
      "UPDATE telegram_zuordnungen SET rolle = 'team', team_id = ?, admin_name = NULL WHERE telegram_id = ?"
    ).run(teamId, req.params.telegramId);
  } else if (rolle === "admin") {
    db.prepare(
      "UPDATE telegram_zuordnungen SET rolle = 'admin', team_id = NULL, admin_name = ? WHERE telegram_id = ?"
    ).run(adminName || bestehend.telegram_anzeigename, req.params.telegramId);
  } else {
    // zurück auf Einzelperson (bestehenden verknüpften Datensatz behalten, falls vorhanden)
    let einzelpersonId = bestehend.einzelperson_id;
    if (!einzelpersonId) {
      einzelpersonId = neueId("einzel");
      db.prepare("INSERT INTO einzelpersonen (id, name, verknuepftes_team_id) VALUES (?, ?, NULL)").run(
        einzelpersonId,
        bestehend.telegram_anzeigename || "Einzelperson"
      );
    }
    db.prepare(
      "UPDATE telegram_zuordnungen SET rolle = 'einzelperson', team_id = NULL, admin_name = NULL, einzelperson_id = ? WHERE telegram_id = ?"
    ).run(einzelpersonId, req.params.telegramId);
  }
  res.json({ ok: true });
});

app.delete("/api/telegram-zuordnungen/:telegramId", (req, res) => {
  db.prepare("DELETE FROM telegram_zuordnungen WHERE telegram_id = ?").run(req.params.telegramId);
  res.json({ ok: true });
});

// ---------- Notfall-Reparatur ----------
// Nirgends in der App verlinkt. Nur für den Fall, dass eine Telegram-Zuordnung
// (z. B. deine eigene Admin-Zuordnung) verloren geht und niemand mehr Admin-Rechte
// hat, um sie über die normale Oberfläche zu reparieren.
// Aufruf z. B. direkt im Browser als POST (z. B. mit einem kleinen Tool wie Postman)
// oder über die separate notfall.html, die dafür bereitsteht.
app.post("/api/notfall-reparatur", (req, res) => {
  const { code, telegramId, teamId } = req.body;
  const NOTFALL_CODE = process.env.NOTFALL_CODE;

  if (!NOTFALL_CODE) {
    return res.status(503).json({ fehler: "Kein NOTFALL_CODE konfiguriert – Funktion ist deaktiviert" });
  }
  if (code !== NOTFALL_CODE) {
    return res.status(401).json({ fehler: "Falscher Code" });
  }
  if (!telegramId || !teamId) {
    return res.status(400).json({ fehler: "telegramId und teamId sind erforderlich" });
  }

  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
  if (!team) return res.status(404).json({ fehler: `Team "${teamId}" existiert nicht` });

  const bestehend = db.prepare("SELECT * FROM telegram_zuordnungen WHERE telegram_id = ?").get(telegramId);
  if (bestehend) {
    db.prepare(
      "UPDATE telegram_zuordnungen SET rolle = 'team', team_id = ?, admin_name = NULL WHERE telegram_id = ?"
    ).run(teamId, telegramId);
  } else {
    db.prepare(
      "INSERT INTO telegram_zuordnungen (telegram_id, rolle, team_id, erstellt_am) VALUES (?, 'team', ?, ?)"
    ).run(telegramId, teamId, Date.now());
  }

  res.json({ ok: true, nachricht: `Telegram-ID ${telegramId} ist jetzt Team "${team.name}" zugeordnet.` });
});

// ---------- Hintergrund-Job: alle 60 Sekunden Punkte/Reset prüfen ----------
logik.hintergrundJobAusfuehren();
setInterval(logik.hintergrundJobAusfuehren, 60 * 1000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Platz-Slot-Backend läuft auf Port ${PORT}`);
});
