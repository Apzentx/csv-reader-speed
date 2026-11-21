// A faster drop-in for csv-reader 1.0.0 (make.fun's own reference program).
//
// It returns exactly what csv-reader 1.0.0's readCsv returns for every input
// {text, header}: {columns, rows, errors}, following the same written
// broken-row policy, byte for byte in every string and error record:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, and each CRLF or lone CR inside it is read as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended to it as it stands (quote_junk, when the field ends); a quote that
//     never closes is a literal character, and the text after it is read again as
//     an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings,
//     never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra: the
//     cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts on
//     (every LF, CRLF and lone CR inside a quoted field counted), row its record's
//     index in rows (null for the header), in the order met.
//
// Where the reference reads one character at a time and builds each field up a
// character at a time, this reader jumps from delimiter to delimiter with native
// scans (RegExp exec / indexOf) and copies whole spans with slice(), so the
// common case — a short unquoted field, a single-line quoted field — costs one
// native scan and one slice instead of a loop over every character. Pure: no
// clock, no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Next of `,` CR LF at or after lastIndex (unquoted scan). */
const SPECIAL = /[,\r\n]/g;
/** Next of `"` CR LF at or after lastIndex (quoted scan). */
const QSPECIAL = /["\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      SPECIAL.lastIndex = pos;
      const m = SPECIAL.exec(text);
      if (m === null) {
        if (pos < n) {
          value += text.slice(pos, n);
          added += n - pos;
          pos = n;
        }
        return { value, ended: END, added };
      }
      const i = m.index;
      const c = m[0];
      if (c === ',') {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === '\n') {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // c === '\r'
      if (text.charCodeAt(i + 1) === 10) {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A lone CR is dropped (stray_cr); keep scanning from after it.
      error('stray_cr');
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let seg = pos; // start of the current span inside the quotes (holds no CR or LF by construction)
    for (;;) {
      QSPECIAL.lastIndex = pos;
      const m = QSPECIAL.exec(text);
      if (m === null) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      const i = m.index;
      const c = m[0];
      if (c === '"') {
        if (text.charCodeAt(i + 1) === 34) {
          // A doubled quote is one quote.
          value += text.slice(seg, i);
          value += '"';
          pos = i + 2;
          seg = pos;
          continue;
        }
        // The closing quote.
        value += text.slice(seg, i);
        pos = i + 1;
        break;
      }
      // CRLF and a lone CR inside quotes are each one LF.
      value += text.slice(seg, i);
      value += '\n';
      line += 1;
      pos = c === '\r' && text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
      seg = pos;
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
