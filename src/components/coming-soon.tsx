import { Sparkles } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 rounded-2xl border border-border/60 bg-card/40 p-10 text-center backdrop-blur">
      <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-elegant">
        <Sparkles className="h-5 w-5" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {description ?? "This module is coming soon. It will integrate automatically with your profile, XP, achievements and the rest of the platform."}
      </p>
    </div>
  );
}
