import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCheck,
  ChevronUp,
  ImagePlus,
  MessageCircle,
  MoreVertical,
  Search,
  Send,
  Smile,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { api, assetUrl, getErrorMessage, uploadImage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn, formatTimeLeft, timeAgo, userName } from '../lib/utils';
import type { Conversation, Message } from '../types';
import { Avatar, Button, Card, EmptyState, Input, PageSkeleton, Spinner } from '../components/ui';

const EMOJI = ['😂', '🔥', '❤️', '🎮', '🏆', '😎', '🤔', '👏', '✨', '💜', '😭', '🙌', '🎯', '🚀', '🍕', '👀'];

export function ChatPage() {
  const { id } = useParams();
  return id ? <ChatThread conversationId={id} /> : <ConversationList />;
}

function ConversationList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get('/chat/conversations')).data.data as Conversation[],
    refetchInterval: 30_000,
  });

  const filtered = useMemo(
    () =>
      (conversations ?? []).filter((conversation) =>
        conversation.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [conversations, search],
  );

  return (
    <div className="px-4 pt-[calc(var(--safe-top,0px)+16px)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/70">Direct messages</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Сообщения</h1>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-surface/60 text-muted">
          <MessageCircle size={19} />
        </span>
      </div>

      <div className="relative mt-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск диалога"
          className="h-11 pl-10"
        />
      </div>

      <div className="mt-4">
        {isLoading ? (
          <PageSkeleton />
        ) : filtered.length === 0 ? (
          <Card className="mt-2 p-2">
            <EmptyState
              icon="💬"
              title={search ? 'Диалог не найден' : 'Пока нет сообщений'}
              text="Начните общение с другом — откройте его профиль и нажмите «Написать»."
              action={<Button onClick={() => navigate('/friends')} icon={<Users size={15} />}>Перейти к друзьям</Button>}
            />
          </Card>
        ) : (
          <Card className="divide-y divide-line/60 overflow-hidden">
            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => navigate(`/chat/${conversation.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.04]"
              >
                <Avatar
                  user={{
                    firstName: conversation.title,
                    avatarUrl: conversation.avatarUrl,
                  }}
                  size={48}
                  online={conversation.participants[0]?.lastActiveAt ? Date.now() - new Date(conversation.participants[0].lastActiveAt!).getTime() < 15 * 60_000 : false}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-primary">{conversation.title}</p>
                    <span className="shrink-0 text-[9px] text-muted">{timeAgo(conversation.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className={cn('truncate text-[11px]', conversation.unreadCount ? 'font-semibold text-primary' : 'text-muted')}>
                      {conversation.lastMessage?.type === 'IMAGE' ? '📷 Фото' : conversation.lastMessage?.content ?? 'Начните диалог'}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1.5 text-[9px] font-black text-white">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function ChatThread({ conversationId }: { conversationId: string }) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const lastTypingSent = useRef(0);

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get('/chat/conversations')).data.data as Conversation[],
  });
  const conversation = conversations?.find((item) => item.id === conversationId);
  const other = conversation?.participants.find((participant) => participant.id !== me?.id);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get(`/chat/conversations/${conversationId}/messages`)
      .then((response) => {
        if (!active) return;
        const data = response.data.data as { messages: Message[]; hasMore: boolean };
        setMessages(data.messages);
        setHasMore(data.hasMore);
        void markRead();
      })
      .catch((error) => {
        toast.error(getErrorMessage(error));
        navigate('/chat');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!socket) return;
    const append = (payload: { message: Message; conversationId: string }) => {
      if (payload.conversationId !== conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }
      setMessages((current) =>
        current.some((message) => message.id === payload.message.id)
          ? current
          : [...current, payload.message],
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (payload.message.senderId !== me?.id) void markRead();
    };
    const onRead = (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((current) =>
        current.map((message) =>
          message.senderId === me?.id
            ? {
                ...message,
                receipts: (message.receipts ?? []).map((receipt) => ({ ...receipt, readAt: receipt.readAt ?? new Date().toISOString() })),
              }
            : message,
        ),
      );
    };
    const onTyping = (payload: { conversationId: string; name: string; typing: boolean }) => {
      if (payload.conversationId !== conversationId) return;
      setTypingName(payload.typing ? payload.name : null);
      if (payload.typing) window.setTimeout(() => setTypingName(null), 2500);
    };
    socket.on('chat:new', append);
    socket.on('chat:read', onRead);
    socket.on('chat:typing', onTyping);
    return () => {
      socket.off('chat:new', append);
      socket.off('chat:read', onRead);
      socket.off('chat:typing', onTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 0 ? 'smooth' : 'instant' as ScrollBehavior });
  }, [messages.length, typingName]);

  useEffect(() => {
    if (!socket || !other) return;
    socket.emit('chat:typing', { conversationId, typing: false });
    return () => {
      socket.emit('chat:typing', { conversationId, typing: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId]);

  async function markRead() {
    try {
      await api.post(`/chat/conversations/${conversationId}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications', 'badge'] });
    } catch {
      // best effort
    }
  }

  async function sendText(value = text) {
    const content = value.trim();
    if (!content || sending) return;
    setSending(true);
    setEmojiOpen(false);
    try {
      const response = await api.post(`/chat/conversations/${conversationId}/messages`, {
        content,
        type: 'TEXT',
      });
      const message = response.data.data as Message;
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
      setText('');
      haptic('light');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function sendImage(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Файл больше 8 МБ');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const response = await api.post(`/chat/conversations/${conversationId}/messages`, {
        content: '📷 Фото',
        type: 'IMAGE',
        imageUrl: url,
      });
      const message = response.data.data as Message;
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
      haptic('success');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function loadMore() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
        params: { before: oldest.createdAt, limit: 50 },
      });
      const data = response.data.data as { messages: Message[]; hasMore: boolean };
      setMessages((current) => {
        const ids = new Set(current.map((message) => message.id));
        return [...data.messages.filter((message) => !ids.has(message.id)), ...current];
      });
      setHasMore(data.hasMore);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  function notifyTyping(value: string) {
    setText(value);
    if (!socket) return;
    const now = Date.now();
    if (now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      socket.emit('chat:typing', { conversationId, typing: true });
    }
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      socket.emit('chat:typing', { conversationId, typing: false });
    }, 1800);
  }

  const online = other?.lastActiveAt
    ? Date.now() - new Date(other.lastActiveAt).getTime() < 15 * 60_000
    : false;

  return (
    <div className="fixed inset-0 z-[60] flex h-dvh flex-col bg-app">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-app/85 px-3 pb-2.5 pt-[calc(var(--safe-top,0px)+8px)] backdrop-blur-2xl">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-primary"
          aria-label="Назад"
        >
          <ArrowLeft size={19} />
        </button>
        <Link to={other ? `/profile/${other.id}` : '/friends'} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar user={other} size={37} online={online} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-primary">{conversation?.title ?? 'Диалог'}</p>
            <p className="text-[9px] text-muted">
              {typingName ? <span className="text-violet-300">печатает…</span> : online ? 'в сети' : 'был(а) недавно'}
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => other && navigate(`/profile/${other.id}`)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-primary"
          aria-label="Профиль"
        >
          <MoreVertical size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={22} />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2 py-4">
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="mx-auto flex items-center gap-1 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-[10px] font-semibold text-muted"
              >
                {loadingMore ? <Spinner size={11} /> : <ChevronUp size={12} />} Ранние сообщения
              </button>
            )}
            {messages.length === 0 && (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="text-4xl">👋</span>
                <p className="mt-3 font-display text-base font-semibold">Начните диалог</p>
                <p className="mt-1 max-w-[220px] text-[11px] text-muted">
                  Поздоровайтесь, обсудите игру или пригласите друга в комнату.
                </p>
              </div>
            )}
            {messages.map((message, index) => {
              const mine = message.senderId === me?.id;
              const previous = messages[index - 1];
              const showDate =
                !previous ||
                new Date(message.createdAt).toDateString() !== new Date(previous.createdAt).toDateString();
              const read = (message.receipts ?? []).some((receipt) => receipt.readAt);
              return (
                <div key={message.id}>
                  {showDate && (
                    <div className="my-3 text-center">
                      <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[9px] font-semibold text-muted">
                        {new Date(message.createdAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </span>
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn('flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start')}
                  >
                    {!mine && (!previous || previous.senderId !== message.senderId) && (
                      <Avatar user={message.sender ?? other} size={24} />
                    )}
                    <div
                      className={cn(
                        'max-w-[78%] overflow-hidden rounded-2xl px-3 py-2 text-[13px] leading-relaxed',
                        mine
                          ? 'rounded-br-md bg-gradient-to-br from-violet-500 to-indigo-500 text-white'
                          : 'rounded-bl-md border border-line bg-surface/80 text-primary',
                      )}
                    >
                      {message.type === 'IMAGE' && message.imageUrl && (
                        <img
                          src={assetUrl(message.imageUrl) ?? ''}
                          alt="Фото"
                          className="mb-1.5 max-h-64 w-full rounded-xl object-cover"
                        />
                      )}
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <div className={cn('mt-1 flex items-center justify-end gap-1 text-[8px]', mine ? 'text-white/60' : 'text-muted/70')}>
                        {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {mine && (
                          read ? <CheckCheck size={11} className="text-sky-200" /> : <CheckCheck size={11} className="opacity-50" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>
              );
            })}
            {typingName && (
              <div className="flex items-center gap-2 pl-1 text-[10px] text-muted">
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      className="h-1 w-1 rounded-full bg-violet-300"
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.7, repeat: Infinity, delay: dot * 0.12 }}
                    />
                  ))}
                </span>
                {typingName} печатает…
              </div>
            )}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-app/90 px-2 pb-[calc(8px+var(--safe-bottom,0px))] pt-2 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-[680px] items-end gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-primary"
            aria-label="Отправить фото"
          >
            {uploading ? <Spinner size={17} /> : <ImagePlus size={19} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              void sendImage(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => setEmojiOpen((value) => !value)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-white/[0.06] hover:text-primary"
            aria-label="Эмодзи"
          >
            <Smile size={19} />
          </button>
          <div className="flex min-h-10 flex-1 items-end rounded-2xl border border-line bg-white/[0.04] px-3 py-1.5">
            <textarea
              value={text}
              onChange={(event) => notifyTyping(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendText();
                }
              }}
              placeholder="Сообщение…"
              rows={1}
              maxLength={2000}
              className="max-h-28 w-full resize-none bg-transparent py-1 text-[13px] leading-snug text-primary outline-none placeholder:text-muted/60"
            />
          </div>
          <button
            type="button"
            onClick={() => void sendText()}
            disabled={!text.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg transition active:scale-95 disabled:opacity-40"
            aria-label="Отправить"
          >
            {sending ? <Spinner size={17} /> : <Send size={17} />}
          </button>
        </div>
        {emojiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-2 grid w-full max-w-[680px] grid-cols-8 gap-1 rounded-2xl border border-line bg-raised p-2"
          >
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setText((value) => `${value}${emoji}`);
                  haptic('selection');
                }}
                className="flex h-9 items-center justify-center rounded-lg text-lg transition hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
