// Reference implementation of the flow-table reader (verbatim from the xhubio SaaS kernel,
// repo/tools/playwright/nanook/src/flow-writer.ts, 2026-09-10). Depends only on `exceljs`.
// Comments are German; the grammar is documented in English in ../SKILL.md.
// The `ref::` cell for <fn:> columns (data reference) is the extension described in
// SKILL.md and is being added to this reader — see Step.ref in the skeleton.

import ExcelJS from 'exceljs'

/**
 * **Liest eine `<FLOW_TABLE>` — eine Zeile ist ein Testfall, die Spalten sind seine
 * Schritte in ihrer Reihenfolge.**
 *
 * ```
 * tc_id │ name          │ description  │ <fn:function>       │ RechtstextEntwurf │ AngebotAnlegen
 * TC1   │ genialer test │ beschreibung │ betriebMitAnmeldung │ OK_agbDeutsch     │ OK_1
 * ```
 *
 * ─── 🔴 Warum diese Richtung und nicht die umgekehrte ───────────────────────
 *
 * Mein erster Entwurf hatte **Schritte als Zeilen und Ablaeufe als Spalten**. Torsten
 * am 2026-08-18: *„sonst brauchen wir fuer jede Flow-Zeile ein Sheet."* Genau so ist
 * es — in jener Form ist ein Blatt **eine** Test-Familie, und jeder wirklich andere
 * Test braucht ein neues Blatt.
 *
 * ⚪ Hier haelt ein Blatt beliebig viele Tests als Zeilen. Die Spalten sind das
 * **Vokabular** der Familie, nicht ihre Faelle. Und der eigentliche Gewinn: Zwei Tests
 * benutzen **verschiedene Faelle derselben Tabelle** — TC1 nimmt `OK_1`, TC2 nimmt
 * `E_ohneKunde`. In meiner Form haette jede Variante eine eigene Zeile gebraucht.
 *
 * ─── Die Regel ist durchgehend dieselbe ─────────────────────────────────────
 *
 * **Die Kopfzeile sagt, woher der Schritt kommt. Die Zelle sagt, welcher.**
 *
 * | Kopfzeile | Zelle | Bedeutung |
 * |---|---|---|
 * | `RechtstextEntwurf` (blank — der Standard) | `OK_agbDeutsch` | ein Fall dieser Entscheidungstabelle |
 * | dieselbe | `A1..A6` | ein **Bereich**: sechs Aufrufe nacheinander |
 * | `<fn:function>` | `betriebMitAnmeldung` | eine registrierte Funktion |
 * | `<pc:account>` | `save` | eine Funktion der Page-Class `account` (klickt den Knopf) |
 * | `KundeAnlegen<mode:check>` | `OK_1` | **derselbe Fall, zurueckgelesen** statt eingegeben |
 *
 * ─── 🔴 Der Modus statt einer eigenen Pruef-Vokabel ─────────────────────────
 *
 * Meine erste Fassung hatte eine Spaltenart `<check:name>`, deren Zelle den erwarteten
 * Wert trug. Torsten am 2026-08-18: *„das sollten wir raus nehmen"* — und stattdessen
 * ein `<mode:…>` an der Datenspalte:
 *
 * ```
 * KundeAnlegen → <pc:kunde>=speichern → <pc:kunde>@oeffnen=edit → KundeAnlegen<mode:check>
 * ```
 *
 * ⚪ Der Gewinn ist, dass die Zusicherung **kein neues Vokabular** braucht: Die Tabelle
 * kennt ihre Felder schon. `<mode:check>` heisst „oeffne den Datensatz und pruefe, dass
 * genau die Werte dieses Falls dastehen" — dieselbe Zelle, derselbe Fall, einmal
 * geschrieben und einmal gelesen.
 *
 * 🔵 Und es ist keine Erfindung, sondern die Rueckkehr zum urspruenglichen Entwurf:
 * Dort stand schon `meta: { pagename: 'company', mode: 'set' }`.
 *
 * 🔴 `<check:name>` dagegen deklarierte eine Zusicherung, deren Messer es nicht gab —
 * genau das Muster, das dieser Lauf dreimal als Befund aufgeschrieben hat. Lieber ein
 * Ablauf ohne Zusicherung als eine Zusicherung ohne Messer.
 *
 * ⚪ Nebeneffekt: `KundeAnlegen` und `KundeAnlegen<mode:check>` sind durch den Modus
 * schon unterscheidbar — der `@zusatz` wird fuer diesen haeufigsten Fall ueberfluessig.
 *
 * Leere Zelle heisst: **dieser Test macht diesen Schritt nicht.**
 *
 * ─── Drei Dinge, die dadurch wegfallen ──────────────────────────────────────
 *
 * 🔵 **Positionszahlen** — die Spaltenreihenfolge IST die Reihenfolge.
 *
 * 🔵 **Wiederholungen** brauchen keine Sonderschreibweise: derselbe Schritt zweimal
 * sind zwei Spalten. Und ein Test, der einen Schritt an anderer Stelle macht, fuellt
 * eine andere Spalte — der Unterschied ist **sichtbar** statt in einer Zahl versteckt.
 *
 * 🔴 **Die Erwartung steht schon in der referenzierten Tabelle.** Ein Schritt auf
 * `E_ohneKunde` erwartet die Ablehnung, die `AngebotAnlegen` dort selbst deklariert.
 * Mein `3-`-Marker war nur noetig, weil ich die Erwartung nicht aus der Referenz zog.
 * Nur `<pc:>` und `<fn:>` haben keine Tabelle hinter sich — dort bedeutet ein `-` an
 * der Zelle „muss abgewiesen werden".
 */

/** Woher ein Schritt kommt — an der Kopfzeile abgelesen. */
export type ColumnKind =
  /**
   * Blanker Blattname: ein Fall (oder Bereich) einer Entscheidungstabelle.
   *
   * `modus` steuert, was mit dem Fall geschieht:
   * - `set` (Standard) — die Felder eingeben
   * - `check` — den Datensatz zuruecklesen und gegen dieselben Felder halten
   */
  | { kind: 'tabelle'; table: string; mode: 'set' | 'check' }
  /** `<fn:…>`: eine registrierte Funktion. Die Zelle nennt sie. */
  | { kind: 'funktion' }
  /** `<pc:account>`: eine Funktion der Page-Class. Die Zelle nennt sie. */
  | { kind: 'page'; eqClass: string }

export interface Column {
  /** Kopfzeile, unveraendert. */
  head: string
  /**
   * Der **Namensraum** dieses Schritts im Testfall-Kontext.
   *
   * ─── 🔴 Warum das nicht der `@zusatz` ist ─────────────────────────────────
   *
   * Ich hatte einen Griff-Mechanismus gebaut: `RechtstextEntwurf@vorVersand` → der
   * Zusatz ist der Name, unter dem spaetere Schritte das Ergebnis ansprechen. Torsten
   * am 2026-08-18: *„aber das @merken oder @pruefen brauchen wir doch gar nicht. Das
   * weiss doch die Funktion selbst."*
   *
   * ⚪ Genau so. Der Namensraum ist, **was der Schritt ist**: der Funktionsname bei
   * `<fn:>`, der Tabellenname bei einer Datenspalte, die Page-Class bei `<pc:>`. Zwei
   * Funktionen, die ein Paar bilden (`merkeBelegHash` / `pruefeBelegHash`), sind
   * zusammen in TypeScript geschrieben und kennen den Namen des anderen ohnehin.
   *
   * 🔵 Damit faellt auch der Eindeutigkeits-Riegel weg: Drei Spalten auf
   * `RechtstextEntwurf` sind drei Schreibzugriffe auf denselben Raum — der letzte
   * gewinnt, wie bei jeder Variablen. Was den ersten Wert noch braucht, merkt ihn sich
   * selbst.
   */
  namespace: string
  /**
   * Der `@zusatz` als reine **Beschriftung** — er sagt dem Leser des Blattes, wofuer
   * die Spalte da ist (`@vorVersand`, `@nachVersand`), und hat **keine Wirkung**.
   *
   * ⚪ Bewusst behalten: Bei `RechtstextEntwurf` dreimal im selben Blatt ist die
   * Position die Mechanik, aber ein Mensch soll nicht mitzaehlen muessen.
   */
  label?: string
  kind: ColumnKind
  /** 0-basierter Index in der Spaltenfolge nach den drei festen. */
  index: number
}

export interface Step {
  column: Column
  /** Zellinhalt ohne das `-`-Suffix. */
  value: string
  /** Bereichsangabe `A1-A6` statt eines einzelnen Falls. */
  area?: { from: string; until: string }
  /**
   * `true` = muss gelingen. Bei Tabellen-Schritten **immer** `true`: die Erwartung
   * steht im referenzierten Fall, nicht hier.
   */
  succeeds: boolean
}

export interface TestCase {
  id: string
  name: string
  description: string
  steps: Step[]
}

export interface FlowSuite {
  sheet: string
  columns: Column[]
  cases: TestCase[]
}

/** Die drei festen Spalten, in dieser Reihenfolge. */
const FIXED = ['tc_id', 'name', 'description'] as const

const MODES = ['set', 'check'] as const

/**
 * Den `@zusatz` abtrennen.
 *
 * 🔵 Er gilt an **jeder** Spaltenart, nicht nur an Tabellen: `<pc:kunde>@oeffnen` ist
 * derselbe Fall wie `RechtstextEntwurf@vorVersand` — zweimal dieselbe Spalte, einmal
 * mit eigenem Griff. Meine erste Fassung liess ihn nur bei Blattnamen zu, und
 * `<pc:kunde>@oeffnen` fiel als „unbekannte Spaltenart" durch. Eine Sonderregel fuer
 * eine von drei Arten waere genau die Sorte Unterschied, die man beim Schreiben eines
 * Blattes nicht im Kopf hat.
 */
const withoutSuffix = (head: string): string => {
  const i = head.lastIndexOf('@')
  return i > 0 && !head.slice(i).includes('>') ? head.slice(0, i) : head
}

function parseHead(rawHead: string): ColumnKind {
  const head = withoutSuffix(rawHead)
  if (/^<fn:[A-Za-z0-9_]*>$/.test(head)) return { kind: 'funktion' }

  const pc = head.match(/^<pc:([A-Za-z0-9_-]+)>$/)
  if (pc) return { kind: 'page', eqClass: pc[1] }

  if (head.startsWith('<')) {
    throw new Error(
      `leseAblauf: unbekannte Spaltenart „${head}". Bekannt: <fn:…> und <pc:klasse> — oder ` +
        'ein blanker Blattname fuer eine Entscheidungstabelle, wahlweise mit <mode:…>. ' +
        'Eine unbekannte Art als Blattnamen zu lesen hiesse, eine Tabelle zu suchen, die ' +
        'niemand gemeint hat.'
    )
  }

  // `KundeAnlegen<mode:check>` bzw. `KundeAnlegen@zweites<mode:check>`
  const having = head.match(/^([^<]+)<mode:([a-z]+)>$/)
  const raw = having ? having[1] : head
  const mode = having ? having[2] : 'set'
  if (!(MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `leseAblauf: unbekannter Modus „${mode}" in „${head}". Bekannt: ${MODES.join(', ')}. ` +
        'Ein unbekannter Modus still als `set` zu lesen hiesse, einen Datensatz anzulegen, ' +
        'wo jemand ihn pruefen wollte.'
    )
  }
  return { kind: 'tabelle', table: raw.replace(/@.*$/, ''), mode: mode as 'set' | 'check' }
}

/**
 * Der Namensraum einer Spalte — **was der Schritt ist**, nicht wie er beschriftet ist.
 *
 * 🔵 Bei `<fn:>` liefert die Kopfzeile ihn nicht: Dort steht die Funktion in der ZELLE.
 * Der Namensraum entsteht also erst beim Lesen der Zeile, und diese Funktion gibt fuer
 * `<fn:>` einen leeren Namen zurueck.
 */
function namespaceFrom(kind: ColumnKind): string {
  if (kind.kind === 'funktion') return ''
  if (kind.kind === 'page') return kind.eqClass
  return kind.table
}

/** Der `@zusatz`, falls einer da ist — nur Beschriftung. */
function labelFrom(rawHead: string): string | undefined {
  const i = rawHead.lastIndexOf('@')
  if (i > 0 && !rawHead.slice(i).includes('>')) return rawHead.slice(i + 1)
  const having = rawHead.match(/^([^<]+)<mode:[a-z]+>$/)
  const basis = having ? having[1] : rawHead
  const j = basis.lastIndexOf('@')
  return j > 0 ? basis.slice(j + 1) : undefined
}

/**
 * Die Ablauf-Blaetter einer Mappe — die, deren A1 `<FLOW_TABLE>` traegt.
 *
 * 🔵 Der Laeufer soll nicht wissen muessen, welche Blaetter in welcher Datei stehen:
 * Er nimmt den Ordner `flow/` und faehrt, was er findet. Ein neues Blatt ist damit
 * eine Zeile im Erzeuger-Skript und **kein** Eintrag im Laeufer.
 */
export async function flowSheets(file: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb.worksheets
    .filter((ws) => String(ws.getCell(1, 1).value ?? '').trim() === '<FLOW_TABLE>')
    .map((ws) => ws.name)
}

export async function readFlow(file: string, sheet: string): Promise<FlowSuite> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.getWorksheet(sheet)
  if (!ws) throw new Error(`leseAblauf: Blatt „${sheet}" gibt es in ${file} nicht`)

  const v = (r: number, c: number): string =>
    String(
      (ws.getCell(r, c).value as { result?: unknown })?.result ?? ws.getCell(r, c).value ?? ''
    ).trim()

  if (v(1, 1) !== '<FLOW_TABLE>') {
    throw new Error(`leseAblauf: „${sheet}" beginnt nicht mit <FLOW_TABLE> (A1 ist „${v(1, 1)}").`)
  }

  // ── Zeile 2: die Kopfzeile ──────────────────────────────────────────────
  const heads: string[] = []
  for (let c = 1; c <= ws.columnCount; c++) {
    const k = v(2, c)
    if (!k) break
    heads.push(k)
  }
  for (const [i, f] of FIXED.entries()) {
    if (heads[i] !== f) {
      throw new Error(
        `leseAblauf: Spalte ${i + 1} heisst „${heads[i] ?? '—'}", erwartet „${f}". Die ersten ` +
          `drei Spalten sind fest: ${FIXED.join(', ')}.`
      )
    }
  }
  if (heads.length <= FIXED.length) {
    throw new Error(`leseAblauf: „${sheet}" hat keine Schritt-Spalte — nichts zu fahren.`)
  }

  const columns: Column[] = heads.slice(FIXED.length).map((head, i) => {
    const kind = parseHead(head)
    return {
      head,
      namespace: namespaceFrom(kind),
      label: labelFrom(head),
      kind,
      index: i,
    }
  })

  /**
   * 🔵 **Keinen Eindeutigkeits-Riegel mehr.** Er stand hier, solange der `@zusatz` der
   * Namensraum war. Jetzt ist der Namensraum die Sache selbst, und mehrere Spalten
   * darauf sind mehrere Schreibzugriffe — der letzte gewinnt, wie bei jeder Variablen.
   *
   * ⚪ Dass ein Ueberschreiben sichtbar bleibt, ist Aufgabe des Berichts: Der Laeufer
   * fuehrt den Kontext nach jedem Schritt mit, damit „woher kam dieser Wert" aus dem
   * Protokoll beantwortbar ist.
   */

  // ── Ab Zeile 3: je Zeile ein Testfall, bis <END> ────────────────────────
  //
  // 🔴 **Die Grenze wird VOR der Schleife festgehalten.** `ws.getCell(r, c)` LEGT die
  // Zelle an, wenn es sie nicht gibt — jeder Lesezugriff hinter dem Blattende erhoeht
  // also `ws.rowCount`. Stand die Grenze in der Bedingung (`r <= ws.rowCount + 1`),
  // wuchs sie schneller als der Zaehler: Bei fehlender `<END>`-Marke lief der Leser in
  // einen Speicherueberlauf statt in seine eigene Fehlermeldung.
  //
  // ⚪ Gefunden von der Mutationsprobe, und nur von ihr: Mit `<END>` bricht die
  // Schleife vorher ab, der Fehler ist unsichtbar. Sieben der acht Riegel meldeten
  // brav — der achte brachte den Prozess um.
  const lastRow = ws.rowCount
  const cases: TestCase[] = []
  let end = false
  for (let r = 3; r <= lastRow + 1; r++) {
    if (v(r, 1) === '<END>') {
      end = true
      break
    }
    const id = v(r, 1)
    if (!id) continue

    const steps: Step[] = []

    for (const sp of columns) {
      const raw = v(r, FIXED.length + sp.index + 1)
      if (!raw) continue

      const succeeds = !raw.endsWith('-')
      const value = succeeds ? raw : raw.slice(0, -1).trim()

      /**
       * 🔴 Ein `-` an einem TABELLEN-Schritt ist ein Entwurfsfehler, kein Kuerzel.
       *
       * Die Erwartung eines Tabellenfalls steht in seiner Tabelle (`Erwartete
       * reaktion`). Sie hier noch einmal zu setzen hiesse, zwei Quellen fuer dieselbe
       * Aussage zu fuehren — und die zweite gewinnt still, wenn sie abweicht.
       */
      if (!succeeds && sp.kind.kind === 'tabelle') {
        throw new Error(
          `leseAblauf: „${id}", Spalte „${sp.head}": ein Minuszeichen an einem ` +
            `Tabellen-Schritt. Die Erwartung von „${value}" steht in der Tabelle ` +
            `${sp.kind.table} selbst — hier waere sie eine zweite Quelle, die still ` +
            'gewinnt, wenn sie abweicht. Das Minuszeichen gibt es nur bei <pc:…> und ' +
            '<fn:…>, die keine Tabelle hinter sich haben.'
        )
      }

      /**
       * 🔴 **Der Bereich trennt mit `..`, nicht mit einem Bindestrich.**
       *
       * Torstens Beispiel schrieb `A1-6`, und genau so hatte ich es gelesen. Beim
       * ersten Blick in die echten Suiten fiel es auf: `E_1-1` ist ein **Fallname**,
       * kein Bereich — jede Firmen- und Kundentabelle hat davon fuenf bis zehn.
       * Der Leser haette `E_1-1` still als „von `E_1` bis `1`" gelesen und einen
       * Bereich gefahren, den niemand gemeint hat.
       *
       * ⚪ Der Bindestrich ist im Fallnamen-Alphabet vergeben; `..` ist es nicht.
       */
      const area = value.match(/^([A-Za-z0-9_-]+)\.\.([A-Za-z0-9_-]+)$/)
      steps.push({
        column: sp,
        value,
        area: area ? { from: area[1], until: area[2] } : undefined,
        succeeds,
      })
    }

    if (steps.length === 0) {
      throw new Error(
        `leseAblauf: Testfall „${id}" hat keinen einzigen Schritt. Eine leere Zeile laeuft ` +
          'gruen durch, ohne etwas zu pruefen.'
      )
    }
    cases.push({ id, name: v(r, 2), description: v(r, 3), steps })
  }

  if (!end) {
    throw new Error(
      `leseAblauf: „${sheet}" hat keine <END>-Marke in Spalte A. Ohne sie ist nicht ` +
        'entscheidbar, wo die Testfaelle aufhoeren — eine angehaengte Notiz wuerde zum Testfall.'
    )
  }
  if (cases.length === 0) {
    throw new Error(`leseAblauf: „${sheet}" hat keinen Testfall zwischen Kopfzeile und <END>.`)
  }

  const ids = cases.map((f) => f.id)
  const duplicateIds = ids.filter((x, i) => ids.indexOf(x) !== i)
  if (duplicateIds.length > 0) {
    throw new Error(
      `leseAblauf: die Testfall-Ids ${[...new Set(duplicateIds)].join(', ')} kommen mehrfach ` +
        'vor. Die Id benennt den Test im Bericht — zweimal dieselbe, und ein Fehlschlag ist ' +
        'nicht zuzuordnen.'
    )
  }

  return { sheet, columns, cases }
}

/**
 * Die Schrittfolge eines Falls als eine Zeile — fuer den Bericht.
 *
 * 🔵 Der Laeufer schreibt sie **immer** mit. Ein Test, der bei Schritt 3 abbricht, muss
 * sagen, was dadurch nicht gemessen wurde; sonst sieht eine abgebrochene Kette aus wie
 * ein einzelner Fehlschlag, obwohl ueber den Rest nichts bekannt ist.
 */
export function stepSequence(tc: TestCase): string {
  return tc.steps
    .map((s, i) => `${i + 1}. ${s.column.head}=${s.value}${s.succeeds ? '' : ' (muss scheitern)'}`)
    .join(' → ')
}
