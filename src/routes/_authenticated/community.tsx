import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommunityNavRail, CommunityNavStrip } from "@/components/community/CommunityNav";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";
import { CreatePostDialog } from "@/components/community/CreatePostDialog";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community — TradersHIVE Arena" },
      { name: "description", content: "A trading community feed: ideas, charts, mentors, study groups, live sessions and challenges." },
    ],
  }),
  component: Layout,
});

/** Routes that read like a social feed get the discovery rail on the right. */
const FEED_ROUTES = ["/community", "/community/explore", "/community/following", "/community/trending", "/community/bookmarks"];

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showRail = FEED_ROUTES.includes(pathname);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-4 lg:hidden">
        <CommunityNavStrip />
      </div>

      <div
        className={
          showRail
            ? "grid gap-6 lg:grid-cols-[204px_minmax(0,1fr)] xl:grid-cols-[204px_minmax(0,1fr)_312px]"
            : "grid gap-6 lg:grid-cols-[204px_minmax(0,1fr)]"
        }
      >
        <div className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <CreatePostDialog
              trigger={
                <Button className="w-full rounded-full" size="sm">
                  <PenSquare className="mr-1.5 h-4 w-4" /> Create post
                </Button>
              }
            />
            <CommunityNavRail />
          </div>
        </div>

        <main className="min-w-0">
          <Outlet />
        </main>

        {showRail ? (
          <aside className="hidden xl:block">
            <div className="sticky top-4">
              <CommunitySidebar />
            </div>
          </aside>
        ) : null}
      </div>

      {/* Mobile create-post FAB — the familiar social shortcut. */}
      <div className="fixed bottom-20 right-4 z-40 lg:hidden">
        <CreatePostDialog
          trigger={
            <Button size="icon" className="h-12 w-12 rounded-full shadow-lg" aria-label="Create post">
              <PenSquare className="h-5 w-5" />
            </Button>
          }
        />
      </div>
    </div>
  );
}
