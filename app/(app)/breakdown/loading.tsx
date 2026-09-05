import { Skeleton } from "@/components/ui/Skeleton";

/**
 * What this screen shows while its data is on its way.
 *
 * A file rather than a `<Suspense>` inside the page, which is the opposite of
 * the choice `/transactions`, `/categories` and `/` had to make. A
 * `loading.tsx` wraps its whole segment, every route below it included, and a
 * response that has begun streaming has already sent its 200, so a nested
 * `notFound()` could no longer set a 404. This segment has no routes below it, so there is nothing to break.
 *
 * Without a boundary of some kind the router has nothing to show while the
 * backend is read, so it holds the previous screen frozen and the click feels
 * like nothing happened.
 *
 * One `Skeleton`, not a stack of them. Each instance opens its own live
 * region, and one screen arriving should announce itself once.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <Skeleton
        label="Loading this month's breakdown."
        variant="row"
        count={5}
      />
    </div>
  );
}
