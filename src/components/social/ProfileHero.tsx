import { motion } from "framer-motion";
import { Award, Calendar, Copy, ExternalLink, Trophy, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XPBar } from "@/components/ui/xp-bar";
import { LeagueBadge } from "./LeagueBadge";
import { CountryFlag } from "./CountryFlag";
import { FollowButton } from "./FollowButton";
import { CompareDialog } from "./CompareDialog";
import { xpForLevel, MARKETS, TRADING_STYLES } from "@/lib/constants";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ProfileHero({ profile, customization, privacy, followers, following, isSelf, isFollowing, globalRank, views }: any) {
  const name = profile.display_name || profile.username;
  const initials = String(name).split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();
  const styleLabel = TRADING_STYLES.find((s) => s.value === profile.trading_style)?.label;
  const marketLabel = MARKETS.find((m) => m.value === profile.preferred_market)?.label;

  const shareLink = typeof window !== "undefined" ? `${window.location.origin}/profile/${profile.username}` : "";
  const copyShare = () => {
    void navigator.clipboard.writeText(shareLink);
    toast.success("Link copied");
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-surface/40">
      <div
        className="h-40 w-full"
        style={{
          background: customization?.banner_url
            ? `url(${customization.banner_url}) center/cover`
            : "linear-gradient(135deg, color-mix(in oklab, var(--primary) 25%, transparent), color-mix(in oklab, var(--accent) 15%, transparent))",
        }}
      >
        <div className="h-full w-full bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
      </div>
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="-mt-16 px-6 pb-6"
      >
        <div className="flex flex-wrap items-end gap-4">
          <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold sm:text-3xl">{name}</h1>
              {privacy?.show_league ? <LeagueBadge league={profile.league} size="md" /> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">@{profile.username}</span>
              {privacy?.show_country ? <span className="inline-flex items-center gap-1"><CountryFlag country={profile.country} showName /></span> : null}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
              {styleLabel ? <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{styleLabel}</Badge> : null}
              {marketLabel ? <Badge variant="outline">{marketLabel}</Badge> : null}
            </div>
            {customization?.headline ? (
              <p className="mt-2 max-w-2xl text-sm text-foreground/90">{customization.headline}</p>
            ) : profile.bio ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{profile.bio}</p>
            ) : null}
            <div className="mt-3 max-w-md">
              <XPBar level={profile.level} xp={profile.xp} needed={xpForLevel(profile.level)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FollowButton userId={profile.id} isSelf={isSelf} />
            <CompareDialog initialUsername={profile.username}>
              <Button variant="outline" size="sm">Compare</Button>
            </CompareDialog>
            <Button variant="ghost" size="sm" onClick={copyShare}><Copy className="mr-1.5 h-3.5 w-3.5" /> Share</Button>
          </div>
        </div>

        {/* stat strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <MiniStat icon={Trophy} label="Global rank" value={`#${globalRank}`} />
          <MiniStat icon={Users} label="Followers" value={followers} />
          <MiniStat icon={Users} label="Following" value={following} />
          <MiniStat icon={Award} label="Level" value={profile.level} />
          <MiniStat icon={Calendar} label="Streak" value={`${profile.streak}d`} />
          <MiniStat icon={ExternalLink} label="Views" value={views} />
        </div>

        {(customization?.website || customization?.x_handle || customization?.discord_handle || customization?.telegram_handle || customization?.youtube_url) ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {customization.website ? <SocialChip label="Website" href={customization.website} /> : null}
            {customization.x_handle ? <SocialChip label="X" href={`https://x.com/${customization.x_handle.replace(/^@/, "")}`} /> : null}
            {customization.telegram_handle ? <SocialChip label="Telegram" href={`https://t.me/${customization.telegram_handle.replace(/^@/, "")}`} /> : null}
            {customization.discord_handle ? <SocialChip label={`Discord · ${customization.discord_handle}`} /> : null}
            {customization.youtube_url ? <SocialChip label="YouTube" href={customization.youtube_url} /> : null}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 font-mono text-lg font-bold">{value ?? "—"}</div>
    </div>
  );
}
function SocialChip({ label, href }: { label: string; href?: string }) {
  const Cmp: any = href ? "a" : "span";
  return (
    <Cmp
      {...(href ? { href, target: "_blank", rel: "noreferrer noopener" } : {})}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/40 px-3 py-1 font-medium",
        href && "transition hover:bg-primary/10 hover:text-primary",
      )}
    >
      {label}
    </Cmp>
  );
}
