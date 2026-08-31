import { describe, expect, it } from "vitest";

import { refusal } from "@/lib/errors";
import {
  buildReport,
  monitoringOptions,
  shouldReport,
  stripQuery,
} from "@/lib/monitoring";

import type { ErrorEvent } from "@sentry/nextjs";

/**
 * The one guarantee in spec 0011 that fails silently if it is wrong.
 *
 * Every other constraint in error monitoring announces itself when broken: a
 * wrong environment gate stops reports arriving, a missing source map produces
 * an unreadable trace. A leak produces nothing. Nobody would find out.
 *
 * So this file does not test that the builder removes the fields somebody
 * thought of. It fabricates an event carrying every leak path this app actually
 * has, an amount in a frame's locals, a note, a merchant, the session cookie,
 * the typed filters in the URL, the email on the user object, and asserts that
 * none of it survives anywhere in the output, by searching the serialised
 * report for the values themselves rather than by checking named fields. A test
 * that checked `report.request.cookies === undefined` would pass while the same
 * cookie sat in `contexts`.
 *
 * covers: AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-17 of spec 0011
 */

/** Values that must never appear in a report, in any field, at any depth. */
const AMOUNT = "1250";
const NOTE = "dentist copay";
const MERCHANT = "Dr Alvarez Dental";
const SESSION_TOKEN = "insforge_access_token=eyJhbGciOiJIUzI1NiJ9.secret";
const EMAIL = "someone@example.com";
const IP = "203.0.113.42";

/**
 * An event shaped the way Sentry really builds one, carrying every leak path.
 * The field names here are taken from the SDK's own types, not invented.
 */
function eventCarryingEverything(): ErrorEvent {
  return {
    event_id: "abc123",
    timestamp: 1756600000,
    platform: "node",
    level: "error",
    environment: "production",
    release: "deadbeef",
    type: undefined,
    exception: {
      values: [
        {
          type: "Error",
          value:
            "Your transactions came back short: 12 rows for a count of 13.",
          stacktrace: {
            frames: [
              {
                filename: "/app/lib/export.ts",
                function: "loadAllTransactions",
                lineno: 233,
                colno: 3,
                in_app: true,
                // The dangerous field: locals at the frame.
                vars: { amount_minor: AMOUNT, note: NOTE, merchant: MERCHANT },
                context_line: `  const note = "${NOTE}";`,
                pre_context: [`  const merchant = "${MERCHANT}";`],
                post_context: [`  const amount = ${AMOUNT};`],
              },
            ],
          },
        },
      ],
    },
    request: {
      url: `https://fintrack.app/history?note=${encodeURIComponent(NOTE)}&min=${AMOUNT}`,
      method: "GET",
      data: { amount_minor: AMOUNT, note: NOTE, merchant: MERCHANT },
      query_string: `note=${NOTE}`,
      cookies: { insforge_access_token: SESSION_TOKEN },
      headers: { cookie: SESSION_TOKEN, authorization: "Bearer secret" },
    },
    user: { id: "user-1", email: EMAIL, ip_address: IP, username: "dev" },
    breadcrumbs: [
      {
        category: "console",
        message: `logged amount ${AMOUNT} for ${MERCHANT}`,
      },
    ],
    extra: { amount_minor: AMOUNT, note: NOTE },
    contexts: { spend: { amount_minor: AMOUNT, merchant: MERCHANT } },
    modules: { "some-package": "1.0.0" },
  };
}

describe("shouldReport", () => {
  it("reports from the two deployed environments", () => {
    expect(shouldReport("production")).toBe(true);
    expect(shouldReport("preview")).toBe(true);
  });

  /**
   * The case the whole gate exists for. Vercel does not set VERCEL_ENV on a
   * local machine, because this project's onboarding copies `.env.example`
   * rather than running `vercel env pull`. Written as "not development" the
   * gate reads `undefined !== "development"`, which is true, and a laptop with
   * a real DSN in `.env.local` starts sending its owner's spending to a vendor.
   */
  it("sends nothing when the environment is unset, which is what a laptop looks like", () => {
    expect(shouldReport(undefined)).toBe(false);
    expect(shouldReport("")).toBe(false);
  });

  it("sends nothing from development, or from anything unrecognised", () => {
    expect(shouldReport("development")).toBe(false);
    expect(shouldReport("test")).toBe(false);
    expect(shouldReport("Production")).toBe(false);
  });
});

describe("monitoringOptions", () => {
  const configured = {
    dsn: "https://key@o0.ingest.sentry.io/0",
    environment: "production",
    release: "deadbeef",
  };

  it("stays off with no DSN, which is a supported way to run", () => {
    expect(
      monitoringOptions({ ...configured, dsn: undefined }),
    ).toBeUndefined();
  });

  it("stays off outside production and preview even with a real DSN", () => {
    expect(
      monitoringOptions({ ...configured, environment: undefined }),
    ).toBeUndefined();
    expect(
      monitoringOptions({ ...configured, environment: "development" }),
    ).toBeUndefined();
  });

  it("collects none of the things that default to being collected", () => {
    const options = monitoringOptions(configured);

    // Each of these defaults to ON in this SDK version, and sendDefaultPii
    // being false does not turn them off. Never gathering beats dropping later.
    expect(options?.dataCollection.cookies).toBe(false);
    expect(options?.dataCollection.httpHeaders).toEqual({
      request: false,
      response: false,
    });
    expect(options?.dataCollection.httpBodies).toEqual([]);
    expect(options?.dataCollection.urlQueryParams).toBe(false);
    expect(options?.dataCollection.userInfo).toBe(false);
  });

  it("never gathers the frame locals, which is where an amount would sit", () => {
    const options = monitoringOptions(configured);

    // `keepFrame()` drops these too. That is the guarantee; this is the second
    // line, so a future edit to the builder cannot make it the only one.
    expect(options?.dataCollection.stackFrameVariables).toBe(false);
    expect(options?.dataCollection.frameContextLines).toBe(0);
    expect(options?.dataCollection.databaseQueryData).toBe(false);
  });

  it("keeps errors only, with no tracing and no session replay", () => {
    const options = monitoringOptions(configured);

    expect(options?.tracesSampleRate).toBe(0);
    expect(options?.replaysSessionSampleRate).toBe(0);
    expect(options?.replaysOnErrorSampleRate).toBe(0);
    expect(options?.maxBreadcrumbs).toBe(0);
  });

  it("routes every outgoing event through the allow list builder", () => {
    expect(monitoringOptions(configured)?.beforeSend).toBe(buildReport);
  });
});

describe("stripQuery", () => {
  it("keeps the path and drops what the person typed", () => {
    expect(stripQuery("/history?note=coffee&category=food")).toBe("/history");
    expect(stripQuery("https://fintrack.app/history?note=coffee")).toBe(
      "https://fintrack.app/history",
    );
  });

  it("drops a fragment too", () => {
    expect(stripQuery("/history#note")).toBe("/history");
  });

  it("leaves a bare path alone", () => {
    expect(stripQuery("/transactions")).toBe("/transactions");
    expect(stripQuery("")).toBe("");
  });

  it("does not throw on a value the URL parser would reject", () => {
    expect(() => stripQuery("not a url at all ?x=1")).not.toThrow();
  });
});

describe("buildReport privacy guarantee", () => {
  it("lets nothing about the money out, anywhere in the report", () => {
    const report = buildReport(eventCarryingEverything());
    const serialised = JSON.stringify(report);

    // Searched as raw values rather than by field name, so a value surviving in
    // a field this test never thought to name still fails the test.
    expect(serialised).not.toContain(AMOUNT);
    expect(serialised).not.toContain(NOTE);
    expect(serialised).not.toContain(MERCHANT);
    expect(serialised).not.toContain(SESSION_TOKEN);
    expect(serialised).not.toContain(EMAIL);
    expect(serialised).not.toContain(IP);
    expect(serialised).not.toContain("Bearer");
  });

  it("drops the containers those values arrived in", () => {
    const report = buildReport(eventCarryingEverything());

    expect(report.breadcrumbs).toBeUndefined();
    expect(report.extra).toBeUndefined();
    expect(report.contexts).toBeUndefined();
    expect(report.modules).toBeUndefined();
    expect(report.request?.cookies).toBeUndefined();
    expect(report.request?.headers).toBeUndefined();
    expect(report.request?.data).toBeUndefined();
    expect(report.request?.query_string).toBeUndefined();
    expect(report.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBe(
      undefined,
    );
  });

  it("never mutates the event it was given", () => {
    const event = eventCarryingEverything();
    buildReport(event);

    // The SDK may still use the original afterwards; taking fields out of it
    // rather than building fresh would be the deny list this design rejects.
    expect(event.request?.cookies).toBeDefined();
    expect(event.user?.email).toBe(EMAIL);
  });

  it("keeps what makes a report worth reading", () => {
    const report = buildReport(eventCarryingEverything());

    expect(report.event_id).toBe("abc123");
    expect(report.environment).toBe("production");
    expect(report.release).toBe("deadbeef");
    expect(report.user?.id).toBe("user-1");
    expect(report.request?.url).toBe("https://fintrack.app/history");

    const frame = report.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.filename).toBe("/app/lib/export.ts");
    expect(frame?.function).toBe("loadAllTransactions");
    expect(frame?.lineno).toBe(233);

    // The message travels on purpose. It is the whole value of a report, and
    // this project writes its errors as readable sentences for exactly that.
    expect(report.exception?.values?.[0]?.value).toContain("came back short");
  });

  it("keeps the user id even when no email is present", () => {
    const event = eventCarryingEverything();
    event.user = { id: "user-2" };

    expect(buildReport(event).user?.id).toBe("user-2");
  });

  it("omits the user entirely when nobody is signed in", () => {
    const event = eventCarryingEverything();
    event.user = undefined;

    expect(buildReport(event).user).toBeUndefined();
  });
});

describe("buildReport rebuilding the exception", () => {
  it("keeps the mechanism's three known fields and drops its open bag", () => {
    const event = eventCarryingEverything();
    event.exception!.values![0]!.mechanism = {
      type: "onunhandledrejection",
      handled: false,
      synthetic: true,
      // An open ended bag the SDK fills in. Copying the mechanism whole would
      // carry whatever a later SDK version decides to put here.
      data: { note: NOTE, amount: AMOUNT },
    };

    const report = buildReport(event);
    const mechanism = report.exception?.values?.[0]?.mechanism;

    expect(mechanism).toEqual({
      type: "onunhandledrejection",
      handled: false,
      synthetic: true,
    });
    expect(JSON.stringify(report)).not.toContain(NOTE);
    expect(JSON.stringify(report)).not.toContain(AMOUNT);
  });

  it("leaves the mechanism out entirely when there was none", () => {
    const event = eventCarryingEverything();
    delete event.exception!.values![0]!.mechanism;

    expect(buildReport(event).exception?.values?.[0]).not.toHaveProperty(
      "mechanism",
    );
  });
});

describe("buildReport telling a refusal from a crash", () => {
  it("tags an ordinary crash as a crash", () => {
    const report = buildReport(eventCarryingEverything(), {
      originalException: new Error("something genuinely broke"),
    });

    expect(report.tags?.error_kind).toBe("crash");
    expect(report.tags?.refusal_kind).toBeUndefined();
  });

  it("tags a count mismatch as a refusal, and says which kind", () => {
    const report = buildReport(eventCarryingEverything(), {
      originalException: refusal(
        "count-mismatch",
        "Your transactions came back short.",
      ),
    });

    expect(report.tags?.error_kind).toBe("refusal");
    expect(report.tags?.refusal_kind).toBe("count-mismatch");
  });

  it("tags a missing count as its own kind of refusal", () => {
    const report = buildReport(eventCarryingEverything(), {
      originalException: refusal(
        "missing-count",
        "Your transactions came back without a row count.",
      ),
    });

    expect(report.tags?.refusal_kind).toBe("missing-count");
  });

  it("treats a thrown non error as a crash rather than failing", () => {
    const report = buildReport(eventCarryingEverything(), {
      originalException: "a bare string was thrown",
    });

    expect(report.tags?.error_kind).toBe("crash");
  });
});
