import { useRef, useState, type ChangeEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { communityPosts } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Heart, MessageCircle, Sparkles, Image, Video, FileText, Paperclip, Reply, Send, Share2 } from "lucide-react";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Community — WorkspaceOS" }] }),
  component: Community,
});

type ComposerAttachment = {
  name: string;
  kind: "image" | "video" | "file";
  preview?: string;
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

type FeedPost = (typeof communityPosts)[number] & {
  attachments?: ComposerAttachment[];
  likes: number;
  liked: boolean;
  shares: number;
  replies: FeedReply[];
};

const trendingTopics = [
  { tag: "#FoundersBreakfast", count: 13 },
  { tag: "#NewMember", count: 24 },
  { tag: "#AIWorkshop", count: 18 },
  { tag: "#WineDown", count: 29 },
  { tag: "#Hiring", count: 11 },
];

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

function countReplies(replies: FeedReply[]) {
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
  const showManagementViews = ["group-ceo", "community-manager", "branch-manager", "sales-manager"].includes(role.id);
  const [draft, setDraft] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<ComposerAttachment[]>([]);
  const [expandedCommentPostId, setExpandedCommentPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>(() =>
    communityPosts.map((post) => ({
      ...post,
      likes: post.reactions + 4,
      liked: false,
      shares: 2,
      replies: [
        {
          id: `R-${post.id}-1`,
          author: "Office & Co",
          role: "Community Manager",
          time: "1h",
          body: "Thanks for sharing this — we’ll make sure the team sees it.",
          likes: 4,
          liked: false,
          replies: [],
        },
      ],
    })),
  );
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (kind: ComposerAttachment["kind"], event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setSelectedFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        name: file.name,
        kind,
        preview: kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined,
      })),
    ]);

    event.target.value = "";
  };

  const handlePost = () => {
    if (!draft.trim() && selectedFiles.length === 0) return;

    const newPost: FeedPost = {
      id: `P-${posts.length + 1}`,
      author: "You",
      role: "Member",
      time: "just now",
      body: draft.trim() || "Shared a new update with the feed.",
      reactions: 0,
      comments: 0,
      kind: selectedFiles.some((file) => file.kind === "image") ? "Photo" : selectedFiles.some((file) => file.kind === "video") ? "Video" : selectedFiles.length ? "Attachment" : "Text",
      attachments: selectedFiles,
      likes: 0,
      liked: false,
      shares: 0,
      replies: [],
    };

    setPosts((prev) => [newPost, ...prev]);
    setDraft("");
    setSelectedFiles([]);
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
    setPosts((prev) => prev.map((post) => {
      if (post.id !== postId) return post;

      if (!replyId) {
        return { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) };
      }

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

  return (
    <div className="mx-auto max-w-275">
      <PageHeader
        eyebrow="Feed"
        title="The Office & Co feed"
        description="Welcomes, announcements, launches and hiring across every branch. Moderated, automated, alive."
      />
      {showManagementViews && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Active members" value="1,284" delta="+23" accent="brand" />
          <StatCard label="Posts this week" value="184" delta="▲ 12%" accent="success" />
          <StatCard label="Pending approval" value="6" accent="warning" />
          <StatCard label="Engagement rate" value="62%" hint="Likes + comments" />
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
              <div className="text-xs text-muted-foreground">Posts to public feed are reviewed before publishing</div>
              <Button size="sm" className="gap-1.5" onClick={handlePost}><Sparkles className="size-3.5" />Post</Button>
            </div>
          </div>
          {posts.map((p) => (
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
                <button className="flex items-center gap-1.5 hover:text-foreground" onClick={() => handleToggleLike(p.id)}>
                  <Heart className={`size-3.5 ${p.liked ? "fill-current text-brand" : ""}`} /> {p.likes}
                </button>
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
          <div className="card-soft p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Trending</div>
            <ul className="space-y-2 text-sm">
              {["#FoundersBreakfast", "#NewMember", "#AIWorkshop", "#WineDown", "#Hiring"].map(t => (
                <li key={t} className="flex justify-between"><span className="text-brand font-medium">{t}</span><span className="text-[11px] text-muted-foreground">{Math.floor(Math.random() * 40) + 5}</span></li>
              ))}
            </ul>
          </div>
          <div className="card-soft p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">Awaiting approval</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Helix Ventures · Launch</span><Button size="sm" variant="ghost" className="h-6 text-[11px]">Review</Button></div>
              <div className="flex justify-between"><span>BrightSeed · Promo</span><Button size="sm" variant="ghost" className="h-6 text-[11px]">Review</Button></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
