import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCORE_KEYS = ["entry", "exit", "risk", "patience", "discipline", "chart"] as const;
const scoresSchema = z.record(z.enum(SCORE_KEYS), z.number().min(0).max(10)).default({});

const submitInput = z.object({
  target_type: z.enum(["trade", "journal", "replay", "idea"]),
  target_id: z.string().uuid(),
  target_owner_id: z.string().uuid(),
  scores: scoresSchema,
  suggestions: z.string().max(4000).optional().nullable(),
  strengths: z.string().max(1000).optional().nullable(),
  weaknesses: z.string().max(1000).optional().nullable(),
  is_mentor_review: z.boolean().default(false),
});

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => submitInput.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.target_owner_id === userId) throw new Error("You cannot review your own content.");
    const values = Object.values(data.scores);
    const overall = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const { data: inserted, error } = await supabase.from("trade_reviews").insert({
      reviewer_id: userId,
      target_type: data.target_type,
      target_id: data.target_id,
      target_owner_id: data.target_owner_id,
      scores: data.scores,
      overall_score: overall,
      suggestions: data.suggestions ?? null,
      strengths: data.strengths ?? null,
      weaknesses: data.weaknesses ?? null,
      is_mentor_review: data.is_mentor_review,
    } as any).select("id").single();
    if (error) throw error;
    // Ledger reputation to reviewer
    await supabase.from("reputation_events").insert({
      user_id: userId,
      kind: data.is_mentor_review ? "mentor_review" : "review_authored",
      points: data.is_mentor_review ? 10 : 5,
      ref_type: "review",
      ref_id: inserted.id,
    });
    return { id: inserted.id };
  });

export const listReviewsForTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    target_type: z.enum(["trade", "journal", "replay", "idea"]),
    target_id: z.string().uuid(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("trade_reviews")
      .select("id, reviewer_id, scores, overall_score, suggestions, strengths, weaknesses, is_mentor_review, created_at")
      .eq("target_type", data.target_type)
      .eq("target_id", data.target_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.reviewer_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, level, league").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return { reviews: (rows ?? []).map((r: any) => ({ ...r, reviewer: map.get(r.reviewer_id) ?? null })) };
  });

export const listMyReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ box: z.enum(["given", "received"]).default("received") }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const col = data.box === "given" ? "reviewer_id" : "target_owner_id";
    const { data: rows, error } = await supabase
      .from("trade_reviews")
      .select("id, reviewer_id, target_owner_id, target_type, target_id, scores, overall_score, suggestions, is_mentor_review, created_at")
      .eq(col, userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const otherIdKey = data.box === "given" ? "target_owner_id" : "reviewer_id";
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r[otherIdKey])));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return { reviews: (rows ?? []).map((r: any) => ({ ...r, other: map.get(r[otherIdKey]) ?? null })) };
  });
