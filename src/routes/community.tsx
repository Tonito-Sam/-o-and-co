import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/lib/role-context";
import { AlertTriangle, Heart, MessageCircle, Sparkles, Image, Video, FileText, Paperclip, Reply, Send, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Community — WorkspaceOS" }] }),
  component: Community,
});

type ComposerAttachment = {
  name: string;
  kind: "image" | "video" | "file";
  preview?: string;
  path?: string;
  file?: File;
};

type FeedReply = {
  id: string;
  author: string;
  role: string;
  time: string;
  body: string;
  likes: number;
  liked: boolean;
  replies: FeedReply[];
};

type FeedPost = {
  id: string;
  authorId: string;
  author: string;
  role: string;
  time: string;
  createdAt: string;
  body: string;
  kind: string;
  status: string;
  attachments: ComposerAttachment[];
  reactions: number;
  likes: number;
  liked: boolean;
  shares: number;
  replies: FeedReply[];
};

type CommunityPostRow = {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  branch_id: string | null;
  kind: string | null;
  body: string;
  attachments: ComposerAttachment[] | null;
  status: string;
  created_at: string;
};
type PostReactionRow = { post_id: string; profile_id: string; emoji: string };
type CommunityPostReport = {
  id: string;
  post_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
};

const reportReasons = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_or_violence", label: "Hate or violent content" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "spam", label: "Spam or scam" },
  { value: "misinformation", label: "False or misleading information" },
  { value: "other", label: "Other concern" },
];

function formatPostTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function createReply(body: string, author = "You", role = "Member"): FeedReply {
  return {
    id: `R-${body.length}-${author.length}`,
    author,
    role,
    time: "just now",
    body,
    likes: 0,
    liked: false,
    replies: [],
  };
}

function countReplies(replies: FeedReply[]): number {
  return replies.reduce((total, reply) => total + 1 + countReplies(reply.replies), 0);
}

function ReplyComposer({
  placeholder,
  onSubmit,
}: {
  placeholder?: string;
  onSubmit: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder ?? "Write a reply..."}
        className="min-h-16 border-0 bg-transparent px-0 py-0 focus-visible:ring-0"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!draft.trim()}
          onClick={() => {
            if (!draft.trim()) return;
            onSubmit(draft.trim());
            setDraft("");
          }}
        >
          <Send className="size-3.5" />
          Reply
        </Button>
      </div>
    </div>
  );
}

function FeedReply({
  reply,
  postId,
  onAddReply,
  onToggleLike,
  depth = 0,
}: {
  reply: FeedReply;
  postId: string;
  onAddReply: (postId: string, parentId: string | null, reply: FeedReply) => void;
  onToggleLike: (postId: string, replyId?: string) => void;
  depth?: number;
}) {
  const [isReplying, setIsReplying] = useState(false);

  return (
    <div className={`rounded-lg border bg-background/70 p-3 ${depth > 0 ? "ml-3" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand text-[11px] font-medium">
            {reply.author.split(" ").map((word) => word[0]).slice(0, 2).join("")}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-medium">{reply.author}</div>
            <div className="text-[11px] text-muted-foreground">{reply.role} · {reply.time} ago</div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">{reply.body}</p>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <button className="flex items-center gap-1.5 hover:text-foreground" onClick={() => onToggleLike(postId, reply.id)}>
          <Heart className={`size-3.5 ${reply.liked ? "fill-current text-brand" : ""}`} /> {reply.likes}
        </button>
        <button className="flex items-center gap-1.5 hover:text-foreground" onClick={() => setIsReplying((value) => !value)}>
          <Reply className="size-3.5" /> Reply
        </button>
      </div>
      {isReplying && (
        <div className="mt-3">
          <ReplyComposer
            placeholder="Write a nested reply..."
            onSubmit={(body) => {
              onAddReply(postId, reply.id, createReply(body));
              setIsReplying(false);
            }}
          />
        </div>
      )}
      {reply.replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l pl-3">
          {reply.replies.map((nestedReply) => (
            <FeedReply
              key={nestedReply.id}
              reply={nestedReply}
              postId={postId}
              onAddReply={onAddReply}
              onToggleLike={onToggleLike}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Community() {
  const { role } = useRole();
  const canModerate = ["superadmin", "group-admin", "group-ceo", "crm-manager", "sales-manager"].includes(role.id);
  const [showManagementViews, setShowManagementViews] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<ComposerAttachment[]>([]);
  const [expandedCommentPostId, setExpandedCommentPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reactionLoading, setReactionLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [reports, setReports] = useState<CommunityPostReport[]>([]);
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());
  const [reportingPost, setReportingPost] = useState<FeedPost | null>(null);
  const [reportReason, setReportReason] = useState("other");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [moderatingReportId, setModeratingReportId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoadError("Supabase is not configured. Feed posts cannot be loaded.");
      setLoading(false);
      return;
    }

    let active = true;
    void Promise.resolve(
      supabase
        .from("community_posts")
        .select("id,author_id,author_name,author_role,branch_id,kind,body,attachments,status,created_at")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(100)
        .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error.message);
          setPosts([]);
          setLoading(false);
          return;
        }

        const postRows = (data ?? []) as CommunityPostRow[];
        const [{ data: userData }, reactionResult] = await Promise.all([
          supabase.auth.getUser(),
          postRows.length
            ? supabase
                .from("post_reactions")
                .select("post_id,profile_id,emoji")
                .in("post_id", postRows.map((post) => post.id))
                .eq("emoji", "❤️")
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (reactionResult.error) throw new Error(reactionResult.error.message);
        const reportQueries = await Promise.all([
          canModerate
            ? supabase
                .from("community_post_reports")
                .select("id,post_id,reporter_id,reason,details,created_at")
                .eq("status", "open")
                .order("created_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
          userData.user
            ? supabase
                .from("community_post_reports")
                .select("post_id")
                .eq("reporter_id", userData.user.id)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const [reportResult, ownReportResult] = reportQueries;
        if (reportResult.error) throw new Error(reportResult.error.message);
        if (ownReportResult.error) throw new Error(ownReportResult.error.message);
        const reactionRows = (reactionResult.data ?? []) as PostReactionRow[];
        const reactionsByPost = new Map<string, PostReactionRow[]>();
        for (const reaction of reactionRows) {
          const reactions = reactionsByPost.get(reaction.post_id) ?? [];
          reactions.push(reaction);
          reactionsByPost.set(reaction.post_id, reactions);
        }
        const loadedPosts = await Promise.all(postRows.map(async (post) => {
          const attachments = await Promise.all((post.attachments ?? []).map(async (attachment) => {
            if (!attachment.path) return attachment;
            const { data: signedFile } = await supabase.storage
              .from("community-post-attachments")
              .createSignedUrl(attachment.path, 60 * 60);
            return { ...attachment, preview: signedFile?.signedUrl };
          }));
          return {
            id: post.id,
            authorId: post.author_id,
            author: post.author_name || "Office & Co member",
            role: post.author_role || "Member",
            time: formatPostTime(post.created_at),
            createdAt: post.created_at,
            body: post.body,
            kind: post.kind || "Text",
            status: post.status,
            attachments,
            reactions: reactionsByPost.get(post.id)?.length ?? 0,
            likes: reactionsByPost.get(post.id)?.length ?? 0,
            liked: reactionsByPost.get(post.id)?.some((reaction) => reaction.profile_id === userData.user?.id) ?? false,
            shares: 0,
            replies: [],
          } satisfies FeedPost;
        }));

        if (active) {
          setPosts(loadedPosts);
          setCurrentUserId(userData.user?.id ?? "");
          setReports((reportResult.data ?? []) as CommunityPostReport[]);
          setReportedPostIds(new Set((ownReportResult.data ?? []).map(({ post_id }) => post_id as string)));
          setShowManagementViews(canModerate);
          setLoadError("");
          setLoading(false);
        }
        }),
    ).catch((cause: unknown) => {
        if (!active) return;
        setLoadError(cause instanceof Error ? cause.message : "Could not load feed posts.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canModerate]);

  const handleFileSelection = (kind: ComposerAttachment["kind"], event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setSelectedFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        name: file.name,
        kind,
        preview: kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined,
        file,
      })),
    ]);

    event.target.value = "";
  };

  const handlePost = async () => {
    if (!draft.trim() && selectedFiles.length === 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Feed posting is unavailable because Supabase is not configured.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (userError || !user) throw new Error("Sign in before posting to the feed.");

      const kind = selectedFiles.some((file) => file.kind === "image")
        ? "Photo"
        : selectedFiles.some((file) => file.kind === "video")
          ? "Video"
          : selectedFiles.length
            ? "Attachment"
            : "Text";
      const { data: insertedPost, error: insertError } = await supabase
        .from("community_posts")
        .insert({
          author_id: user.id,
          author_name: role.user,
          author_role: role.title,
          branch_id: role.branchIds?.[0] ?? null,
          kind,
          body: draft.trim() || "Shared a new update with the feed.",
          status: "approved",
        })
        .select("id,author_id,author_name,author_role,branch_id,kind,body,attachments,status,created_at")
        .single();
      if (insertError || !insertedPost) {
        throw new Error(insertError?.message ?? "Could not save your feed post.");
      }

      const uploadedPaths: string[] = [];
      const persistedAttachments: ComposerAttachment[] = [];
      for (const attachment of selectedFiles) {
        if (!attachment.file) continue;
        const extension = attachment.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
        const path = `${insertedPost.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("community-post-attachments")
          .upload(path, attachment.file, { contentType: attachment.file.type || undefined });
        if (uploadError) {
          if (uploadedPaths.length) {
            await supabase.storage.from("community-post-attachments").remove(uploadedPaths);
          }
          await supabase.from("community_posts").delete().eq("id", insertedPost.id);
          throw new Error(uploadError.message);
        }
        uploadedPaths.push(path);
        persistedAttachments.push({ name: attachment.name, kind: attachment.kind, path });
      }

      if (persistedAttachments.length) {
        const { error: attachmentError } = await supabase
          .from("community_posts")
          .update({ attachments: persistedAttachments })
          .eq("id", insertedPost.id);
        if (attachmentError) {
          await supabase.storage.from("community-post-attachments").remove(uploadedPaths);
          await supabase.from("community_posts").delete().eq("id", insertedPost.id);
          throw new Error(attachmentError.message);
        }
      }

      const postAttachments = await Promise.all(persistedAttachments.map(async (attachment) => {
        const { data } = await supabase.storage
          .from("community-post-attachments")
          .createSignedUrl(attachment.path!, 60 * 60);
        return { ...attachment, preview: data?.signedUrl };
      }));
      const newPost: FeedPost = {
        id: insertedPost.id,
        authorId: insertedPost.author_id,
        author: role.user,
        role: role.title,
        time: "just now",
        createdAt: insertedPost.created_at,
        body: insertedPost.body,
        status: insertedPost.status,
        kind,
        attachments: postAttachments,
        reactions: 0,
        likes: 0,
        liked: false,
        shares: 0,
        replies: [],
      };

      selectedFiles.forEach((file) => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
      setPosts((prev) => [newPost, ...prev]);
      setDraft("");
      setSelectedFiles([]);
      toast.success("Post shared with the community.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save your feed post.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitPostReport = async () => {
    if (!reportingPost) return;
    const supabase = getSupabaseClient();
    if (!supabase || !currentUserId) {
      toast.error("Sign in before reporting a post.");
      return;
    }

    setReportSubmitting(true);
    const { error } = await supabase.from("community_post_reports").insert({
      post_id: reportingPost.id,
      reporter_id: currentUserId,
      reason: reportReason,
      details: reportDetails.trim() || null,
    });
    setReportSubmitting(false);
    if (error) {
      toast.error(error.code === "23505" ? "You have already reported this post." : error.message);
      return;
    }

    setReportedPostIds((previous) => new Set([...previous, reportingPost.id]));
    setReportingPost(null);
    setReportDetails("");
    toast.success("Report submitted to the CRM team.");
  };

  const resolvePostReport = async (
    report: CommunityPostReport,
    action: "dismiss" | "remove" | "warn",
  ) => {
    if (!canModerate || !currentUserId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const post = posts.find((item) => item.id === report.post_id);
    if (action !== "dismiss" && !post) {
      toast.error("The reported post is no longer available.");
      return;
    }

    setModeratingReportId(report.id);
    try {
      if (action === "remove" && post) {
        const { error } = await supabase
          .from("community_posts")
          .update({ status: "archived" })
          .eq("id", post.id);
        if (error) throw new Error(error.message);
      }

      if (action === "warn" && post) {
        const reasonLabel = reportReasons.find((item) => item.value === report.reason)?.label ?? "Community guideline concern";
        const { error } = await supabase.from("community_post_warnings").insert({
          post_id: post.id,
          author_id: post.authorId,
          issued_by: currentUserId,
          reason: `${reasonLabel}${report.details ? `: ${report.details}` : ""}`,
        });
        if (error) throw new Error(error.message);
      }

      const { error: reviewError } = await supabase
        .from("community_post_reports")
        .update({
          status: action === "dismiss" ? "dismissed" : "reviewed",
          resolution: action,
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", report.id);
      if (reviewError) throw new Error(reviewError.message);

      if (action === "remove") {
        setPosts((previous) => previous.filter((item) => item.id !== report.post_id));
      }
      setReports((previous) => previous.filter((item) => item.id !== report.id));
      toast.success(action === "remove" ? "Post removed from the feed." : action === "warn" ? "Warning sent to the author." : "Report dismissed.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not resolve this report.");
    } finally {
      setModeratingReportId(null);
    }
  };

  const handleAddReply = (postId: string, parentId: string | null, reply: FeedReply) => {
    setPosts((prev) => prev.map((post) => {
      if (post.id !== postId) return post;

      if (!parentId) {
        return { ...post, replies: [reply, ...post.replies] };
      }

      const addReplyToThread = (items: FeedReply[]): FeedReply[] =>
        items.map((item) => {
          if (item.id === parentId) {
            return { ...item, replies: [reply, ...item.replies] };
          }

          if (item.replies.length) {
            return { ...item, replies: addReplyToThread(item.replies) };
          }

          return item;
        });

      return { ...post, replies: addReplyToThread(post.replies) };
    }));
  };

  const handleToggleLike = (postId: string, replyId?: string) => {
    if (!replyId) {
      const post = posts.find((item) => item.id === postId);
      const supabase = getSupabaseClient();
      if (!post || !supabase || reactionLoading === postId) return;

      void (async () => {
        setReactionLoading(postId);
        try {
          const { data, error: userError } = await supabase.auth.getUser();
          if (userError || !data.user) throw new Error("Sign in before reacting to a post.");

          const result = post.liked
            ? await supabase
                .from("post_reactions")
                .delete()
                .eq("post_id", postId)
                .eq("profile_id", data.user.id)
                .eq("emoji", "❤️")
            : await supabase.from("post_reactions").insert({
                post_id: postId,
                profile_id: data.user.id,
                emoji: "❤️",
              });
          if (result.error) throw new Error(result.error.message);

          setPosts((prev) => prev.map((item) => item.id === postId
            ? {
                ...item,
                liked: !post.liked,
                likes: item.likes + (post.liked ? -1 : 1),
                reactions: item.reactions + (post.liked ? -1 : 1),
              }
            : item));
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : "Could not save your reaction.");
        } finally {
          setReactionLoading(null);
        }
      })();
      return;
    }

    setPosts((prev) => prev.map((post) => {
      if (post.id !== postId) return post;

      const toggleLikeInReplies = (items: FeedReply[]): FeedReply[] =>
        items.map((item) => {
          if (item.id === replyId) {
            return { ...item, liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) };
          }

          if (item.replies.length) {
            return { ...item, replies: toggleLikeInReplies(item.replies) };
          }

          return item;
        });

      return { ...post, replies: toggleLikeInReplies(post.replies) };
    }));
  };

  const handleShare = async (postId: string) => {
    const post = posts.find((item) => item.id === postId);
    if (!post) return;

    const shareText = `Check out this update from ${post.author}: ${post.body}`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "https://officeandco.app";

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Office & Co Feed", text: shareText, url: shareUrl });
      } catch {
        // Ignore share cancellation.
      }
    } else if (typeof window !== "undefined") {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank", "noopener,noreferrer");
    }

    setPosts((prev) => prev.map((item) => (item.id === postId ? { ...item, shares: item.shares + 1 } : item)));
  };

  const feedMetrics = useMemo(() => {
    const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      approved: posts.filter((post) => post.status === "approved").length,
      thisWeek: posts.filter((post) => new Date(post.createdAt).getTime() >= weekStart).length,
      reports: reports.length,
      reactions: posts.reduce((total, post) => total + post.likes, 0),
    };
  }, [posts, reports.length]);

  const trendingTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const tag of post.body.match(/#[\p{L}\p{N}_]+/gu) ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [posts]);

  return (
    <div className="mx-auto max-w-275">
      <PageHeader
        eyebrow="Feed"
        title="The Office & Co feed"
        description="Share updates, ideas and opportunities across the Office & Co community. Posts appear immediately; report content that concerns you."
      />
      {showManagementViews && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Live posts" value={String(feedMetrics.approved)} accent="brand" />
          <StatCard label="Posts this week" value={String(feedMetrics.thisWeek)} accent="success" />
          <StatCard label="Open reports" value={String(feedMetrics.reports)} accent="warning" />
          <StatCard label="Reactions" value={String(feedMetrics.reactions)} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="card-soft p-4">
            <Textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a post, upload an image, add a video, or attach a file…"
              className="border-0 resize-none focus-visible:ring-0 px-0"
            />
            {selectedFiles.length > 0 && (
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/20 p-3">
                {selectedFiles.map((file) => (
                  <div key={`${file.name}-${file.kind}`} className="flex items-center justify-between rounded-md border bg-background/70 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {file.kind === "image" ? <Image className="size-4 text-brand" /> : file.kind === "video" ? <Video className="size-4 text-brand" /> : <Paperclip className="size-4 text-brand" />}
                      <span>{file.name}</span>
                    </div>
                    <span className="text-[11px] capitalize text-muted-foreground">{file.kind}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <div className="text-xs text-muted-foreground hidden sm:block">Share</div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 sm:gap-1.5" onClick={() => composerRef.current?.focus()}><FileText className="size-3" /><span className="hidden sm:inline">Text</span></Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 sm:gap-1.5" onClick={() => imageInputRef.current?.click()}><Image className="size-3" /><span className="hidden sm:inline">Image</span></Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 sm:gap-1.5" onClick={() => videoInputRef.current?.click()}><Video className="size-3" /><span className="hidden sm:inline">Video</span></Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 sm:gap-1.5" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-3" /><span className="hidden sm:inline">Attachment</span></Button>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleFileSelection("image", event)} />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => handleFileSelection("video", event)} />
              <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => handleFileSelection("file", event)} />
            </div>
            <div className="flex items-center justify-between pt-3">
              <div className="text-xs text-muted-foreground">Posts appear in the feed immediately.</div>
              <Button size="sm" className="gap-1.5" onClick={() => void handlePost()} disabled={submitting}>
                <Sparkles className="size-3.5" />{submitting ? "Saving…" : "Post"}
              </Button>
            </div>
          </div>
          {loadError && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Feed posts could not be loaded: {loadError}
            </div>
          )}
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading feed…</div>
          ) : posts.length === 0 ? (
            <div className="rounded-lg border border-dashed px-5 py-12 text-center">
              <h2 className="font-display font-semibold">No posts to show</h2>
              <p className="mt-1 text-sm text-muted-foreground">Be the first to share an update with the Office & Co community.</p>
            </div>
          ) : posts.map((p) => (
            <article key={p.id} className="card-soft p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand text-xs font-medium">
                    {p.author.split(" ").map(w => w[0]).slice(0, 2).join("")}
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{p.author}</div>
                    <div className="text-[11px] text-muted-foreground">{p.role} · {p.time} ago</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{p.kind}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{p.body}</p>
              {p.attachments?.length ? (
                <div className="mt-3 space-y-2">
                  {p.attachments.map((attachment) => (
                    <div key={`${p.id}-${attachment.name}`} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-sm">
                        {attachment.kind === "image" ? <Image className="size-4 text-brand" /> : attachment.kind === "video" ? <Video className="size-4 text-brand" /> : <Paperclip className="size-4 text-brand" />}
                        <span className="font-medium">{attachment.name}</span>
                      </div>
                      {attachment.preview && attachment.kind === "image" ? (
                        <img src={attachment.preview} alt={attachment.name} className="mt-3 max-h-60 w-full rounded-md object-cover" />
                      ) : attachment.preview && attachment.kind === "video" ? (
                        <video controls className="mt-3 max-h-60 w-full rounded-md object-cover">
                          <source src={attachment.preview} />
                        </video>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <button className="flex items-center gap-1.5 hover:text-foreground" disabled={reactionLoading === p.id} onClick={() => handleToggleLike(p.id)}>
                  <Heart className={`size-3.5 ${p.liked ? "fill-current text-brand" : ""}`} /> {p.likes}
                </button>
                {currentUserId && p.authorId !== currentUserId && (
                  <button
                    className="flex items-center gap-1.5 hover:text-foreground"
                    disabled={reportedPostIds.has(p.id)}
                    onClick={() => setReportingPost(p)}
                  >
                    <ShieldAlert className="size-3.5" />
                    {reportedPostIds.has(p.id) ? "Reported" : "Report"}
                  </button>
                )}
                <button
                  className="flex items-center gap-1.5 hover:text-foreground"
                  onClick={() => setExpandedCommentPostId((current) => (current === p.id ? null : p.id))}
                >
                  <MessageCircle className="size-3.5" /> {p.replies.length}
                </button>
                <div className="flex items-center gap-1.5">
                  <Reply className="size-3.5" /> {countReplies(p.replies)}
                </div>
                <button className="flex items-center gap-1.5 hover:text-foreground" onClick={() => handleShare(p.id)}>
                  <Share2 className="size-3.5" /> {p.shares}
                </button>
              </div>
              <div className={`overflow-hidden transition-all duration-300 ease-out ${expandedCommentPostId === p.id ? "mt-3 max-h-250 opacity-100" : "mt-0 max-h-0 opacity-0"}`}>
                <div className="space-y-2 border-t pt-3">
                  <div className="text-sm font-medium text-foreground/90">Leave a comment</div>
                  {p.replies.length > 0 && (
                    <div className="space-y-2 border-l pl-3">
                      {p.replies.map((reply) => (
                        <FeedReply
                          key={reply.id}
                          reply={reply}
                          postId={p.id}
                          onAddReply={handleAddReply}
                          onToggleLike={handleToggleLike}
                        />
                      ))}
                    </div>
                  )}
                  <ReplyComposer
                    placeholder="Write a comment..."
                    onSubmit={(body) => {
                      handleAddReply(p.id, null, createReply(body));
                      setExpandedCommentPostId(null);
                    }}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="space-y-4">
          {showManagementViews && (
            <div className="card-soft p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Reports to review</div>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open reports.</p>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => {
                    const reportedPost = posts.find((post) => post.id === report.post_id);
                    const reason = reportReasons.find((item) => item.value === report.reason)?.label ?? "Other concern";
                    return (
                      <div key={report.id} className="border-t pt-3 first:border-0 first:pt-0">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <AlertTriangle className="size-3.5 text-warning" />{reason}
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{reportedPost?.body ?? "Reported post unavailable"}</p>
                        {report.details && <p className="mt-1 text-xs text-muted-foreground">Reporter note: {report.details}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" disabled={moderatingReportId === report.id} onClick={() => void resolvePostReport(report, "dismiss")}>Dismiss</Button>
                          <Button size="sm" variant="outline" disabled={!reportedPost || moderatingReportId === report.id} onClick={() => void resolvePostReport(report, "warn")}><ShieldAlert className="size-3.5" />Warn</Button>
                          <Button size="sm" variant="destructive" disabled={!reportedPost || moderatingReportId === report.id} onClick={() => void resolvePostReport(report, "remove")}><Trash2 className="size-3.5" />Remove</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="card-soft p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Trending</div>
            {trendingTopics.length ? (
              <ul className="space-y-2 text-sm">
                {trendingTopics.map((topic) => (
                  <li key={topic.tag} className="flex justify-between"><span className="text-brand font-medium">{topic.tag}</span><span className="text-[11px] text-muted-foreground">{topic.count}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No hashtags in recent posts.</p>}
          </div>
        </aside>
      </div>

      <Dialog open={Boolean(reportingPost)} onOpenChange={(open) => !open && setReportingPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this post</DialogTitle>
            <DialogDescription>The CRM team will review your report. Your report is not shown to the post author.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="community-report-reason">Reason</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger id="community-report-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reportReasons.map((reason) => <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="community-report-details">Additional details (optional)</Label>
              <Textarea id="community-report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportingPost(null)}>Cancel</Button>
            <Button onClick={() => void submitPostReport()} disabled={reportSubmitting}>
              {reportSubmitting ? "Sending…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
