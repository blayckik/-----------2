import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Coins,
  Gamepad2,
  HelpCircle,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { BOT_USERNAME } from '../lib/api';
import { haptic } from '../lib/telegram';
import { cn, formatNumber } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, SectionHeader } from '../components/ui';

const guides = [
  {
    slug: '/games/quiz',
    icon: '⚡',
    title: 'Quiz Battle',
    subtitle: 'Викторина на скорость',
    gradient: 'linear-gradient(135deg,#7c3aed,#4f46e5,#0ea5e9)',
    steps: [
      'Выберите категорию и количество вопросов.',
      'Создайте комнату, позовите друга или зайдите в публичное лобби.',
      'Отвечайте быстрее всех: скорость даёт бонус к очкам.',
    ],
    tip: 'Побеждает не тот, кто жмёт первым, а тот, кто отвечает точно.',
  },
  {
    slug: '/games/word-duel',
    icon: '🔤',
    title: 'Word Duel',
    subtitle: 'Словесная дуэль',
    gradient: 'linear-gradient(135deg,#059669,#0d9488,#06b6d4)',
    steps: [
      'Получите 16 букв и 90 секунд на раунд.',
      'Составляйте слова из доступных букв — буквы расходуются.',
      'Сервер проверит каждое слово по словарю на 100 000+ слов.',
    ],
    tip: 'Длинные слова дают больше очков. Начинайте с коротких, чтобы разогреться.',
  },
  {
    slug: '/games/wyr',
    icon: '🤔',
    title: 'Would You Rather',
    subtitle: 'А ты бы выбрал?',
    gradient: 'linear-gradient(135deg,#db2777,#e11d48,#f97316)',
    steps: [
      'Выберите один из двух необычных вариантов.',
      'Сразу увидите, как проголосовало сообщество.',
      'Предложите свою дилемму — после модерации она появится в игре.',
    ],
    tip: 'За каждый голос начисляются XP и FUN Coins, повторный голос невозможен.',
  },
  {
    slug: '/games/image',
    icon: '🖼️',
    title: 'Guess the Image',
    subtitle: 'Угадай изображение',
    gradient: 'linear-gradient(135deg,#d97706,#dc2626,#9333ea)',
    steps: [
      'Рассмотрите фотографию и введите ответ.',
      'У вас три попытки; после ошибок открываются подсказки.',
      'За первое верное угадывание — XP, FUN Coins и достижение.',
    ],
    tip: 'Начните с общего описания: страна, объект или категория.',
  },
];

const faq = [
  {
    q: 'Что такое FUNBOX?',
    a: 'Это развлекательная платформа внутри Telegram: четыре игры, социальная лента, друзья, личный чат, задания, достижения, рейтинги и внутренняя валюта. Всё открывается в Mini App через Telegram-бота.',
  },
  {
    q: 'Что такое FUN Coins?',
    a: 'Виртуальная игровая валюта. Её нельзя купить за реальные деньги, обменять или вывести. Монеты начисляются за игры, задания, достижения, ежедневные бонусы и приглашения друзей.',
  },
  {
    q: 'Как работают уровни и XP?',
    a: 'Уровень зависит от суммарного XP: каждый следующий уровень требует больше опыта. XP начисляется за игры, квесты, достижения и активность. Прогресс сохраняется на сервере.',
  },
  {
    q: 'Можно ли играть без друзей?',
    a: 'Да. Would You Rather и Guess the Image рассчитаны на одиночную игру. В Quiz Battle и Word Duel нужен второй реальный игрок — пригласите друга или зайдите в публичное лобби. Друзей можно добавить позже через поиск.',
  },
  {
    q: 'Почему награда за задание не начислилась?',
    a: 'Награда выдаётся только после выполнения условия и нажатия «Забрать». Повторное получение заблокировано на сервере. Если прогресс не обновился, обновите экран — задания пересчитываются автоматически.',
  },
  {
    q: 'Как стать модератором или администратором?',
    a: 'Роли назначаются только через админ-панель или серверную конфигурацию ADMIN_TELEGRAM_IDS. Клиент не может выдать себе права: все проверки выполняются на backend.',
  },
  {
    q: 'Где хранятся мои данные?',
    a: 'В PostgreSQL: профиль, игровая статистика, публикации, сообщения и транзакции. Пароли не используются — вход подтверждается подписью Telegram initData.',
  },
  {
    q: 'Что делать, если игра зависла?',
    a: 'Вернитесь в лобби и создайте новую комнату. Результаты завершённых матчей уже сохранены. Если ошибка повторяется — напишите в поддержку через Telegram-бота.',
  },
];

export function AboutPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="space-y-6 px-4 pb-4 pt-[calc(var(--safe-top,0px)+14px)]">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
          aria-label="Назад"
        >
          <ArrowLeft size={18} />
        </button>
        <Badge tone="violet">FUNBOX Guide</Badge>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-muted">
          <BookOpen size={17} />
        </span>
      </div>

      <section className="relative overflow-hidden rounded-[30px] border border-white/[0.1] bg-gradient-to-br from-[#251a4d] via-[#17122f] to-[#0a0914] p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-500/25 blur-[70px]" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-fuchsia-500/15 blur-[60px]" />
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl backdrop-blur">
            🎮
          </div>
          <h1 className="mt-4 font-display text-[26px] font-semibold leading-tight text-white">
            Как играть в <span className="text-gradient">FUNBOX</span>
          </h1>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-white/60">
            Короткий гид по режимам, наградам и возможностям платформы. Всё, что нужно,
            чтобы начать зарабатывать XP и подниматься в рейтинге.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">4 игры</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">24 фото</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">16 достижений</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/75">реальное время</span>
          </div>
        </div>
      </section>

      {me && (
        <div className="grid grid-cols-3 gap-2">
          <QuickStat icon={<Zap size={14} />} value={formatNumber(me.xp)} label="XP" />
          <QuickStat icon={<Trophy size={14} />} value={String(me.level)} label="уровень" />
          <QuickStat icon={<Users size={14} />} value={String(me.stats?.friendsCount ?? 0)} label="друзей" />
        </div>
      )}

      <section>
        <SectionHeader title="Игровые режимы" subtitle="Выберите формат под настроение" />
        <div className="space-y-3">
          {guides.map((guide, index) => (
            <motion.div
              key={guide.slug}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="overflow-hidden">
                <div className="relative overflow-hidden p-4" style={{ background: guide.gradient }}>
                  <div className="absolute -right-5 -top-6 text-[80px] opacity-[0.14]">{guide.icon}</div>
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-white">{guide.title}</h3>
                      <p className="text-[10px] font-medium text-white/65">{guide.subtitle}</p>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-xl backdrop-blur">
                      {guide.icon}
                    </span>
                  </div>
                </div>
                <div className="space-y-2.5 p-4">
                  {guide.steps.map((step, stepIndex) => (
                    <div key={step} className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[9px] font-black text-violet-300">
                        {stepIndex + 1}
                      </span>
                      <p className="text-[11px] leading-relaxed text-muted">{step}</p>
                    </div>
                  ))}
                  <div className="flex items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-500/[0.06] p-2.5">
                    <Sparkles size={13} className="mt-0.5 shrink-0 text-amber-300" />
                    <p className="text-[10px] leading-relaxed text-amber-100/70">{guide.tip}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => navigate(guide.slug)}
                    icon={<Gamepad2 size={13} />}
                  >
                    Перейти в игру
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Прогресс и награды" subtitle="Как устроена мотивация" />
        <div className="grid grid-cols-2 gap-2.5">
          <InfoTile icon={<Zap size={17} />} title="XP и уровни" text="Растут от игр, квестов и достижений. Уровень виден в профиле и рейтинге." />
          <InfoTile icon={<Coins size={17} />} title="FUN Coins" text="Внутренняя валюта для магазина косметики. Не выводится и не имеет денежной стоимости." />
          <InfoTile icon={<Trophy size={17} />} title="Достижения" text="16 наград разной редкости. Открываются автоматически при выполнении условий." />
          <InfoTile icon={<Users size={17} />} title="Друзья" text="Заявки, совместные матчи, личный чат и бонусы за приглашённых игроков." />
        </div>
      </section>

      <section>
        <SectionHeader title="Безопасность" subtitle="Что важно знать" />
        <Card className="space-y-3 p-4">
          <SecurityRow icon={<ShieldCheck size={15} />} title="Вход через Telegram" text="Сервер проверяет подпись initData. Данные клиента не считаются доверенными." />
          <SecurityRow icon={<Lock size={15} />} title="Права ролей" text="USER, MODERATOR и ADMIN проверяются на backend, а не только в интерфейсе." />
          <SecurityRow icon={<MessageCircle size={15} />} title="Приватность" text="Можно скрыть друзей и активность, ограничить сообщения и игровые приглашения." />
          <SecurityRow icon={<ImageIcon size={15} />} title="Медиа" text="Загружаются только JPEG, PNG, WebP и GIF до 8 МБ. Исполняемые файлы запрещены." />
        </Card>
      </section>

      <section>
        <SectionHeader title="Частые вопросы" subtitle="Коротко о главном" action={<HelpCircle size={16} className="text-muted" />} />
        <Card className="overflow-hidden">
          {faq.map((item, index) => {
            const open = openFaq === index;
            return (
              <div key={item.q} className={cn(index !== faq.length - 1 && 'border-b border-line/60')}>
                <button
                  type="button"
                  onClick={() => {
                    haptic('selection');
                    setOpenFaq(open ? null : index);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  aria-expanded={open}
                >
                  <span className="flex-1 text-[12px] font-semibold text-primary">{item.q}</span>
                  <ChevronDown size={16} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-[11px] leading-relaxed text-muted">{item.a}</p>
                </motion.div>
              </div>
            );
          })}
        </Card>
      </section>

      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-8 -top-10 text-[100px] opacity-[0.06]">🎁</div>
        <div className="relative">
          <h3 className="font-display text-lg font-semibold">Пригласите друга</h3>
          <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted">
            За приглашённого друга вы получите бонусные FUN Coins и XP, а друг — стартовый баланс.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate('/friends')} icon={<Users size={14} />}>
              Пригласить друга
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('/games')}
              icon={<ChevronRight size={14} />}
            >
              К играм
            </Button>
          </div>
        </div>
      </Card>

      <div className="rounded-2xl border border-line bg-surface/50 p-4 text-center">
        <p className="text-[10px] font-semibold text-primary">FUNBOX · версия 1.0.0</p>
        <p className="mt-1 text-[9px] leading-relaxed text-muted">
          Telegram Mini App и бот. FUN Coins — виртуальная игровая валюта без денежной стоимости.
        </p>
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-300 hover:text-violet-200"
        >
          Открыть Telegram-бота <ChevronRight size={11} />
        </a>
      </div>
    </div>
  );
}

function QuickStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-surface/60 py-3">
      <span className="text-violet-300">{icon}</span>
      <span className="mt-1 text-sm font-bold text-primary">{value}</span>
      <span className="text-[9px] text-muted">{label}</span>
    </div>
  );
}

function InfoTile({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card className="p-3.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
        {icon}
      </span>
      <h3 className="mt-2.5 text-[11px] font-bold text-primary">{title}</h3>
      <p className="mt-1 text-[9px] leading-relaxed text-muted">{text}</p>
    </Card>
  );
}

function SecurityRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
        {icon}
      </span>
      <div>
        <p className="text-[11px] font-semibold text-primary">{title}</p>
        <p className="mt-0.5 text-[9px] leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}
