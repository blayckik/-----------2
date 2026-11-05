import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken, socketBaseUrl } from '../lib/api';
import { useAuth } from './AuthContext';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  emitAck: <T = unknown>(event: string, payload: unknown, timeoutMs?: number) => Promise<T>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!me || !getToken()) return;
    const instance = io(socketBaseUrl(), {
      path: '/socket.io',
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
    });
    socketRef.current = instance;
    setSocket(instance);

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('connect_error', () => setConnected(false));

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [me?.id]);

  const emitAck = useMemo(
    () =>
      <T,>(event: string, payload: unknown, timeoutMs = 12000): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
          const active = socketRef.current;
          if (!active?.connected) {
            reject(new Error('Нет соединения с игровым сервером'));
            return;
          }
          let settled = false;
          const timer = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error('Сервер не ответил. Попробуйте ещё раз.'));
            }
          }, timeoutMs);
          active.emit(event, payload, (response: T & { error?: string }) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            if (response && typeof response === 'object' && 'error' in response && response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          });
        });
      },
    [],
  );

  const value = useMemo(() => ({ socket, connected, emitAck }), [socket, connected, emitAck]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
}
