// The one reference resolver (verbatim from repo/tools/playwright/common/fall-referenz.ts @ 292b019).
// parseReference / resolveFall / resolveBereich — replaces the two former copies in the matrix
// and suite writers; proven byte-identical over 33 matrices + 428 tables from five apps.

import path from 'node:path'
import { basiszustand, expectationFor, loadSuite, sekundaerdaten, subject } from './suite.js'
import type { Result, SuiteTest } from './suite.js'

/**
 * **Der EINE Aufloeser fuer `ref::<Blatt>::<Fall>`.**
 *
 * ─── 🔴 Warum diese Datei entstanden ist ────────────────────────────────────
 *
 * Die Schreibweise gab es dreimal, und zwar in drei Fassungen, die sich still
 * unterschieden:
 *
 * | Ort | was er tat |
 * |---|---|
 * | `nanook/src/matrix-writer.ts:176` | `value.split(';')[0].split(':')` — schneidet den `;ablehnung=`-Anhang ab |
 * | `nanook/src/suite-writer.ts:100` | `value.split(':')` — **ohne** den Schnitt |
 * | `dashandwerk/tests/matrizen.spec.ts:95` | zerlegt gar nicht, bekommt `entity`/`record` fertig und liefert nur FELDER |
 *
 * ⚪ Die beiden Erzeuger sind zeichengleich, solange keine Entscheidungstabelle
 * einen `;`-Anhang traegt — gemessen am 2026-09-10 ueber 428 Entscheidungstabellen
 * und 33 Matrizen aller fuenf Apps: Ausgabe vorher = Ausgabe nachher, Byte fuer
 * Byte. Genau diese Messung ist der Grund, warum der Umzug hier die Fassung MIT
 * dem Schnitt uebernimmt: Sie ist die weitere, und die engere hat nachweislich
 * keinen Fall, in dem sie sich anders verhaelt.
 *
 * 🔴 Eine dritte Fassung in dieser Datei anzulegen waere der Fehler gewesen, den
 * das Audit am 2026-09-10 benannt hat: „ein dritter in `common/fall-referenz.ts`
 * waere die dritte Quelle."
 *
 * ─── Zwei Schreibweisen, eine Zerlegung ─────────────────────────────────────
 *
 * ```
 * ref:1:AuftragAnlegen:status:OK_abgerechnet   Nanook-Form (Erzeuger, Tabellenzelle)
 * ref::AuftragAnlegen::OK_abgerechnet          Kurzform (Ablauf-Zelle)
 * ```
 *
 * Beide zerlegen an `:` und lesen `[2]` als Blatt und `[4]` als Fall. Die Kurzform
 * ist die Nanook-Form mit leerer Instanz und leerem Feld — deshalb braucht sie
 * **keinen** eigenen Parser.
 *
 * 🔴 Reihenfolge FELD vor FALL: die Bibliothek liest `parts[3]` als Feld und
 * `parts[4]` als Testfall (`TestcaseDefinitionDecision.ts:440-441`). Umgekehrt
 * gelesen faellt es erst zur Laufzeit auf, mit der irrefuehrenden Meldung „Could
 * not find the testcase '<feldname>'".
 */
export interface Referenz {
  /** Der Blattname der referenzierten Tabelle. */
  entity: string
  /** Der Fallname — bei einem Bereich die ungeteilte Angabe `A1..A6`. */
  record: string
}

/**
 * Zerlegt `ref:<instanz>:<blatt>:<feld>:<fall>` bzw. `ref::<blatt>::<fall>`.
 *
 * 🔴 Alles ab dem ersten `;` wird **vor** der Zerlegung abgeschnitten: Sonst
 * hiesse der referenzierte Fall `OK_1;ablehnung=email-template-001`, und
 * `buildMatrixSuite` faende ihn nicht — mit einer Fehlermeldung, die auf die
 * falsche Tabelle zeigt.
 *
 * ⚪ Gibt `undefined` zurueck, wenn der Wert keine Referenz ist ODER wenn Blatt
 * oder Fall fehlen. Der Aufrufer entscheidet, ob das ein Fehler ist: In einer
 * Matrix-Achse heisst „keine Referenz" Klartext, in einer Ablauf-Zelle heisst es
 * „die Zelle nennt den Funktionsnamen".
 */
export function parseReference(value: string): Referenz | undefined {
  if (!value.toLowerCase().startsWith('ref:')) return undefined
  const parts = value.split(';')[0].split(':')
  const entity = parts[2]
  const record = parts[4]
  if (!entity || !record) return undefined
  return { entity, record }
}

/** Faengt dieser Zellwert mit `ref:` an — egal ob er zerlegbar ist? */
export function looksLikeReference(value: string): boolean {
  return value.trim().toLowerCase().startsWith('ref:')
}

/**
 * Blattname → moegliche Suiten-Dateinamen.
 *
 * 🔴 Zwei Formen, weil die Mappe zwei kennt: `AuftragAnlegen` liegt als
 * `auftraganlegen.json`, ein Laenderblatt `FirmaAnlegenDE` dagegen als
 * `firmaanlegen-de.json`. Meine erste Fassung kannte nur die erste und suchte
 * `firmaanlegende.json` — 160 Faelle scheiterten am Aufbau, mit einer Meldung, die
 * korrekt auf den Aufbau zeigte statt auf die Anwendung.
 */
export function suiteCandidates(entity: string): string[] {
  return [
    `${entity.toLowerCase()}.json`,
    `${entity.replace(/([A-Z]{2})$/, '-$1').toLowerCase()}.json`,
    `${entity.replace(/([a-z])([A-Z]{2})$/, '$1-$2').toLowerCase()}.json`,
  ].filter((k, i, all) => all.indexOf(k) === i)
}

/**
 * Laedt die Suite eines Blattes aus dem `suites`-Ordner.
 *
 * @throws wenn keine der Dateinamen-Formen existiert — mit dem Bauvorschlag.
 */
export async function loadSuiteOf(
  suitesDir: string,
  entity: string
): Promise<Awaited<ReturnType<typeof loadSuite>>> {
  const candidates = suiteCandidates(entity)
  for (const k of candidates) {
    try {
      return await loadSuite(path.join(suitesDir, k))
    } catch {
      /* die naechste Form probieren */
    }
  }
  throw new Error(
    `Die Referenz verweist auf „${entity}", aber keine dieser Suiten gibt es: ` +
      `${candidates.join(', ')}.\nErst bauen: build-suite.ts --blatt ${entity} --ziel suites/…`
  )
}

/**
 * **Ein aufgeloester Fall** — alles, was ein Ablauf-Schritt ueber ihn wissen muss.
 *
 * 🔴 `expectation` ist der Grund, warum es dieses Buendel gibt und nicht nur die
 * Felder (so weit reichte `matrizen.spec.ts:95` bis heute). Ohne sie muesste die
 * Funktion ihr eigenes Urteil erfinden — und die Ablauf-Zelle traegt kein `-`,
 * weil zwei Erwartungsquellen die Verdeckungsfalle waeren.
 */
export interface AufgeloesterFall {
  /** Blatt, aus dem der Fall stammt. */
  sheet: string
  /** Fallname (`OK_1`, `draft→finalize`). */
  tc: string
  /**
   * Das Blatt, das die Sache **anlegt**, auf die der Fall wirkt.
   *
   * ⚪ Bei einer Matrix-Zelle ist das die referenzierte Entscheidungstabelle
   * (`basiszustand().create[0].entity`, von `buildMatrixSuite` geschrieben); bei
   * einem Fall einer Entscheidungstabelle ist es das Blatt selbst.
   */
  anlage: string
  /**
   * Die Aktion, falls der Fall eine nennt (`aktion`-Prop der Matrix-Suite) —
   * also die SPALTE der Matrix.
   */
  aktion?: string
  /** Die Nutzlast-Felder des Falls, ohne `aktion` und ohne das Absende-Element. */
  fields: Record<string, unknown>
  /** Die Sekundaerdaten des Falls (Vorbedingungen, Ausgangszustand). */
  secondary: Record<string, string>
  /** Die Erwartung an der genannten Grenze — das Urteil des Schritts. */
  expectation: Result
  /** Der ganze Fall, fuer alles, was dieses Buendel nicht vorwegnimmt. */
  test: SuiteTest
}

/**
 * Loest `ref::<Blatt>::<Fall>` gegen die gebauten Suiten auf.
 *
 * @param limit an welcher Grenze der Schritt faehrt — die Erwartung faellt auf die
 *   andere Seite zurueck, wenn diese schweigt (`expectationFor`).
 */
export async function resolveFall(
  suitesDir: string,
  sheet: string,
  tc: string,
  limit: 'ui' | 'api'
): Promise<AufgeloesterFall> {
  const ref = { entity: sheet, record: tc }
  const suite = await loadSuiteOf(suitesDir, ref.entity)
  const test = suite.tests.find((t) => t.name === ref.record)
  if (!test) {
    throw new Error(
      `Die Referenz verweist auf „${ref.entity}::${ref.record}", diesen Fall gibt es dort ` +
        `nicht. Vorhanden: ${suite.tests.map((t) => t.name).join(', ')}.\n` +
        '🔴 Wer einen Anker-Fall umbenennt, bricht die Zeilen, die auf ihn zeigen.'
    )
  }
  const target = subject(test as SuiteTest)
  if (!target) {
    throw new Error(`${ref.entity}::${ref.record} hat keinen Pruefling in den Aktionen`)
  }

  const fields: Record<string, unknown> = {}
  let aktion: string | undefined
  for (const p of target.props) {
    if (p.click) continue
    if (p.name === undefined || p.set === undefined) continue
    // ⚪ `aktion` ist die SPALTE der Matrix und keine Nutzlast: `buildMatrixSuite`
    // schreibt sie als erste Prop, damit der Fahrer weiss, was zu tun ist.
    if (p.name === 'aktion') {
      aktion = String(p.set)
      continue
    }
    fields[p.name] = p.set
  }

  const expectation = expectationFor(test as SuiteTest, limit)
  if (!expectation) {
    throw new Error(
      `„${ref.entity}/${ref.record}" nennt keine Erwartung — der Schritt liesse sich fahren, ` +
        'aber nicht beurteilen. Eine Zelle ohne Erwartung ist die haeufigste Art, gruen zu ' +
        'sein, ohne etwas zu wissen.'
    )
  }

  const anlage = basiszustand(test as SuiteTest).create[0]?.entity ?? ref.entity

  return {
    sheet: ref.entity,
    tc: ref.record,
    anlage,
    aktion,
    fields,
    secondary: sekundaerdaten(test as SuiteTest),
    expectation,
    test: test as SuiteTest,
  }
}

/**
 * Die Fallnamen eines Bereichs `von..bis`, in der Reihenfolge der Suite.
 *
 * 🔴 Die Reihenfolge ist die der TABELLE, nicht die Sortierung der Namen. `B_01`
 * bis `B_25` sortiert sich zufaellig richtig; `OK_1` bis `OK_10` taete es nicht,
 * und ein Bereich, der andere Faelle faehrt als die Spalten dazwischen, waere
 * schlimmer als gar keiner.
 */
export async function resolveBereich(
  suitesDir: string,
  entity: string,
  from: string,
  until: string
): Promise<string[]> {
  const suite = await loadSuiteOf(suitesDir, entity)
  const names = suite.tests.map((t) => t.name)
  const a = names.indexOf(from)
  const b = names.indexOf(until)
  if (a < 0 || b < 0) {
    throw new Error(
      `Der Bereich „${from}..${until}" in „${entity}": ` +
        `${a < 0 ? `„${from}" gibt es nicht` : ''}${a < 0 && b < 0 ? ' und ' : ''}` +
        `${b < 0 ? `„${until}" gibt es nicht` : ''}. Vorhanden: ${names.join(', ')}.`
    )
  }
  if (b < a) {
    throw new Error(
      `Der Bereich „${from}..${until}" in „${entity}" laeuft rueckwaerts (${from} steht an ` +
        `Stelle ${a + 1}, ${until} an Stelle ${b + 1}). Ein rueckwaerts gelesener Bereich ` +
        'faehrt still NULL Faelle — und null Faelle sind ein gruener Lauf ohne Messung.'
    )
  }
  return names.slice(a, b + 1)
}
