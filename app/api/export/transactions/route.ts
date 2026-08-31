import {
  TRANSACTION_HEADER,
  csvAttachment,
  exportFilename,
  failedResponse,
  loadAllTransactions,
  toCsvDocument,
  toTransactionCsvRow,
  tooLargeResponse,
} from "@/lib/export";
import { requireCompleteSettings } from "@/lib/settings";
import { today } from "@/lib/time";

/**
 * Every transaction on the account, as a file (spec 0010).
 *
 * A route handler rather than a server action, because this is a download and a
 * plain link is the least fragile thing that produces one. No JavaScript is
 * involved anywhere: the browser follows an anchor and saves what comes back
 * (AC-1). It needs no auth code of its own either, since `proxy.ts` closes
 * every path that is not on its public list, and which rows exist at all is row
 * level security (AC-16).
 *
 * Nothing is streamed. The whole document is built and the row count proved
 * before the response is constructed, because a stream has already answered 200
 * by the time it can fail, and what that leaves on disk is a truncated `.csv`
 * that opens, parses, and looks like a finished backup (AC-12).
 *
 * The catch is not a swallow. It turns a thrown message into a plain text
 * response a person can read in the tab they landed in, which is rule 3 of
 * `AGENTS.md` applied to a surface that has no error boundary of its own.
 */
export async function GET() {
  try {
    const settings = await requireCompleteSettings();

    const load = await loadAllTransactions();
    if (!load.ok) return tooLargeResponse(load.matched, load.limit);

    const document = toCsvDocument(
      TRANSACTION_HEADER,
      load.rows.map((row) => toTransactionCsvRow(row, settings.currency)),
    );

    return csvAttachment(
      document,
      exportFilename("transactions", today(new Date(), settings.timezone)),
    );
  } catch (error) {
    return failedResponse(error);
  }
}
