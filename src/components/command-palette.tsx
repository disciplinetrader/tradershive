import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Home,
  LifeBuoy,
  LineChart,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const ROUTES = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/paper-trading", label: "Paper Trading", icon: LineChart },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/challenges", label: "Challenges", icon: Sparkles },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/support", label: "Support", icon: LifeBuoy },
] as const;

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { isAdmin, signOut } = useAuth();

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search or run a command…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {ROUTES.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem key={r.to} value={r.label} onSelect={() => go(r.to)}>
                <Icon className="mr-2 h-4 w-4" />
                {r.label}
              </CommandItem>
            );
          })}
          {isAdmin ? (
            <CommandItem value="Admin" onSelect={() => go("/admin")}>
              <Shield className="mr-2 h-4 w-4" />
              Admin
            </CommandItem>
          ) : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="Sign out"
            onSelect={async () => {
              onOpenChange(false);
              await signOut();
              toast.success("Signed out");
              await navigate({ to: "/auth", replace: true });
            }}
          >
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
