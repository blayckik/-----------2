import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Gamepad2, Search as SearchIcon, Sparkles, Users, X } from 'lucide-react';
import { api, assetUrl } from '../lib/api';
import { timeAgo, userName } from '../lib/utils';
import type { Game, Post, UserCard } from '../types';
import { Avatar, Badge, Card, EmptyState, Input, Spinner } from '../components/ui';

interface SearchResults {
  users: UserCard[];
  posts: Post[];
  games: Game[];
  topics: Array<{ id: string; name: string; slug: string; icon: string | null }>;
}

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem('funbox:recent-searches') ?? '[]'));
    } catch {
      setRecent([]);
    }
  }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', deferred],
    queryFn: async () =>
      (await api.get('/search', { params: { q: deferred.trim() } })).data.data as SearchResults,
    enabled: deferred.trim().length >= 2,
  });

  function remember(value: string) {
    const next = [value, ...recent.filter((item) => item !== value)].slice(0, 6);
    setRecent(next);
    localStorage.setItem('funbox:recent-searches', JSON.stringify(next));
  }

  function submit(value = query) {
    if (value.trim().length < 2) return;
    remember(value.trim());
    setQuery(value.trim());
  }

  const empty =
    data &&
    data.users.length === 0 &&
    data.posts.length === 0 &&
    data.games.length === 0 &&
    data.topics.length === 0;

  return (
    <div className="space-y-5 px-4 pt-[calc(var(--safe-top,0px)+16px)]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="relative flex-1">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder="Поиск игроков, постов, игр…"
            className="h-11 pl-10 pr-10"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {query.trim().length < 2 ? (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold text-primary">
            <Sparkles size={14} className="text-violet-300" /> Подсказки
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
            Введите минимум 2 символа. Можно искать по имени, @username, тексту публикаций и названию игры.
          </p>
          {recent.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-muted">Недавние запросы</p>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => submit(item)}
                    className="rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-[10px] text-muted"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      ) : isLoading || isFetching ? (
        <div className="flex justify-center py-16">
          <Spinner size={24} />
        </div>
      ) : empty ? (
        <Card className="p-2">
          <EmptyState icon="🔍" title="Ничего не найдено" text="Попробуйте изменить запрос или проверьте написание." />
        </Card>
      ) : (
        <div className="space-y-5 pb-2">
          {data && data.users.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                <Users size={12} /> Игроки
              </div>
              <Card className="divide-y divide-line/60 overflow-hidden">
                {data.users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      remember(query.trim());
                      navigate(`/profile/${user.id}`);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                  >
                    <Avatar user={user} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-primary">{userName(user)}</p>
                      <p className="text-[10px] text-muted">{user.username ? `@${user.username}` : `Ур. ${user.level}`}</p>
                    </div>
                    <Badge tone="violet">Ур. {user.level}</Badge>
                  </button>
                ))}
              </Card>
            </section>
          )}

          {data && data.games.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                <Gamepad2 size={12} /> Игры
              </div>
              <div className="grid grid-cols-2 gap-2">
                {data.games.map((game) => (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => {
                      const path =
                        game.slug === 'quiz-battle'
                          ? '/games/quiz'
                          : game.slug === 'word-duel'
                            ? '/games/word-duel'
                            : game.slug === 'would-you-rather'
                              ? '/games/wyr'
                              : '/games/image';
                      navigate(path);
                    }}
                    className="relative overflow-hidden rounded-2xl border border-white/10 p-3 text-left"
                    style={{ background: game.gradient }}
                  >
                    <span className="text-2xl">{game.icon}</span>
                    <p className="mt-2 text-[11px] font-bold text-white">{game.title}</p>
                    <p className="text-[9px] text-white/60">{game.subtitle}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {data && data.topics.length > 0 && (
            <section>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Темы</div>
              <div className="flex flex-wrap gap-1.5">
                {data.topics.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => navigate('/social')}
                    className="rounded-full border border-line bg-surface/60 px-3 py-1.5 text-[10px] font-semibold text-muted"
                  >
                    {topic.icon} {topic.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {data && data.posts.length > 0 && (
            <section>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Публикации</div>
              <div className="space-y-2">
                {data.posts.map((post) => (
                  <Card key={post.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <Avatar user={post.author} size={24} />
                      <p className="text-[10px] font-bold text-primary">{userName(post.author)}</p>
                      <span className="ml-auto text-[9px] text-muted">{timeAgo(post.createdAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted">{post.content}</p>
                    {post.imageUrl && (
                      <img src={assetUrl(post.imageUrl) ?? ''} alt="" className="mt-2 h-24 w-full rounded-xl object-cover" loading="lazy" />
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/social')}
                      className="mt-2 text-[10px] font-semibold text-violet-300"
                    >
                      Открыть в ленте →
                    </button>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
