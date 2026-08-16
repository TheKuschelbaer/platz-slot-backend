// logik.js – die Regeln aus dem Konzept, serverseitig als "Quelle der Wahrheit"
const db = require("./db");

const QUARTALS_MONATE = [0, 3, 6, 9]; // Jan, Apr, Jul, Okt

function tagOhneUhrzeit(datumIso) {
  return datumIso.slice(0, 10); // "YYYY-MM-DD"
}

function istInSperrzeitraum(datumIso, sperrzeitraum) {
  const tag = tagOhneUhrzeit(datumIso);
  return tag >= sperrzeitraum.start && tag <= sperrzeitraum.ende;
}

// Läuft regelmäßig im Hintergrund: vergibt fällige Punkte + macht den Quartals-Reset
function hintergrundJobAusfuehren() {
  const jetzt = Date.now();

  // 1) Punktevergabe: Slot-Zeitpunkt erreicht und noch nicht zurückgezogen/entfernt
  const faellige = db
    .prepare("SELECT * FROM freigaben WHERE punkt_vergeben = 0 AND punkt_zeitpunkt <= ?")
    .all(jetzt);

  const punktGeben = db.prepare("UPDATE teams SET punkte = punkte + 1 WHERE id = ?");
  const alsVergebenMarkieren = db.prepare("UPDATE freigaben SET punkt_vergeben = 1 WHERE id = ?");

  for (const f of faellige) {
    punktGeben.run(f.team_id);
    alsVergebenMarkieren.run(f.id);
  }

  // 2) Quartals-Reset: 1. Jan / 1. Apr / 1. Jul / 1. Okt
  const letzterResetEintrag = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'letzter_punkte_reset'").get();
  const letzterReset = letzterResetEintrag ? Number(letzterResetEintrag.wert) : quartalsStart(jetzt);
  const naechsteGrenze = naechsterQuartalsStart(letzterReset);

  if (jetzt >= naechsteGrenze) {
    db.prepare("UPDATE teams SET punkte = 0").run();
    db.prepare(
      "INSERT INTO einstellungen (schluessel, wert) VALUES ('letzter_punkte_reset', ?) " +
        "ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert"
    ).run(String(naechsteGrenze));
    console.log("Quartals-Reset ausgeführt:", new Date(naechsteGrenze).toISOString());
  } else if (!letzterResetEintrag) {
    db.prepare("INSERT INTO einstellungen (schluessel, wert) VALUES ('letzter_punkte_reset', ?)").run(String(letzterReset));
  }
}

function quartalsStart(zeitstempel) {
  const d = new Date(zeitstempel);
  let jahr = d.getFullYear();
  for (let i = 0; i < 8; i++) {
    for (const m of [...QUARTALS_MONATE].reverse()) {
      const kandidat = new Date(jahr, m, 1).getTime();
      if (kandidat <= zeitstempel) return kandidat;
    }
    jahr--;
  }
}

function naechsterQuartalsStart(abZeitstempel) {
  const d = new Date(abZeitstempel);
  let jahr = d.getFullYear();
  for (let i = 0; i < 8; i++) {
    for (const m of QUARTALS_MONATE) {
      const kandidat = new Date(jahr, m, 1).getTime();
      if (kandidat > abZeitstempel) return kandidat;
    }
    jahr++;
  }
}

// Beim Anlegen einer neuen Sperrzeit: bestehende Freigaben darin automatisch entfernen
function entferneFreigabenInSperrzeitraum(sperrzeitraum) {
  const alle = db.prepare("SELECT * FROM freigaben").all();
  const betroffen = alle.filter((f) => istInSperrzeitraum(f.datum, sperrzeitraum));
  const loeschen = db.prepare("DELETE FROM freigaben WHERE id = ?");
  for (const f of betroffen) loeschen.run(f.id);
  return betroffen;
}

function findeUeberlappendeSperrzeiten(neu) {
  const bestehende = db.prepare("SELECT * FROM sperrzeiten").all();
  return bestehende.filter((s) => neu.start <= s.ende && s.start <= neu.ende);
}

module.exports = {
  hintergrundJobAusfuehren,
  entferneFreigabenInSperrzeitraum,
  findeUeberlappendeSperrzeiten,
  istInSperrzeitraum,
};
