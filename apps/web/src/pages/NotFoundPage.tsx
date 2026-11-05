import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <Card className="w-full max-w-sm overflow-hidden p-8 text-center">
        <div className="relative mx-auto mb-4 w-fit">
          <div className="absolute inset-0 rounded-full bg-violet-500/30 blur-2xl" />
          <div className="relative font-display text-6xl font-bold text-gradient">404</div>
        </div>
        <h1 className="font-display text-lg font-semibold text-primary">Страница потерялась</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Возможно, ссылка устарела или страница переехала. Вернитесь на главную — там всё на месте.
        </p>
        <Link to="/" className="mt-5 block">
          <Button fullWidth>На главную</Button>
        </Link>
      </Card>
    </div>
  );
}
