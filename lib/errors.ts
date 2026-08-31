/**
 * The app's own refusals, marked so they can be told apart from a crash.
 *
 * This app throws two different kinds of thing and they mean opposite things. A
 * crash is the system broken. A refusal is the system working: a completeness
 * guard has compared what came back against the count the database reported,
 * found they disagree, and declined to show a money figure it cannot prove.
 * Spec 0011 reports both, because a guard firing is arguably the single most
 * important thing this app can tell you, and reads them differently.
 *
 * The whole module imports nothing, and that is the design rather than an
 * accident. The guards live in `lib/month.ts` and `lib/export.ts`, which are
 * pure read paths; pulling a monitoring SDK into them to tag a throw would put
 * a side effect in the middle of the thing `AGENTS.md` says must stay pure. So
 * the throw site only labels the error, and the SDK stays at the edge, in the
 * instrumentation files, where it reads the label back.
 */

/** What kind of refusal this is. Two today, both about a read that cannot be proved whole. */
export type RefusalKind =
  /** Rows received disagreed with the count the database reported. */
  | "count-mismatch"
  /** The read came back with no count at all, so nothing could be proved either way. */
  | "missing-count";

/**
 * The property the label lives on.
 *
 * Non enumerable on purpose. An enumerable property would show up in
 * `JSON.stringify` and in anything that spreads or logs the error, which means
 * a label meant for monitoring would start appearing in places nobody intended.
 * Non enumerable keeps the error indistinguishable from a plain one to every
 * reader except the one that asks for this key by name.
 */
const REFUSAL_KIND = "fintrackRefusalKind";

/**
 * Build a refusal: an ordinary Error carrying a label saying which guard threw it.
 *
 * Returns an Error rather than extending one, because `AGENTS.md` prefers
 * composition to classes and nothing here needs a subclass. Callers throw the
 * result exactly as they threw `new Error(...)` before, so a refusal still
 * reaches the error boundary, still renders its message, and still reads as
 * ordinary prose to anybody who is not looking for the label.
 */
export function refusal(kind: RefusalKind, message: string): Error {
  const error = new Error(message);

  Object.defineProperty(error, REFUSAL_KIND, {
    value: kind,
    enumerable: false,
    writable: false,
  });

  return error;
}

/**
 * Build a fault: the read itself failed, and the driver's own words stay behind.
 *
 * The message is fixed prose with nothing interpolated into it, and that is the
 * whole point of the function. Spec 0011 copies `exception.value` into every
 * report verbatim, on the reasoning that the app writes its errors as readable
 * sentences carrying row counts and read names rather than values. A database
 * error is not that. It is an opaque payload from a driver, and Postgres is
 * well known to quote the offending literal back at you, so a failed query over
 * a note search could put what you typed inside the message and route it
 * straight past the allow list, which never inspects prose.
 *
 * So the driver's payload is logged where it is useful and stays there. Callers
 * are expected to `console.error` it themselves before throwing this: the
 * server log is a place only you can read, and a report is not.
 *
 * The person sees this message too, on the error screen, and fixed prose is
 * better there as well. Nobody was ever helped by serialised driver JSON.
 */
export function fault(what: string): Error {
  return new Error(
    `Could not read ${what.toLowerCase()}. The database refused the request, and the reason is in the server log. Nothing is shown rather than a figure that might be wrong.`,
  );
}

/**
 * Read the label back, or undefined if this was not a refusal.
 *
 * Takes `unknown` because that is what the thing it reads actually is: Next's
 * `onRequestError` types its error parameter as `unknown`, and a value that
 * reached a catch block could be anything at all, including a string. Narrowing
 * here means no caller has to.
 */
export function refusalKindOf(value: unknown): RefusalKind | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const kind = (value as Record<string, unknown>)[REFUSAL_KIND];

  return kind === "count-mismatch" || kind === "missing-count"
    ? kind
    : undefined;
}
