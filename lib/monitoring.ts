import type { ErrorEvent, EventHint, StackFrame } from "@sentry/nextjs";

import { refusalKindOf } from "@/lib/errors";

/**
 * What an error report is allowed to contain, and nothing else (spec 0011).
 *
 * This module is the whole privacy guarantee, and it is built the way it is
 * because of one property of the risk. Every other constraint in this feature
 * announces itself when it breaks: a wrong environment gate means reports stop
 * arriving, a missing source map means an unreadable trace. A privacy leak is
 * silent. It produces no error, no alert, and no symptom, and it would sit in a
 * vendor's database for years with nobody able to notice.
 *
 * So a report is BUILT rather than FILTERED. Nothing is deleted from the event
 * Sentry hands over; a new object is assembled out of fields named here, and
 * everything else fails to travel because it was never copied. The difference
 * matters most for the fields nobody thought of. `StackFrame.vars` carries the
 * local variables at each frame, so an error thrown while saving a spend has
 * the amount sitting in it. `User` has an index signature, so copying the user
 * object and removing the email still ships the IP address and whatever the SDK
 * adds in a later version. A list of things to remove is only ever correct
 * about the things somebody remembered. A list of things to keep is correct by
 * construction, including about fields that do not exist yet.
 *
 * Everything here is pure: no network, no clock, no SDK calls. That is what
 * lets `tests/unit/monitoring.test.ts` prove the guarantee with no backend, the
 * same split `lib/export.ts` made between its pure half and its reading half.
 */

/**
 * The only two environments allowed to report (spec 0011 AC-9).
 *
 * Named as a list of what may report, never as a list of what may not, and the
 * difference here is not stylistic. Vercel sets `VERCEL_ENV` on its own builds
 * and deployments; on a local machine it is absent entirely, because this
 * project's onboarding copies `.env.example` rather than running `vercel env
 * pull`. So the obvious gate, "report unless this is development", reads
 * `undefined !== "development"`, which is true, and the first time somebody
 * pastes a real DSN into `.env.local` to try it out their own spending goes to
 * a third party from their laptop.
 */
const REPORTING_ENVIRONMENTS = ["production", "preview"] as const;

/**
 * Decide whether this environment may send anything at all.
 *
 * Pure and exported so the absent case can actually be tested, which is the one
 * that matters: the bug this guards against looks correct in every environment
 * that sets the variable, and only appears where it is unset.
 */
export function shouldReport(environment: string | undefined): boolean {
  return REPORTING_ENVIRONMENTS.some((allowed) => allowed === environment);
}

/**
 * The Sentry settings shared by the server, the edge, and the browser.
 *
 * One function rather than three config files, so the three cannot drift and
 * quietly disagree about what is collected. Returns `undefined` when this
 * process must not report, which every caller treats as "do not initialise".
 *
 * Two layers of privacy here, deliberately, and the second is not redundant.
 * `dataCollection` stops the SDK gathering cookies, headers, bodies, and query
 * strings in the first place, which matters because those default to being
 * COLLECTED in this SDK version: `sendDefaultPii: false` does not turn them
 * off, contrary to what the name suggests. `beforeSend` then rebuilds whatever
 * still arrives from an allow list, so a default that changes in a later
 * version, or a field that does not exist yet, cannot leak through.
 */
export function monitoringOptions(input: {
  readonly dsn: string | undefined;
  readonly environment: string | undefined;
  readonly release: string | undefined;
}) {
  if (!input.dsn || !shouldReport(input.environment)) return undefined;

  return {
    dsn: input.dsn,
    environment: input.environment,
    release: input.release,

    // Errors only (AC-14). Tracing multiplies event volume for a question
    // nothing in this feature asks, and session replay would record a screen
    // covered in amounts, which would undo everything above it in one setting.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Never collected rather than collected and then dropped (AC-7). A trail of
    // recent console output and network calls is exactly where an amount logged
    // during debugging would sit.
    maxBreadcrumbs: 0,

    // Off at the source. Every one of these defaults to collecting.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      // An empty list is the SDK's way of saying collect no bodies at all. It
      // is not an oversight or a default; the default is all four body types.
      httpBodies: [],
      urlQueryParams: false,
    },

    beforeSend: buildReport,
  };
}

/**
 * Remove the query string and fragment from a URL, keeping the path.
 *
 * The history screen puts its filters in the address bar by design (spec 0009),
 * so a real URL reads `/history?note=coffee&category=...`. That is text the
 * person typed about their own spending, sitting in what looks like routing
 * metadata. The path is what makes a report useful; the query is what makes it
 * a disclosure, so the path stays and the query goes.
 *
 * Written as a string cut rather than with the URL parser on purpose: the value
 * arrives as either an absolute URL or a bare path depending on where in the
 * SDK it was set, and the parser throws on the second. A cut handles both and
 * cannot throw, which matters in a code path that must never break a request.
 */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Keep the frame's position, drop everything the frame knows about values.
 *
 * `filename`, `function`, `lineno`, and `colno` are what make a trace readable.
 * `vars` is the dangerous one and the reason this function exists: it is a map
 * of every local variable in scope at that frame, so on any throw inside a save
 * or a total it holds the amount. `context_line`, `pre_context`, and
 * `post_context` are lines of source, which are not user data but are not
 * needed either, because the uploaded source map is what makes a trace readable
 * in the Sentry UI.
 */
function keepFrame(frame: StackFrame): StackFrame {
  return {
    filename: frame.filename,
    function: frame.function,
    module: frame.module,
    lineno: frame.lineno,
    colno: frame.colno,
    abs_path: frame.abs_path,
    in_app: frame.in_app,
  };
}

/**
 * Build the report that may leave this process, out of allowed fields only.
 *
 * Returns a new event. The one passed in is never mutated and never partially
 * reused, so no field can survive by being missed.
 *
 * The exception's `value` is the app's own written message, and it is the one
 * field here carrying prose rather than metadata. It travels deliberately: a
 * report without the message is worthless, and this project writes its errors
 * as readable sentences precisely so they can be read. Those messages carry row
 * counts and the name of the read, never amounts. That is a property of how
 * they are written rather than something this function can enforce, which is
 * why spec 0011 records it as an invariant and asks for an audit of any future
 * throw site that would put a value into a message.
 */
export function buildReport(event: ErrorEvent, hint?: EventHint): ErrorEvent {
  const kind = refusalKindOf(hint?.originalException);

  const report: ErrorEvent = {
    // Identity and metadata. No user content in any of these.
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    // Which deployment this came from, and which commit built it.
    environment: event.environment,
    release: event.release,
    // Tags this app sets, and only these. Incoming tags are not copied, so a
    // future SDK version cannot introduce one that rides along unexamined.
    // `error_kind` is what AC-2 turns on: a guard refusing and the app crashing
    // are opposite events and have to be told apart without reading prose.
    tags: {
      error_kind: kind ? "refusal" : "crash",
      ...(kind ? { refusal_kind: kind } : {}),
    },
    type: event.type,
  };

  // The error itself, rebuilt frame by frame.
  if (event.exception?.values) {
    report.exception = {
      values: event.exception.values.map((value) => ({
        type: value.type,
        value: value.value,
        mechanism: value.mechanism,
        module: value.module,
        ...(value.stacktrace?.frames
          ? { stacktrace: { frames: value.stacktrace.frames.map(keepFrame) } }
          : {}),
      })),
    };
  }

  // The account, as an opaque id and nothing more. `email`, `username`,
  // `ip_address`, and anything the index signature allows are all left behind.
  // For an app with exactly one real user the id says which of your accounts
  // hit this, which is useful, without naming anybody.
  if (event.user?.id !== undefined) {
    report.user = { id: event.user.id };
  }

  // The route that failed, with the filters stripped out of it. `method`,
  // `data` (the request body, where Server Action arguments land), `cookies`
  // (which carry the session token, so worse than private), `headers`, `env`,
  // and `query_string` are all absent because none is copied.
  if (event.request?.url) {
    report.request = { url: stripQuery(event.request.url) };
  }

  return report;
}
