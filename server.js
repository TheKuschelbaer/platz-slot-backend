// server.js – der eigentliche Web-Server. Startpunkt der Anwendung.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");
const logik = require("./logik");

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
      const punktZeitpunkt = new Date(e.datum).getTime();
      einfuegen.run(id, e.slotId, e.teamId, e.datum, e.uhrzeit, jetzt, punktZeitpunkt);
      erzeugt.push(id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
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

// ---------- Hintergrund-Job: alle 60 Sekunden Punkte/Reset prüfen ----------
logik.hintergrundJobAusfuehren();
setInterval(logik.hintergrundJobAusfuehren, 60 * 1000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Platz-Slot-Backend läuft auf Port ${PORT}`);
});
