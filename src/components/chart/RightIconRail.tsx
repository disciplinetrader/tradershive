import {
  Star, Bell, ListTree, Newspaper, CalendarClock, MessagesSquare,
  Bot, Bookmark, Wifi, Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  active?: string;
  onSelect?: (key: string) => void;
}

const ITEMS = [
  { key: "watchlist", icon: Star, title: "Watchlist" },
  { key: "alerts", icon: Bell, title: "Alerts" },
  { key: "data", icon: ListTree, title: "Data window" },
  { key: "hotlist", icon: Waves, title: "Hot list" },
  { key: "news", icon: Newspaper, title: "News" },
  { key: "calendar", icon: CalendarClock, title: "Calendar" },
  { key: "notes", icon: Bookmark, title: "Notes" },
  { key: "chat", icon: MessagesSquare, title: "Chat" },
  { key: "ai", icon: Bot, title: "AI Coach" },
  { key: "stream", icon: Wifi, title: "Stream" },
];

export function RightIconRail({ active = "watchlist", onSelect }: Props) {
  return (
    <aside className="flex h-full w-10 shrink-0 flex-col items-center gap-0.5 border-l border-border/60 bg-[hsl(220_18%_8%)] py-1">
      {ITEMS.map(({ key, icon: Icon, title }) => (
        <button
          key={key}
          title={title}
          onClick={() => onSelect?.(key)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded transition",
            active === key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </aside>
  );
}
