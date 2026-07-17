import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { followUser, unfollowUser, getFollowState } from "@/lib/social.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function FollowButton({
  userId,
  size = "sm",
  className,
  isSelf,
}: {
  userId: string;
  size?: "sm" | "default";
  className?: string;
  isSelf?: boolean;
}) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getFollowState);
  const follow = useServerFn(followUser);
  const unfollow = useServerFn(unfollowUser);

  const { data, isLoading } = useQuery({
    queryKey: ["follow", userId],
    queryFn: () => stateFn({ data: { userId } }),
    enabled: !isSelf,
  });

  const mut = useMutation({
    mutationFn: (next: boolean) =>
      next ? follow({ data: { userId } }) : unfollow({ data: { userId } }),
    onSuccess: (_r, next) => {
      qc.invalidateQueries({ queryKey: ["follow", userId] });
      qc.invalidateQueries({ queryKey: ["public-profile"] });
      toast.success(next ? "Following" : "Unfollowed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isSelf) return null;
  const isFollowing = !!data?.isFollowing;
  return (
    <Button
      size={size}
      variant={isFollowing ? "outline" : "default"}
      disabled={isLoading || mut.isPending}
      onClick={() => mut.mutate(!isFollowing)}
      className={cn("min-w-[110px]", className)}
    >
      {mut.isPending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : isFollowing ? (
        <UserMinus className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <UserPlus className="mr-1.5 h-3.5 w-3.5" />
      )}
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
