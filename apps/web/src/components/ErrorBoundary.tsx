import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[FUNBOX] UI error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[26px] border border-rose-500/20 bg-rose-500/10 text-4xl">
            🛠️
          </div>
          <h1 className="mt-5 font-display text-xl font-semibold text-primary">Что-то сломалось</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Интерфейс столкнулся с неожиданной ошибкой. Перезагрузите приложение — данные и награды сохранены на сервере.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 text-sm font-semibold text-white"
          >
            Перезагрузить
          </button>
          <a href="/" className="mt-3 text-xs font-semibold text-muted hover:text-primary">
            На главную
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
