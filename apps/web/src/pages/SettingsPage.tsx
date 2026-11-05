import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Info, LogOut, Moon, Shield, Smartphone, Sun, UserCog, Users } from 'lucide-react';
import { api, getErrorMessage, DEMO_MODE, BOT_USERNAME } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { haptic } from '../lib/telegram';
import { cn } from '../lib/utils';
import { Badge, Button, Card, Toggle } from '../components/ui';

type Theme = 'dark' | 'light' | 'system';

export function SettingsPage() {
  const { me, refreshMe, switchAccount } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>((me?.settings?.theme as Theme) ?? 'dark');
  const [settings, setSettings] = useState({
    notifyFriends: me?.settings?.notifyFriends ?? true,
    notifyMessages: me?.settings?.notifyMessages ?? true,
    notifyAchievements: me?.settings?.notifyAchievements ?? true,
    notifyDaily: me?.settings?.notifyDaily ?? true,
    notifyGameInvites: me?.settings?.notifyGameInvites ?? true,
    soundEnabled: me?.settings?.soundEnabled ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!me?.settings) return;
    setTheme(me.settings.theme as Theme);
    setSettings({
      notifyFriends: me.settings.notifyFriends,
      notifyMessages: me.settings.notifyMessages,
      notifyAchievements: me.settings.notifyAchievements,
      notifyDaily: me.settings.notifyDaily,
      notifyGameInvites: me.settings.notifyGameInvites,
      soundEnabled: me.settings.soundEnabled,
    });
  }, [me?.settings]);

  async function update(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      await api.patch('/me/settings', patch);
      await refreshMe();
      haptic('light');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof typeof settings) {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    void update({ [key]: next[key] });
  }

  async function changeTheme(next: Theme) {
    setTheme(next);
    haptic('selection');
    await update({ theme: next });
    document.documentElement.classList.toggle('light', next === 'light');
    document.documentElement.classList.toggle('dark', next !== 'light');
  }

  async function handleSwitch(telegramId: string) {
    setSwitching(true);
    try {
      await switchAccount(telegramId);
      toast.success('Аккаунт переключён');
      navigate('/');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-primary"
        >
          <ChevronRight size={18} className="rotate-180" />
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Preferences</p>
          <h1 className="font-display text-xl font-semibold">Настройки</h1>
        </div>
      </div>

      <Card className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Тема интерфейса</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { value: 'dark' as Theme, label: 'Тёмная', icon: Moon },
            { value: 'light' as Theme, label: 'Светлая', icon: Sun },
            { value: 'system' as Theme, label: 'Система', icon: Smartphone },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => void changeTheme(option.value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-3 transition',
                theme === option.value
                  ? 'border-violet-400/40 bg-violet-500/15 text-violet-200'
                  : 'border-line bg-white/[0.03] text-muted',
              )}
            >
              <option.icon size={19} />
              <span className="text-[10px] font-semibold">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[9px] text-muted/60">
          Telegram theme parameters применяются автоматически. Светлая тема меняет палитру приложения.
        </p>
      </Card>

      <SettingsSection title="Уведомления" description="Telegram-бот пришлёт важные события">
        <Toggle checked={settings.notifyFriends} onChange={() => toggle('notifyFriends')} label="Заявки в друзья" description="Новые заявки и принятие" />
        <Toggle checked={settings.notifyMessages} onChange={() => toggle('notifyMessages')} label="Сообщения" description="Новые личные сообщения" />
        <Toggle checked={settings.notifyAchievements} onChange={() => toggle('notifyAchievements')} label="Достижения" description="Разблокировка наград" />
        <Toggle checked={settings.notifyDaily} onChange={() => toggle('notifyDaily')} label="Ежедневные напоминания" description="Бонус дня и серия" />
        <Toggle checked={settings.notifyGameInvites} onChange={() => toggle('notifyGameInvites')} label="Приглашения в игры" description="Комнаты друзей" />
      </SettingsSection>

      <SettingsSection title="Приложение">
        <Toggle checked={settings.soundEnabled} onChange={() => toggle('soundEnabled')} label="Звуки" description="Звуковые эффекты в играх" />
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex w-full items-center justify-between py-3 text-left"
        >
          <span className="flex items-center gap-2.5">
            <UserCog size={16} className="text-muted" />
            <span>
              <span className="block text-sm font-semibold text-primary">Профиль и приватность</span>
              <span className="text-[10px] text-muted">Имя, био, скрытие друзей и активности</span>
            </span>
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/friends')}
          className="flex w-full items-center justify-between border-t border-line py-3 text-left"
        >
          <span className="flex items-center gap-2.5">
            <Users size={16} className="text-muted" />
            <span className="text-sm font-semibold text-primary">Друзья и приглашения</span>
          </span>
          <ChevronRight size={16} className="text-muted" />
        </button>
        {me?.role !== 'USER' && (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="flex w-full items-center justify-between border-t border-line py-3 text-left"
          >
            <span className="flex items-center gap-2.5">
              <Shield size={16} className="text-amber-300" />
              <span>
                <span className="block text-sm font-semibold text-primary">Админ-панель</span>
                <span className="text-[10px] text-muted">Управление платформой</span>
              </span>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        )}
      </SettingsSection>

      {DEMO_MODE && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">Demo mode</p>
              <h3 className="mt-0.5 text-sm font-bold text-primary">Переключение аккаунтов</h3>
            </div>
            <Badge tone="amber">dev</Badge>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            В production-режиме вход выполняется только через Telegram initData.
          </p>
          <div className="mt-3 space-y-2">
            {[
              { id: '900000001', name: 'Нова Соколова', role: 'Игрок · level 11' },
              { id: '900000002', name: 'Макс Волков', role: 'Игрок · Word Duel' },
              { id: '900000000', name: 'Алекс Крамер', role: 'Администратор' },
            ].map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={switching}
                onClick={() => void handleSwitch(account.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition',
                  me?.telegramId === account.id
                    ? 'border-violet-400/30 bg-violet-500/10'
                    : 'border-line bg-white/[0.03] hover:bg-white/[0.06]',
                )}
              >
                <span>
                  <span className="block text-[11px] font-semibold text-primary">{account.name}</span>
                  <span className="text-[9px] text-muted">{account.role}</span>
                </span>
                {me?.telegramId === account.id ? (
                  <Badge tone="violet">активен</Badge>
                ) : (
                  <LogOut size={14} className="text-muted" />
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted">
            <Info size={16} />
          </span>
          <div>
            <h3 className="text-xs font-bold text-primary">FUNBOX · версия 1.0.0</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              Telegram Mini App + бот. FUN Coins — виртуальная игровая валюта без денежной стоимости.
              Поддержка: @{BOT_USERNAME.replace('_bot', '_support')}
            </p>
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[10px] font-semibold text-violet-300"
            >
              Открыть Telegram-бота →
            </a>
          </div>
        </div>
      </Card>

      {saving && <p className="text-center text-[9px] text-muted">Сохраняем изменения…</p>}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="px-4">
      <div className="pt-3">
        <h2 className="text-xs font-bold text-primary">{title}</h2>
        {description && <p className="text-[10px] text-muted">{description}</p>}
      </div>
      <div className="divide-y divide-line/60">{children}</div>
    </Card>
  );
}
