import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/championship/$slug")({
  beforeLoad: async ({ params, context }) => {
    // Attempt to find a tournament with this slug
    const { data } = await (context as any).supabase
      .from("championships")
      .select("id")
      .eq("slug", params.slug)
      .maybeSingle();

    if (data) {
      // It exists in the new system, redirect to the new Battle Arena tournament detail
      throw redirect({
        to: "/battle-arena/tournaments/$slug",
        params: { slug: params.slug },
        replace: true,
      });
    }

    // If not found, we could redirect to the Arena home or let it 404
    throw redirect({ to: "/battle-arena/tournaments", replace: true });
  },
  component: () => null,
});
