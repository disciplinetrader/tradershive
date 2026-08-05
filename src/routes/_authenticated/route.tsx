import { ClientOnly, createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { RouteError } from "@/components/common/RouteError";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { TimezoneSuggestionModal } from "@/components/layout/TimezoneSuggestionModal";
import { MentorDrawer } from "@/components/ai/MentorDrawer";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  return (
    <ClientOnly fallback={<div className="min-h-dvh w-full bg-background" />}>
    <AppShell>
      <FeedbackProvider>
        <ErrorBoundary
          name="authenticated_outlet"
          fallback={({ error, reset }) => (
            <RouteError
              error={error}
              reset={() => {
                router.invalidate();
                reset();
              }}
              boundary="authenticated_outlet"
            />
          )}
        >
          <Outlet />
        </ErrorBoundary>
      </FeedbackProvider>
      <TimezoneSuggestionModal />
      <MentorDrawer />
    </AppShell>
    </ClientOnly>
  );
}
