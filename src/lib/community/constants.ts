export const POST_TYPES = [
  { value: "text", label: "Text", icon: "MessageSquare" },
  { value: "chart", label: "Chart Analysis", icon: "LineChart" },
  { value: "trade_idea", label: "Trade Idea", icon: "Target" },
  { value: "journal", label: "Journal Entry", icon: "BookOpen" },
  { value: "battle_result", label: "Battle Result", icon: "Swords" },
  { value: "tournament_result", label: "Tournament Result", icon: "Trophy" },
  { value: "replay", label: "Replay Session", icon: "Play" },
  { value: "strategy", label: "Strategy", icon: "GitBranch" },
  { value: "question", label: "Question", icon: "HelpCircle" },
  { value: "poll", label: "Poll", icon: "BarChart3" },
  { value: "image", label: "Image", icon: "Image" },
  { value: "video", label: "Video", icon: "Video" },
  { value: "pdf", label: "PDF", icon: "FileText" },
] as const;

export type PostType = (typeof POST_TYPES)[number]["value"];

export const REACTION_KINDS = [
  { value: "like", label: "Like", emoji: "👍" },
  { value: "helpful", label: "Helpful", emoji: "💡" },
  { value: "insightful", label: "Insightful", emoji: "🎯" },
  { value: "bullish", label: "Bullish", emoji: "🟢" },
  { value: "bearish", label: "Bearish", emoji: "🔴" },
  { value: "fire", label: "Fire", emoji: "🔥" },
  { value: "clap", label: "Clap", emoji: "👏" },
  { value: "laugh", label: "Laugh", emoji: "😂" },
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number]["value"];

export const VISIBILITY = [
  { value: "public", label: "Public — anyone can see" },
  { value: "followers", label: "Followers only" },
  { value: "private", label: "Only me" },
] as const;

export const FEED_TABS = [
  { value: "following", label: "Following" },
  { value: "trending", label: "Trending" },
  { value: "latest", label: "Latest" },
  { value: "battle_arena", label: "Battle Arena" },
  { value: "strategies", label: "Strategies" },
  { value: "journals", label: "Journals" },
  { value: "education", label: "Education" },
  { value: "announcements", label: "Announcements" },
] as const;

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const m of text.matchAll(/#([a-zA-Z0-9_]{2,32})/g)) tags.add(m[1].toLowerCase());
  return [...tags];
}

export function buildExcerpt(text: string, max = 220): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

// Very small, safe markdown → HTML transform. Escapes HTML, converts a
// handful of trader-friendly tokens. For rich content, the raw markdown is
// stored and this preview is what renders.
export function renderMarkdownSafe(md: string): string {
  if (!md) return "";
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\$([A-Z]{2,10}(?:\/[A-Z]{2,10})?)/g, '<span class="text-primary font-medium">$$$1</span>')
    .replace(/#([a-zA-Z0-9_]{2,32})/g, '<a data-tag="$1" class="text-primary hover:underline">#$1</a>')
    .replace(/@([a-zA-Z0-9_]{2,32})/g, '<a data-user="$1" class="text-primary hover:underline">@$1</a>')
    .replace(/\n/g, "<br/>");
}
