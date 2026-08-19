import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { categoryColorSchema } from "@/lib/schema";

/**
 * The design tokens are a contract, so they are checked like one.
 *
 * Spec 0003 AC-1 and AC-2 are the only acceptance criteria in this feature that
 * can be proven by arithmetic rather than by looking, so they are proven here.
 * A later edit that darkens a surface or brightens a chip cannot quietly drop a
 * pair below the contrast floor without failing this file.
 */

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** Pull the raw token declarations out of a `:root` block. */
function declarationsIn(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of block.matchAll(/(--fintrack-[a-z-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim());
  }
  return found;
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const lightTokens = declarationsIn(css.slice(0, darkStart));
const darkTokens = declarationsIn(
  css.slice(darkStart, css.indexOf("@theme inline")),
);

/** Resolve one alias hop, so `--fintrack-income: var(--fintrack-category-emerald)` works. */
function resolve(name: string, tokens: Map<string, string>): string {
  const raw = tokens.get(name);
  if (!raw) throw new Error(`No token ${name}`);
  const alias = raw.match(/^var\((--fintrack-[a-z-]+)\)$/);
  return alias ? resolve(alias[1], tokens) : raw;
}

/** OKLCH to linear sRGB, then to the WCAG relative luminance. */
function luminance(oklch: string): number {
  const parsed = oklch.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!parsed) throw new Error(`Not an oklch() value: ${oklch}`);
  const [L, C, H] = [+parsed[1], +parsed[2], +parsed[3]];

  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

const themes = {
  light: lightTokens,
  dark: darkTokens,
} as const;

const categoryNames = categoryColorSchema.options;

describe("design tokens", () => {
  it("declares every colour token in both themes (AC-1)", () => {
    // The light block is the definition of the vocabulary; dark must match it
    // exactly, because a token present in one theme and missing in the other
    // renders as nothing at all in the theme that lacks it.
    expect([...darkTokens.keys()].sort()).toEqual(
      [...lightTokens.keys()].sort(),
    );
  });

  it("covers exactly the ten category names the database allows (AC-2)", () => {
    const tokenNames = [...lightTokens.keys()]
      .filter((name) => name.startsWith("--fintrack-category-"))
      .map((name) => name.replace("--fintrack-category-", ""))
      .sort();

    expect(tokenNames).toEqual([...categoryNames].sort());
  });

  describe.each(["light", "dark"] as const)("%s theme", (theme) => {
    const tokens = themes[theme];
    const bg = resolve("--fintrack-bg", tokens);
    const surface = resolve("--fintrack-surface", tokens);

    it.each(categoryNames)(
      "category %s clears 3:1 on both bg and surface (AC-2)",
      (name) => {
        const colour = resolve(`--fintrack-category-${name}`, tokens);

        expect(contrast(colour, bg)).toBeGreaterThanOrEqual(3);
        expect(contrast(colour, surface)).toBeGreaterThanOrEqual(3);
      },
    );

    it("keeps the ten categories visually distinct from each other (AC-2)", () => {
      // Distance in the OKLab a/b plane plus lightness. Two chips closer than
      // this read as the same colour side by side, which is the failure the
      // criterion is guarding against.
      const points = categoryNames.map((name) => {
        const value = resolve(`--fintrack-category-${name}`, tokens);
        const [, L, C, H] = value.match(
          /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
        )!;
        const h = (+H * Math.PI) / 180;
        return { name, L: +L, a: +C * Math.cos(h), b: +C * Math.sin(h) };
      });

      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const distance = Math.hypot(
            points[i].L - points[j].L,
            points[i].a - points[j].a,
            points[i].b - points[j].b,
          );
          expect(
            distance,
            `${points[i].name} and ${points[j].name} are too close to tell apart`,
          ).toBeGreaterThan(0.08);
        }
      }
    });

    it.each(["fg", "fg-muted", "fg-subtle"])(
      "text colour %s clears 4.5:1 on both bg and surface",
      (name) => {
        const colour = resolve(`--fintrack-${name}`, tokens);

        expect(contrast(colour, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colour, surface)).toBeGreaterThanOrEqual(4.5);
      },
    );

    it("shows the focus ring against every surface it can sit on (AC-5)", () => {
      const focus = resolve("--fintrack-focus", tokens);

      // 3:1 is the WCAG 2.2 floor for a non-text indicator.
      expect(contrast(focus, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, surface)).toBeGreaterThanOrEqual(3);
    });
  });
});
