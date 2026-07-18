import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { PostComposer } from "@/components/community/PostComposer";
import { FeedList } from "@/components/community/FeedList";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FEED_TABS } from "@/lib/community/constants";

const search = z.object({
  tab: z.string().optional(),
  category: z.string().optional(),
  hashtag: z.string().optional(),
  symbol: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/community/")({
  validateSearch: (s) => search.parse(s),
  component: Page,
});

function Page() {
  const s = Route.useSearch();
  const [tab, setTab] = useState<string>(s.tab ?? "latest");
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <PageHeader title="Community" description="Ideas, charts, journals, strategies and battle results — all from real traders." />
        <PostComposer compact />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap justify-start">
            {FEED_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <FeedList tab={tab} categorySlug={s.category} hashtag={s.hashtag} symbol={s.symbol} />
      </div>
      <aside className="space-y-4"><CommunitySidebar activeCategory={s.category} /></aside>
    </div>
  );
}
