// db.js – Datenbank-Verbindung, Schema und Erstbefüllung (Seed)
const path = require("path");
const { DatabaseSync } = require("node:sqlite"); // in Node.js eingebaut, ab v22 – kein separates Paket noetig

// DB_PATH kommt in Produktion aus einer Umgebungsvariable (zeigt auf einen
// dauerhaften Speicherort, z. B. ein Railway-Volume). Lokal liegt die Datei
// einfach im Projektordner.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "platz-slot.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  punkte INTEGER NOT NULL DEFAULT 0,
  farbe TEXT NOT NULL,
  logo TEXT,
  logo_url TEXT,
  ist_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  wochentag INTEGER NOT NULL,
  uhrzeit TEXT NOT NULL,
  ort TEXT NOT NULL,
  hinweis TEXT
);

CREATE TABLE IF NOT EXISTS freigaben (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES slots(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  datum TEXT NOT NULL,
  uhrzeit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  vergeben_an TEXT,
  erstellt_am INTEGER NOT NULL,
  punkt_zeitpunkt INTEGER NOT NULL,
  punkt_vergeben INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sperrzeiten (
  id TEXT PRIMARY KEY,
  grund TEXT NOT NULL,
  start TEXT NOT NULL,
  ende TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS einstellungen (
  schluessel TEXT PRIMARY KEY,
  wert TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS einzelpersonen (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  verknuepftes_team_id TEXT REFERENCES teams(id)
);
`);

function seedFallsLeer() {
  const anzahlTeams = db.prepare("SELECT COUNT(*) AS n FROM teams").get().n;
  if (anzahlTeams > 0) return; // schon befüllt, nichts tun

  const teams = [
    { id: "t1", name: "U9M", logo: "U9", farbe: "#E76F51" },
    { id: "t2", name: "U10M", logo: "U10", farbe: "#2A9D8F" },
    { id: "t3", name: "U11M", logo: "U11", farbe: "#5B8FB9" },
    { id: "t4", name: "U13M I", logo: "U13 I", farbe: "#9B6BD9" },
    { id: "t5", name: "U13M II", logo: "U13 II", farbe: "#E63946" },
    { id: "t6", name: "U15M I", logo: "U15 I", farbe: "#F4A261", ist_admin: 1 },
    { id: "t7", name: "U15M II", logo: "U15 II", farbe: "#2EC4B6" },
    { id: "t8", name: "U17M I", logo: "U17 I", farbe: "#3A86FF" },
    { id: "t9", name: "Frauen I", logo: "FI", farbe: "#EF476F" },
    { id: "t10", name: "Frauen II", logo: "FII", farbe: "#C08497" },
    { id: "t11", name: "U17M II", logo: "U17 II", farbe: "#00B4D8" },
  ];
  const slots = [
    ["s1", "t1", 2, "16:00", "Olympiastadion", null],
    ["s2", "t1", 5, "16:00", "Olympiastadion", null],
    ["s3", "t2", 2, "16:00", "Olympiastadion", null],
    ["s4", "t2", 5, "16:00", "Olympiastadion", null],
    ["s5", "t3", 3, "17:15", "Olympiastadion", null],
    ["s6", "t3", 5, "16:00", "Olympiastadion", null],
    ["s7", "t4", 3, "17:15", "Olympiastadion", null],
    ["s8", "t4", 5, "17:15", "Olympiastadion", null],
    ["s9", "t5", 1, "17:15", "Olympiastadion", null],
    ["s10", "t5", 5, "17:15", "Olympiastadion", null],
    ["s11", "t6", 2, "18:30", "Olympiastadion", null],
    ["s12", "t6", 5, "18:30", "Olympiastadion", null],
    ["s13", "t7", 2, "17:30", "Weidenpesch", null],
    ["s14", "t7", 5, "17:15", "Olympiastadion", null],
    ["s15", "t8", 1, "18:30", "Weidenpesch", null],
    ["s16", "t8", 3, "18:30", "Olympiastadion", null],
    ["s17", "t8", 5, "18:30", "Olympiastadion", null],
    ["s18", "t9", 3, "20:00", "Olympiastadion", null],
    ["s19", "t9", 5, "20:00", "Olympiastadion", null],
    ["s20", "t10", 1, "18:30", "Olympiastadion", "Cage, ab 19:00 Uhr"],
    ["s21", "t10", 3, "20:00", "Olympiastadion", null],
    ["s22", "t11", 1, "18:30", "Olympiastadion", null],
    ["s23", "t11", 3, "19:30", "Weidenpesch", null],
  ];
  const sperrzeiten = [
    ["sp1", "Weihnachtspause – Anlage gesperrt", "2026-12-23", "2027-01-02"],
    ["sp2", "Herbstferien – Platzpflege", "2026-10-12", "2026-10-16"],
  ];
  const einzelpersonen = [
    ["einzel-1", "Julia (Einzelperson)", null],
    ["einzel-2", "Tom (Einzelperson)", null],
    ["einzel-3", "Nina (Einzelperson)", null],
    ["einzel-4", "Du (Einzeltraining)", "t6"],
  ];

  const teamInsert = db.prepare(
    "INSERT INTO teams (id, name, punkte, farbe, logo, logo_url, ist_admin) VALUES (@id, @name, 0, @farbe, @logo, NULL, @ist_admin)"
  );
  const slotInsert = db.prepare(
    "INSERT INTO slots (id, team_id, wochentag, uhrzeit, ort, hinweis) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const sperreInsert = db.prepare(
    "INSERT INTO sperrzeiten (id, grund, start, ende) VALUES (?, ?, ?, ?)"
  );
  const einzelInsert = db.prepare(
    "INSERT INTO einzelpersonen (id, name, verknuepftes_team_id) VALUES (?, ?, ?)"
  );

  db.exec("BEGIN");
  try {
    for (const t of teams) teamInsert.run({ ist_admin: 0, ...t });
    for (const s of slots) slotInsert.run(...s);
    for (const sp of sperrzeiten) sperreInsert.run(...sp);
    for (const e of einzelpersonen) einzelInsert.run(...e);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  console.log("Datenbank mit Startdaten befüllt (Teams, Slots, Sperrzeiten).");
}

seedFallsLeer();

module.exports = db;
