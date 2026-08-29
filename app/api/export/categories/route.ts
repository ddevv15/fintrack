import {
  CATEGORY_HEADER,
  csvAttachment,
  exportFilename,
  failedResponse,
  loadAllCategories,
  toCategoryCsvRow,
  toCsvDocument,
  tooLargeResponse,
} from "@/lib/export";
import { requireCompleteSettings } from "@/lib/settings";
import { today } from "@/lib/time";

/**
 * Every category on the account, as a file (spec 0010).
 *
 * The second half of a backup, and the half that is easy to skip. Without it
 * the `category_id` column in the transactions file points at nothing, a
 * category you made and never spent under is not recorded anywhere, and every
 * colour and hidden flag is lost. Both kinds are included, and hidden ones too:
 * hiding a category is a choice about a picker, not about history (AC-3).
 *
 * It reads no money, so it needs no currency; the day in its filename still
 * comes from the profile timezone, so the two files a person downloads together
 * are named the same way.
 */
export async function GET() {
  try {
    const settings = await requireCompleteSettings();

    const load = await loadAllCategories();
    if (!load.ok) return tooLargeResponse(load.matched, load.limit);

    const document = toCsvDocument(
      CATEGORY_HEADER,
      load.rows.map(toCategoryCsvRow),
    );

    return csvAttachment(
      document,
      exportFilename("categories", today(new Date(), settings.timezone)),
    );
  } catch (error) {
    return failedResponse(error);
  }
}
