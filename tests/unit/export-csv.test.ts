import { describe, expect, it } from "vitest";

import { escapeCsvField, toCsvDocument } from "@/lib/export";

/**
 * The rules that decide whether an export opens correctly or merely parses.
 *
 * Every one of these is a spec 0010 acceptance criterion rather than a taste
 * question, because a CSV that is technically valid and a CSV that a spreadsheet
 * reads back unchanged are different things, and the gap between them is where
 * an export quietly loses somebody's data.
 *
 * covers: AC-8, AC-9, AC-10, AC-14, AC-19 of spec 0010
 */

describe("escapeCsvField", () => {
  it("leaves an ordinary field alone", () => {
    expect(escapeCsvField("coffee refill")).toBe("coffee refill");
    expect(escapeCsvField("12.50")).toBe("12.50");
    expect(escapeCsvField("")).toBe("");
  });

  it("quotes a field containing a comma", () => {
    expect(escapeCsvField("coffee, and a pastry")).toBe(
      '"coffee, and a pastry"',
    );
  });

  it("doubles an inner quote and wraps the field", () => {
    expect(escapeCsvField('a "quoted" word')).toBe('"a ""quoted"" word"');
  });

  it("doubles before wrapping, not after", () => {
    // The whole of AC-8's order rule, in one case. Wrapping first and then
    // doubling would produce """"a"""" here: the wrapping quotes get doubled
    // too, the field still parses, and it comes back with quotes nobody typed.
    expect(escapeCsvField('"a"')).toBe('"""a"""');
  });

  it("quotes a field containing a line break", () => {
    expect(escapeCsvField("first line\nsecond line")).toBe(
      '"first line\nsecond line"',
    );
    expect(escapeCsvField("first\r\nsecond")).toBe('"first\r\nsecond"');
  });

  it("applies both rules to a field that needs both", () => {
    expect(escapeCsvField('one, "two"\nthree')).toBe('"one, ""two""\nthree"');
  });

  it("writes a formula character through unchanged", () => {
    // AC-9. The only thing that can write a note in this app is the account
    // owner, so prefixing would defend against nobody and would put a character
    // in the file that is not in the note.
    for (const value of ["=1+1", "+1", "-5 refund", "@here"]) {
      expect(escapeCsvField(value)).toBe(value);
    }
  });
});

describe("toCsvDocument", () => {
  const BOM = "﻿";

  it("leads with the byte order mark", () => {
    expect(toCsvDocument(["a"], [])).toMatch(/^﻿/);
  });

  it("separates records with a carriage return and a line feed", () => {
    expect(toCsvDocument(["a", "b"], [["1", "2"]])).toBe(
      `${BOM}a,b\r\n1,2\r\n`,
    );
  });

  it("ends the last record with a separator too", () => {
    expect(toCsvDocument(["a"], [["1"]])).toMatch(/\r\n$/);
  });

  it("writes a header only document when there are no rows", () => {
    // AC-14. An empty ledger is a true answer, and this is what it looks like.
    expect(toCsvDocument(["date", "amount"], [])).toBe(`${BOM}date,amount\r\n`);
  });

  it("escapes every field it writes, in every record", () => {
    expect(toCsvDocument(["note"], [["a, b"], ['say "hi"'], ["plain"]])).toBe(
      `${BOM}note\r\n"a, b"\r\n"say ""hi"""\r\nplain\r\n`,
    );
  });

  it("keeps a multi line field inside one record", () => {
    // The quoted line break must not be read as the end of the row. Two
    // separators in the output, not three, is what proves it.
    const document = toCsvDocument(["note", "amount"], [["one\ntwo", "5.00"]]);

    expect(document).toBe(`${BOM}note,amount\r\n"one\ntwo",5.00\r\n`);
    expect(document.split("\r\n")).toHaveLength(3);
  });

  it("preserves an accented character for the byte order mark to explain", () => {
    expect(toCsvDocument(["note"], [["café"]])).toContain("café");
  });
});
