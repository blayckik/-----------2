import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Coins,
  Gift,
  History,
  ShoppingBag,
  Sparkles,
  Star,
  Wallet,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import {
  cn,
  formatDate,
  formatNumber,
  rarityColor,
  rarityLabel,
  transactionIcon,
} from '../lib/utils';
import type { ShopItem, WalletData } from '../types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageSkeleton,
  Tabs,
} from '../components/ui';

type Tab = 'overview' | 'shop' | 'history';

export function WalletPage() {
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => (await api.get('/wallet')).data.data as WalletData,
  });
  const { data: shop } = useQuery({
    queryKey: ['shop'],
    queryFn: async () => (await api.get('/wallet/shop')).data.data as ShopItem[],
  });
  const { data: cases } = useQuery({
    queryKey: ['cases'],
    queryFn: async () =>
      (await api.get('/wallet/cases')).data.data as Array<{
        code: string;
        name: string;
        description: string;
        price: number;
        icon: string;
        accent: string;
      }>,
  });

  const openCase = useMutation({
    mutationFn: async (code: string) => (await api.post(`/wallet/cases/${code}/open`)).data.data,
    onSuccess: (result) => {
      haptic('success');
      const reward = result.reward;
      toast.success(
        reward.item
          ? `Выпал предмет: ${reward.item.icon} ${reward.item.name}`
          : reward.coins > 0
            ? `Выпало +${reward.coins} FUN Coins`
            : `Выпало +${reward.xp} XP`,
      );
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['shop'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      void refreshMe();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const claimDaily = useMutation({
    mutationFn: async () => (await api.post('/wallet/daily')).data.data,
    onSuccess: (result) => {
      haptic('success');
      toast.success(`+${result.xp} XP и +${result.coins} FUN Coins зачислены!`);
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void refreshMe();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const buy = useMutation({
    mutationFn: async (item: ShopItem) => (await api.post(`/wallet/shop/${item.id}/buy`)).data.data,
    onSuccess: (result) => {
      haptic('success');
      toast.success(`${result.item.name} — покупка оформлена!`);
      setSelectedItem(null);
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['shop'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      void refreshMe();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (isLoading || !data) {
    return (
      <div className="px-4 pt-3">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">FUN Wallet</p>
          <h1 className="font-display text-xl font-semibold">Кошелёк</h1>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-amber-300/15 bg-gradient-to-br from-[#3a2a08] via-[#241a16] to-[#0d0b13] p-5 shadow-[0_24px_70px_-30px_rgba(245,158,11,.35)]">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-amber-500/25 blur-[70px]" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-orange-500/10 blur-[60px]" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-100/60">
              <Wallet size={13} /> Баланс
            </span>
            <Badge tone="amber">virtual</Badge>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-500 text-xl font-black text-amber-950 shadow-[0_0_30px_rgba(251,191,36,.35)]">
              F
            </span>
            <div>
              <p className="font-display text-4xl font-semibold tracking-tight text-white">
                {formatNumber(data.balance)}
              </p>
              <p className="text-[10px] font-medium text-amber-100/50">FUN Coins</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <WalletStat label="Получено" value={data.wallet?.totalEarned ?? 0} positive />
            <WalletStat label="Потрачено" value={data.wallet?.totalSpent ?? 0} />
            <WalletStat label="Уровень" value={data.level} />
          </div>
        </div>
      </div>

      <Card className="flex items-center gap-3 p-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-orange-500/10 text-xl">
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-primary">
            {data.daily.available ? 'Ежедневная награда доступна' : `Серия ${data.daily.day} дней`}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            {data.daily.available
              ? `+${data.daily.potential.xp} XP и +${data.daily.potential.coins} FUN сегодня`
              : 'Возвращайтесь завтра — награда растёт'}
          </p>
        </div>
        {data.daily.available ? (
          <Button size="sm" loading={claimDaily.isPending} onClick={() => claimDaily.mutate()}>
            Забрать
          </Button>
        ) : (
          <Check size={18} className="text-emerald-400" />
        )}
      </Card>

      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          haptic('selection');
        }}
        options={[
          { value: 'overview', label: 'Обзор', icon: <Wallet size={12} /> },
          { value: 'shop', label: 'Магазин', icon: <ShoppingBag size={12} /> },
          { value: 'history', label: 'История', icon: <History size={12} /> },
        ]}
      />

      {tab === 'overview' && (
        <>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold text-primary">Коллекция</h2>
              <span className="text-[10px] text-muted">{data.purchases.length} предметов</span>
            </div>
            {data.purchases.length === 0 ? (
              <Card className="p-2">
                <EmptyState
                  icon="🛍️"
                  title="Коллекция пуста"
                  text="Загляните в магазин — там акценты профиля, титулы и стикеры."
                  className="py-8"
                  action={<Button size="sm" onClick={() => setTab('shop')}>В магазин</Button>}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {data.purchases.map((purchase) => (
                  <Card key={purchase.id} className="flex flex-col items-center p-3 text-center">
                    <span className="text-2xl">{purchase.item.icon}</span>
                    <p className="mt-1.5 line-clamp-2 text-[10px] font-bold leading-tight text-primary">{purchase.item.name}</p>
                    <span className="mt-1 text-[8px] uppercase tracking-wide" style={{ color: rarityColor[purchase.item.rarity] }}>
                      {rarityLabel[purchase.item.rarity]}
                    </span>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold text-primary">Последние операции</h2>
              <button type="button" onClick={() => setTab('history')} className="text-[10px] font-semibold text-violet-300">
                Вся история
              </button>
            </div>
            <Card className="divide-y divide-line/60 overflow-hidden">
              {data.transactions.slice(0, 5).map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
              {data.transactions.length === 0 && (
                <div className="px-4 py-8 text-center text-[11px] text-muted">Операций пока нет</div>
              )}
            </Card>
          </section>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-primary">
              <Sparkles size={14} className="text-amber-300" /> Что такое FUN Coins?
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Это внутренняя игровая валюта FUNBOX. Её нельзя купить за реальные деньги, обменять или вывести.
              Монеты начисляются за игры, задания, достижения и ежедневные бонусы.
            </p>
          </Card>
        </>
      )}

      {tab === 'shop' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-primary">Магазин FUNBOX</p>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300">
              <Coins size={11} /> {formatNumber(data.balance)}
            </span>
          </div>
          {cases && cases.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-primary">Кейсы FUN</p>
              <div className="grid grid-cols-2 gap-2">
                {cases.map((entry) => (
                  <Card key={entry.code} className="relative overflow-hidden p-3">
                    <div className="absolute -right-5 -top-6 h-20 w-20 rounded-full blur-2xl" style={{ background: `${entry.accent}35` }} />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{entry.icon}</span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300">
                          <Coins size={10} /> {entry.price}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] font-bold">{entry.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[9px] text-muted">{entry.description}</p>
                      <Button
                        size="sm"
                        className="mt-2"
                        fullWidth
                        loading={openCase.isPending}
                        disabled={data.balance < entry.price}
                        onClick={() => openCase.mutate(entry.code)}
                      >
                        Открыть
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {shop?.map((item) => (
              <Card key={item.id} className={cn('relative overflow-hidden p-4', item.owned && 'opacity-65')}>
                <div
                  className="absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl"
                  style={{ background: `${rarityColor[item.rarity]}25` }}
                />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border text-xl"
                      style={{ background: `${rarityColor[item.rarity]}18`, borderColor: `${rarityColor[item.rarity]}35` }}
                    >
                      {item.icon}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                      style={{ background: `${rarityColor[item.rarity]}18`, color: rarityColor[item.rarity] }}
                    >
                      {item.rarity === 'LEGENDARY' ? 'EXCLUSIVE' : rarityLabel[item.rarity]}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xs font-bold text-primary">{item.name}</h3>
                  <p className="mt-0.5 line-clamp-2 min-h-[26px] text-[9px] leading-relaxed text-muted">{item.description}</p>
                  <button
                    type="button"
                    disabled={item.owned}
                    onClick={() => setSelectedItem(item)}
                    className={cn(
                      'mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-[10px] font-bold transition',
                      item.owned
                        ? 'bg-white/[0.05] text-muted'
                        : 'bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 shadow-lg active:scale-95',
                    )}
                  >
                    {item.owned ? <><Check size={12} /> Куплено</> : <><Coins size={12} /> {formatNumber(item.price)}</>}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-primary">История транзакций</p>
            <span className="text-[10px] text-muted">Последние {data.transactions.length}</span>
          </div>
          <Card className="divide-y divide-line/60 overflow-hidden">
            {data.transactions.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11px] text-muted">Операций пока нет</div>
            ) : (
              data.transactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} showDate />
              ))
            )}
          </Card>
        </section>
      )}

      <Modal open={Boolean(selectedItem)} onClose={() => setSelectedItem(null)} title="Подтверждение покупки">
        {selectedItem && (
          <div className="space-y-4 pb-2">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] p-3">
              <span className="text-3xl">{selectedItem.icon}</span>
              <div>
                <p className="text-sm font-bold text-primary">{selectedItem.name}</p>
                <p className="text-[10px] text-muted">{selectedItem.description}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 text-xs">
              <span className="text-muted">Стоимость</span>
              <span className="flex items-center gap-1 font-bold text-amber-300">
                <Coins size={13} /> {formatNumber(selectedItem.price)} FUN
              </span>
            </div>
            <div className="flex items-center justify-between px-1 text-[10px] text-muted">
              <span>После покупки</span>
              <span className={cn(data.balance < selectedItem.price && 'text-rose-400')}>
                {formatNumber(data.balance - selectedItem.price)} FUN
              </span>
            </div>
            {data.balance < selectedItem.price && (
              <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300">
                Недостаточно FUN Coins. Выполняйте задания и играйте, чтобы заработать ещё.
              </p>
            )}
            <Button
              fullWidth
              loading={buy.isPending}
              disabled={data.balance < selectedItem.price}
              onClick={() => buy.mutate(selectedItem)}
              icon={<ShoppingBag size={15} />}
            >
              Купить
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function WalletStat({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/15 px-2 py-2 text-center backdrop-blur">
      <p className={cn('font-display text-sm font-semibold', positive ? 'text-emerald-300' : 'text-white')}>
        {formatNumber(value)}
      </p>
      <p className="mt-0.5 text-[8px] uppercase tracking-wide text-amber-100/40">{label}</p>
    </div>
  );
}

function TransactionRow({
  transaction,
  showDate,
}: {
  transaction: WalletData['transactions'][number];
  showDate?: boolean;
}) {
  const positive = transaction.amount > 0;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-base">
        {transactionIcon[transaction.type] ?? '💠'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-primary">{transaction.description}</p>
        <p className="text-[9px] text-muted">
          {showDate ? formatDate(transaction.createdAt) : transaction.type.toLowerCase()}
        </p>
      </div>
      <span className={cn('flex items-center gap-0.5 text-xs font-bold', positive ? 'text-emerald-300' : 'text-rose-300')}>
        {positive ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
        {positive ? '+' : ''}
        {formatNumber(transaction.amount)}
      </span>
    </div>
  );
}
