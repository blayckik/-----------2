import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Repeat2,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { api, assetUrl, getErrorMessage, uploadImage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic, shareInvite } from '../lib/telegram';
import { formatNumber, timeAgo, userName } from '../lib/utils';
import type { Comment, Post, UserCard } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageSkeleton,
  SectionHeader,
  Tabs,
  Textarea,
} from '../components/ui';

type FeedTab = 'latest' | 'popular' | 'friends' | 'following' | 'mine';

interface Topic {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
}

interface FeedResponse {
  posts: Post[];
  topics: Topic[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}

export function SocialPage() {
  const { me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FeedTab>('latest');
  const [topic, setTopic] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [reportPost, setReportPost] = useState<Post | null>(null);
  const [reportReason, setReportReason] = useState('SPAM');
  const fileRef = useRef<HTMLInputElement>(null);

  const feed = useInfiniteQuery({
    queryKey: ['feed', tab, topic],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get('/social/feed', {
        params: { tab, topic: topic || undefined, page: pageParam, limit: 10 },
      });
      return data.data as FeedResponse;
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  const posts = useMemo(
    () => feed.data?.pages.flatMap((page) => page.posts) ?? [],
    [feed.data],
  );
  const topics = feed.data?.pages[0]?.topics ?? [];

  const { data: suggestions } = useQuery({
    queryKey: ['social', 'suggestions'],
    queryFn: async () => (await api.get('/friends/suggestions')).data.data as UserCard[],
  });

  const follow = useMutation({
    mutationFn: async (userId: string) => api.post(`/social/users/${userId}/follow`),
    onSuccess: () => {
      haptic('success');
      toast.success('Вы подписались');
      queryClient.invalidateQueries({ queryKey: ['social', 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const like = useMutation({
    mutationFn: async (post: Post) => {
      const response = await api.post(`/social/posts/${post.id}/like`);
      return { postId: post.id, ...response.data.data };
    },
    onMutate: async (post) => {
      updatePost(post.id, (item) => ({
        ...item,
        likedByMe: !item.likedByMe,
        likeCount: item.likeCount + (item.likedByMe ? -1 : 1),
      }));
    },
    onSuccess: (result) => {
      haptic('light');
      updatePost(result.postId, (item) => ({
        ...item,
        likedByMe: result.liked,
        likeCount: result.likeCount,
      }));
    },
    onError: (error, post) => {
      updatePost(post.id, (item) => ({
        ...item,
        likedByMe: post.likedByMe,
        likeCount: post.likeCount,
      }));
      toast.error(getErrorMessage(error));
    },
  });

  const createPost = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (imageFile) imageUrl = await uploadImage(imageFile);
      const response = await api.post('/social/posts', {
        content: content.trim(),
        imageUrl,
        categoryId: selectedTopic || null,
      });
      return response.data.data as Post;
    },
    onSuccess: () => {
      haptic('success');
      toast.success('Публикация добавлена');
      setComposerOpen(false);
      setContent('');
      setImageFile(null);
      setImagePreview(null);
      setSelectedTopic('');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const report = useMutation({
    mutationFn: async () => {
      if (!reportPost) return;
      await api.post('/social/reports', {
        targetPostId: reportPost.id,
        reason: reportReason,
      });
    },
    onSuccess: () => {
      toast.success('Жалоба отправлена модераторам');
      setReportPost(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removePost = useMutation({
    mutationFn: async (post: Post) => api.delete(`/social/posts/${post.id}`),
    onSuccess: () => {
      toast.success('Публикация удалена');
      setMenuPost(null);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const repost = useMutation({
    mutationFn: async (post: Post) => api.post(`/social/posts/${post.id}/repost`, {}),
    onSuccess: () => {
      haptic('success');
      toast.success('Вы поделились публикацией');
      setMenuPost(null);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  function updatePost(postId: string, updater: (post: Post) => Post) {
    queryClient.setQueriesData<{ pages: FeedResponse[]; pageParams: unknown[] }>(
      { queryKey: ['feed'] },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((post) => (post.id === postId ? updater(post) : post)),
          })),
        };
      },
    );
  }

  function pickImage(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Изображение больше 8 МБ');
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#1b1740] via-[#151024] to-[#0a0913] p-5">
        <div className="absolute -right-12 -top-14 h-52 w-52 rounded-full bg-indigo-500/20 blur-[65px]" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-200/70">
            <Sparkles size={13} /> Community
          </div>
          <h1 className="mt-2 font-display text-[25px] font-semibold leading-tight text-white">
            Твоя <span className="text-gradient">лента</span>
          </h1>
          <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-white/55">
            Делись победами, находи единомышленников и следи за жизнью сообщества.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="violet">{(me?.stats?.postsCount ?? 0)} постов</Badge>
            <Badge tone="rose">{(me?.stats?.likesReceived ?? 0)} лайков</Badge>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3 text-left transition hover:border-violet-400/25"
      >
        <Avatar user={me} size={36} />
        <span className="flex-1 text-[12px] text-muted">Поделитесь моментом или мыслью…</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <Plus size={17} />
        </span>
      </button>

      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          haptic('selection');
        }}
        size="sm"
        options={[
          { value: 'latest', label: 'Новое' },
          { value: 'popular', label: 'Популярное' },
          { value: 'friends', label: 'Друзья' },
          { value: 'following', label: 'Подписки' },
          { value: 'mine', label: 'Моё' },
        ]}
      />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => setTopic('')}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
            !topic ? 'border-violet-400/40 bg-violet-500/15 text-violet-200' : 'border-line bg-surface/60 text-muted'
          }`}
        >
          Все темы
        </button>
        {topics.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTopic(item.slug)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${
              topic === item.slug
                ? 'border-violet-400/40 bg-violet-500/15 text-violet-200'
                : 'border-line bg-surface/60 text-muted'
            }`}
          >
            {item.icon} {item.name}
          </button>
        ))}
      </div>

      {feed.isLoading ? (
        <PageSkeleton />
      ) : posts.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon="🪶"
            title={tab === 'mine' ? 'Вы ещё не публиковали' : 'Здесь пока тихо'}
            text="Станьте первым, кто поделится мыслью с сообществом."
            action={<Button onClick={() => setComposerOpen(true)} icon={<Plus size={15} />}>Создать пост</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={me?.id}
              onLike={() => like.mutate(post)}
              onComment={() => setCommentsPost(post)}
              onMenu={() => setMenuPost(post)}
              onRepost={() => repost.mutate(post)}
            />
          ))}
          {feed.hasNextPage && (
            <Button
              variant="secondary"
              fullWidth
              loading={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              Показать ещё
            </Button>
          )}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <section className="pb-2">
          <SectionHeader title="Кого почитать" subtitle="Подпишитесь на активных авторов" />
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
            {suggestions.slice(0, 8).map((user) => (
              <div key={user.id} className="flex w-[132px] shrink-0 flex-col items-center rounded-2xl border border-line bg-surface/60 p-3">
                <button type="button" onClick={() => navigate(`/profile/${user.id}`)}>
                  <Avatar user={user} size={46} ring />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${user.id}`)}
                  className="mt-2 w-full truncate text-center text-[11px] font-semibold text-primary"
                >
                  {userName(user)}
                </button>
                <p className="text-[9px] text-muted">Ур. {user.level}</p>
                <button
                  type="button"
                  onClick={() => follow.mutate(user.id)}
                  className="mt-2 flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[9px] font-bold text-violet-300 transition hover:bg-violet-500/25"
                >
                  <UserPlus size={10} /> Подписаться
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="Новая публикация"
        footer={
          <Button
            fullWidth
            loading={posting || createPost.isPending}
            disabled={!content.trim() || content.length > 2000}
            onClick={() => {
              setPosting(true);
              createPost.mutate(undefined, {
                onSettled: () => setPosting(false),
              });
            }}
            icon={<Send size={15} />}
          >
            Опубликовать
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Avatar user={me} size={36} />
            <div>
              <p className="text-xs font-bold text-primary">{userName(me)}</p>
              <p className="text-[10px] text-muted">Публичная публикация</p>
            </div>
          </div>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Что происходит? Поделитесь победами, мыслями или находками…"
            rows={5}
            maxLength={2000}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white/[0.04] px-3 text-[10px] font-semibold text-muted transition hover:text-primary"
              >
                <ImagePlus size={14} /> Фото
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => pickImage(event.target.files?.[0])}
              />
            </div>
            <span className={`text-[10px] ${content.length > 1900 ? 'text-rose-400' : 'text-muted'}`}>
              {content.length}/2000
            </span>
          </div>
          {imagePreview && (
            <div className="relative overflow-hidden rounded-2xl border border-line">
              <img src={imagePreview} alt="Превью" className="max-h-56 w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur"
              >
                <X size={13} />
              </button>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Тема</p>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedTopic(selectedTopic === item.id ? '' : item.id)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                    selectedTopic === item.id
                      ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                      : 'border-line bg-white/[0.03] text-muted'
                  }`}
                >
                  {item.icon} {item.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <CommentsModal post={commentsPost} onClose={() => setCommentsPost(null)} currentUserId={me?.id} />

      <Modal open={Boolean(menuPost)} onClose={() => setMenuPost(null)} title="Действия">
        <div className="space-y-1.5 pb-2">
          {menuPost && menuPost.author.id !== me?.id && (
            <ActionRow
              icon={<Repeat2 size={16} />}
              label="Поделиться"
              onClick={() => menuPost && repost.mutate(menuPost)}
            />
          )}
          <ActionRow
            icon={<Share2 size={16} />}
            label="Отправить в Telegram"
            onClick={() => {
              if (!menuPost) return;
              shareInvite(`${window.location.origin}/social`, `Пост в FUNBOX: ${menuPost.content.slice(0, 90)}`);
            }}
          />
          {menuPost?.authorId !== me?.id && (
            <ActionRow
              icon={<ShieldAlert size={16} />}
              label="Пожаловаться"
              danger
              onClick={() => {
                setReportPost(menuPost);
                setMenuPost(null);
              }}
            />
          )}
          {menuPost?.authorId === me?.id && (
            <ActionRow
              icon={<Trash2 size={16} />}
              label="Удалить публикацию"
              danger
              onClick={() => menuPost && removePost.mutate(menuPost)}
            />
          )}
        </div>
      </Modal>

      <Modal open={Boolean(reportPost)} onClose={() => setReportPost(null)} title="Жалоба на публикацию">
        <div className="space-y-3 pb-2">
          <p className="text-xs leading-relaxed text-muted">
            Выберите причину. Модератор проверит публикацию и примет решение.
          </p>
          {[
            ['SPAM', 'Спам или реклама'],
            ['ABUSE', 'Оскорбления и травля'],
            ['ADULT', 'Неприемлемый контент'],
            ['VIOLENCE', 'Насилие'],
            ['SCAM', 'Мошенничество'],
            ['OTHER', 'Другое'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setReportReason(value)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                reportReason === value
                  ? 'border-rose-400/40 bg-rose-500/10'
                  : 'border-line bg-white/[0.03]'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  reportReason === value ? 'border-rose-400 bg-rose-500' : 'border-line'
                }`}
              >
                {reportReason === value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="text-xs font-semibold text-primary">{label}</span>
            </button>
          ))}
          <Button fullWidth variant="danger" loading={report.isPending} onClick={() => report.mutate()}>
            Отправить жалобу
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onMenu,
  onRepost,
}: {
  post: Post;
  currentUserId?: string;
  onLike: () => void;
  onComment: () => void;
  onMenu: () => void;
  onRepost: () => void;
}) {
  const [imageOpen, setImageOpen] = useState(false);
  const isOwn = post.author.id === currentUserId;
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 pt-4">
          <Link to={`/profile/${post.authorId}`}>
            <Avatar user={post.author} size={38} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/profile/${post.authorId}`} className="block truncate text-[12px] font-bold text-primary">
              {userName(post.author)}
              {post.authorId === currentUserId && <span className="ml-1.5 text-[9px] text-violet-300">вы</span>}
            </Link>
            <p className="text-[10px] text-muted">
              {post.author.username ? `@${post.author.username} · ` : ''}
              {timeAgo(post.createdAt)}
            </p>
          </div>
          {post.category && (
            <span className="rounded-full border border-line bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-muted">
              {post.category.icon} {post.category.name}
            </span>
          )}
          <button
            type="button"
            onClick={onMenu}
            className="rounded-lg p-1.5 text-muted transition hover:bg-white/[0.06] hover:text-primary"
            aria-label="Действия"
          >
            <MoreHorizontal size={17} />
          </button>
        </div>

        <div className="px-4 pb-3 pt-3">
          {post.repostOf && (
            <div className="mb-2 flex items-center gap-1.5 rounded-xl border border-line/70 bg-white/[0.03] p-2 text-[10px] text-muted">
              <Repeat2 size={12} className="text-emerald-300" />
              Репост от {userName(post.repostOf.author)}
            </div>
          )}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-primary/90">{post.content}</p>
          {post.imageUrl && (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="mt-3 block w-full overflow-hidden rounded-2xl border border-line"
            >
              <img src={assetUrl(post.imageUrl) ?? ''} alt="" className="max-h-[360px] w-full object-cover" loading="lazy" />
            </button>
          )}
          {post.repostOf && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-white/[0.02]">
              <div className="flex items-center gap-2 px-3 py-2">
                <Avatar user={post.repostOf.author} size={24} />
                <p className="text-[10px] font-bold text-primary">{userName(post.repostOf.author)}</p>
                <span className="text-[9px] text-muted">{timeAgo(post.repostOf.createdAt)}</span>
              </div>
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted">{post.repostOf.content}</p>
              {post.repostOf.imageUrl && (
                <img src={assetUrl(post.repostOf.imageUrl) ?? ''} alt="" className="max-h-56 w-full object-cover" loading="lazy" />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center border-t border-line/60 px-2 py-1">
          <button
            type="button"
            onClick={onLike}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition ${
              post.likedByMe ? 'text-rose-400' : 'text-muted hover:text-primary'
            }`}
          >
            <Heart size={16} className={post.likedByMe ? 'fill-rose-500' : ''} />
            {formatNumber(post.likeCount)}
          </button>
          <button
            type="button"
            onClick={onComment}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold text-muted transition hover:text-primary"
          >
            <MessageCircle size={16} />
            {formatNumber(post.commentCount)}
          </button>
          {!isOwn && (
            <button
              type="button"
              onClick={onRepost}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold text-muted transition hover:text-emerald-300"
            >
              <Repeat2 size={16} />
              {formatNumber(post.repostCount)}
            </button>
          )}
        </div>
      </Card>

      <Modal open={imageOpen} onClose={() => setImageOpen(false)} size="lg">
        <img src={assetUrl(post.imageUrl) ?? ''} alt="" className="max-h-[75vh] w-full rounded-2xl object-contain" />
      </Modal>
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06] ${
        danger ? 'text-rose-300' : 'text-primary'
      }`}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

function CommentsModal({
  post,
  onClose,
  currentUserId,
}: {
  post: Post | null;
  onClose: () => void;
  currentUserId?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', post?.id],
    queryFn: async () => (await api.get(`/social/posts/${post!.id}/comments`)).data.data as Comment[],
    enabled: Boolean(post?.id),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!post) return;
      const response = await api.post(`/social/posts/${post.id}/comments`, { content: text.trim() });
      return response.data.data as Comment;
    },
    onSuccess: () => {
      setText('');
      haptic('success');
      queryClient.invalidateQueries({ queryKey: ['comments', post?.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal open={Boolean(post)} onClose={onClose} title="Комментарии" size="md">
      <div className="space-y-3 pb-2">
        {post && <p className="line-clamp-2 rounded-2xl bg-white/[0.03] p-2.5 text-[11px] text-muted">{post.content}</p>}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted" size={20} />
          </div>
        ) : comments && comments.length > 0 ? (
          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2.5">
                <Avatar user={comment.author} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="rounded-2xl rounded-tl-md bg-white/[0.05] px-3 py-2">
                    <p className="text-[10px] font-bold text-primary">
                      {userName(comment.author)}
                      {comment.author.id === currentUserId && <span className="ml-1 text-violet-300">вы</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-primary/85">{comment.content}</p>
                  </div>
                  <p className="ml-1 mt-1 text-[9px] text-muted">{timeAgo(comment.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted">Комментариев пока нет. Начните обсуждение!</div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) send.mutate();
          }}
          className="flex items-center gap-2 border-t border-line pt-3"
        >
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ваш комментарий…"
            className="h-10"
            maxLength={600}
          />
          <Button type="submit" className="h-10 shrink-0" loading={send.isPending} disabled={!text.trim()}>
            <Send size={15} />
          </Button>
        </form>
      </div>
    </Modal>
  );
}
