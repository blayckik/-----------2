import { io } from 'socket.io-client';
import { createRequire } from 'node:module';
import path from 'node:path';

const BASE = process.env.API_URL || 'http://localhost:4000';
const API = `${BASE}/api`;
const results = [];
const failures = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push({ name, detail });
}

async function requireOk(name, promise, expected = 200) {
  try {
    const response = await promise;
    const body = await response.json().catch(() => ({}));
    if (response.status !== expected) {
      record(name, false, `HTTP ${response.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 160)}`);
      return null;
    }
    record(name, true);
    return body.data;
  } catch (error) {
    record(name, false, error.message);
    return null;
  }
}

async function request(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  return fetch(`${API}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function login(telegramId) {
  const data = await requireOk(
    `auth dev ${telegramId}`,
    request('/auth/dev', { method: 'POST', body: { telegramId } }),
  );
  return data?.token;
}

function emitAck(socket, event, payload, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event}: timeout`)), timeout);
    socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      auth: { token },
      transports: ['websocket'],
      timeout: 10000,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const require = createRequire(path.resolve('apps/api/package.json'));
const russianWords = require('russian-words');

function canBuild(word, letters) {
  const pool = [...letters];
  for (const char of word) {
    const index = pool.indexOf(char);
    if (index === -1) return false;
    pool.splice(index, 1);
  }
  return true;
}

async function main() {
  console.log('\n── Health ──');
  const health = await requireOk('health check', request('/health'));
  record('database connected', health?.database === true);

  const nova = await login('900000001');
  const max = await login('900000002');
  const admin = await login('900000000');
  record('tokens received', Boolean(nova && max && admin));

  const noAuth = await request('/dashboard');
  record('dashboard requires auth', noAuth.status === 401, `HTTP ${noAuth.status}`);
  const forbidden = await request('/admin/stats', { token: nova });
  record('admin blocks regular user', forbidden.status === 403, `HTTP ${forbidden.status}`);

  console.log('\n── Dashboard / daily / quests ──');
  const dashboard = await requireOk('dashboard', request('/dashboard', { token: nova }));
  record('dashboard has quests', (dashboard?.dailyQuests?.length ?? 0) > 0);
  record('dashboard has games', (dashboard?.popularGames?.length ?? 0) === 4);

  const daily1 = await requireOk('daily reward claim', request('/wallet/daily', { method: 'POST', token: nova }));
  record('daily reward granted', daily1?.claimed === true, `+${daily1?.coins} coins`);
  const daily2 = await requireOk('daily second claim handled', request('/wallet/daily', { method: 'POST', token: nova }));
  record('daily cannot be claimed twice', daily2?.claimed === false);

  const quests = await requireOk('quests list', request('/quests', { token: nova }));
  const claimable = quests?.daily?.find((quest) => quest.completedAt && !quest.claimedAt);
  if (claimable) {
    const claimed = await requireOk('quest reward claim', request(`/quests/${claimable.id}/claim`, { method: 'POST', token: nova }));
    record('quest reward granted', claimed?.claimed === true);
    const again = await request(`/quests/${claimable.id}/claim`, { method: 'POST', token: nova });
    record('quest reward idempotent', again.status === 400, `HTTP ${again.status}`);
  } else {
    record('quest reward claim', false, 'no claimable quest');
  }

  console.log('\n── Social / friends / follow ──');
  const post = await requireOk(
    'create post',
    request('/social/posts', {
      method: 'POST',
      token: nova,
      body: { content: `Smoke test post ${Date.now()}`, imageUrl: '/images/guess/aurora.jpg' },
    }),
    201,
  );
  const postId = post?.id;
  const like = await requireOk('like post', request(`/social/posts/${postId}/like`, { method: 'POST', token: max }));
  record('like toggled on', like?.liked === true, `count ${like?.likeCount}`);
  const comment = await requireOk(
    'comment post',
    request(`/social/posts/${postId}/comments`, { method: 'POST', token: max, body: { content: 'Smoke comment' } }),
    201,
  );
  record('comment created', Boolean(comment?.id));
  const repost = await requireOk(
    'repost',
    request(`/social/posts/${postId}/repost`, { method: 'POST', token: max, body: {} }),
    201,
  );
  record('repost created', postId && repost?.repostOfId === postId);

  const feed = await requireOk('social feed', request('/social/feed?tab=latest', { token: nova }));
  record('feed returns post', Boolean(feed?.posts?.some((item) => item.id === postId)));

  const search = await requireOk('user search', request('/friends/search?q=max', { token: nova }));
  const maxCard = search?.find((item) => item.username === 'max_play');
  if (maxCard) {
    const followResult = await requireOk(
      'follow max',
      request(`/social/users/${maxCard.id}/follow`, { method: 'POST', token: nova }),
    );
    record('follow state', followResult?.following === true);
    const unfollow = await requireOk(
      'unfollow max',
      request(`/social/users/${maxCard.id}/follow`, { method: 'DELETE', token: nova }),
    );
    record('unfollow state', unfollow?.following === false);
  }

  const requests = await requireOk('friend requests list', request('/friends/requests', { token: nova }));
  if (requests?.incoming?.length) {
    const requestId = requests.incoming[0].id;
    const accepted = await requireOk('accept friend request', request(`/friends/requests/${requestId}/accept`, { method: 'POST', token: nova }));
    record('friendship created', accepted?.accepted === true);
  } else {
    record('accept friend request', false, 'no incoming request');
  }

  console.log('\n── Chat / websocket ──');
  const maxSocket = await connect(max);
  const conversations = await requireOk('conversations', request('/chat/conversations', { token: nova }));
  const conversation = conversations?.find((item) => item.participants?.some((participant) => participant.username === 'max_play'));
  if (conversation) {
    const incoming = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('chat:new timeout')), 8000);
      maxSocket.on('chat:new', (payload) => {
        if (payload.conversationId === conversation.id) {
          clearTimeout(timer);
          resolve(payload);
        }
      });
    });
    const message = await requireOk(
      'send chat message',
      request(`/chat/conversations/${conversation.id}/messages`, {
        method: 'POST',
        token: nova,
        body: { content: `Smoke message ${Date.now()}` },
      }),
      201,
    );
    record('message persisted', Boolean(message?.id));
    try {
      const event = await incoming;
      record('chat realtime delivery', event.message.id === message.id);
    } catch (error) {
      record('chat realtime delivery', false, error.message);
    }
    const read = await requireOk(
      'mark conversation read',
      request(`/chat/conversations/${conversation.id}/read`, { method: 'POST', token: max }),
    );
    record('read receipt updated', Boolean(read?.readAt));
  } else {
    record('chat conversation exists', false);
  }

  console.log('\n── Quiz multiplayer ──');
  const novaSocket = await connect(nova);
  const maxSocket2 = await connect(max);
  try {
    const created = await emitAck(novaSocket, 'quiz:create', {
      isPrivate: true,
      botCount: 0,
      questionCount: 3,
    });
    const code = created.room.code;
    record('quiz room created', Boolean(code), code);
    const joined = await emitAck(maxSocket2, 'quiz:join', { code });
    record('quiz room joined', joined.room.participants.length === 2);

    const finishedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('quiz finish timeout')), 60000);
      novaSocket.once('quiz:finished', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    let sawQuestion = false;
    novaSocket.on('quiz:question', async (question) => {
      sawQuestion = true;
      const choice = question.questionIndex % Math.max(1, question.options.length);
      await Promise.allSettled([
        emitAck(novaSocket, 'quiz:answer', { code, questionIndex: question.questionIndex, choice }),
        emitAck(maxSocket2, 'quiz:answer', { code, questionIndex: question.questionIndex, choice: (choice + 1) % question.options.length }),
      ]);
    });
    await emitAck(novaSocket, 'quiz:start', { code });
    const final = await finishedPromise;
    record('quiz questions received', sawQuestion);
    record('quiz finished with leaderboard', (final?.leaderboard?.length ?? 0) === 2);
    record('quiz rewards assigned', (final?.rewards?.length ?? 0) === 2);
    const history = await requireOk('game history after quiz', request('/games/history', { token: nova }));
    record('quiz result persisted', Boolean(history?.some((result) => result.room?.game?.slug === 'quiz-battle')));
  } catch (error) {
    record('quiz multiplayer flow', false, error.message);
  } finally {
    novaSocket.emit('quiz:leave', {});
    novaSocket.disconnect();
    maxSocket2.disconnect();
  }

  console.log('\n── Word Duel ──');
  const duelNova = await connect(nova);
  const duelMax = await connect(max);
  try {
    const created = await emitAck(duelNova, 'duel:create', { withBot: false, isPrivate: true });
    record('duel room created', Boolean(created.room.code));
    await emitAck(duelMax, 'duel:join', { code: created.room.code });
    const startedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('duel start timeout')), 10000);
      duelNova.once('duel:started', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    await emitAck(duelNova, 'duel:start', { code: created.room.code });
    const state = await startedPromise;
    const letters = state.letters;
    const candidate = russianWords
      .map((word) => word.toLowerCase().replace(/ё/g, 'е'))
      .find((word) => word.length >= 3 && word.length <= 7 && canBuild(word, letters));
    record('duel started with letters', letters.length === 16);
    if (candidate) {
      const submitted = await emitAck(duelNova, 'duel:submit', { code: created.room.code, word: candidate });
      record('duel word accepted', submitted.accepted === true, `${candidate} +${submitted.points}`);
    } else {
      record('duel word accepted', false, 'no constructible dictionary word');
    }
  } catch (error) {
    record('duel multiplayer flow', false, error.message);
  } finally {
    duelNova.disconnect();
    duelMax.disconnect();
  }

  console.log('\n── WYR / Guess Image ──');
  const wyr = await requireOk('wyr questions', request('/games/wyr/questions?count=5&fresh=true', { token: nova }));
  if (wyr?.length) {
    const first = wyr[0];
    const voted = await requireOk(
      'wyr vote',
      request(`/games/wyr/${first.id}/vote`, { method: 'POST', token: nova, body: { choice: 0 } }),
    );
    record('wyr vote counted', voted?.totalVotes >= 1);
    const second = await request(`/games/wyr/${first.id}/vote`, { method: 'POST', token: nova, body: { choice: 1 } });
    record('wyr duplicate blocked', second.status === 400, `HTTP ${second.status}`);
    const question = await requireOk(
      'wyr create question',
      request('/games/wyr/questions', {
        method: 'POST',
        token: nova,
        body: { optionA: 'Smoke option A', optionB: 'Smoke option B' },
      }),
      201,
    );
    record('user question on moderation', question?.isApproved === false);
  } else {
    record('wyr questions seeded', false);
  }

  const round = await requireOk('image round', request('/games/image/round', { token: nova }));
  if (round?.round) {
    let payload;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      payload = await requireOk(
        `image wrong guess ${attempt + 1}`,
        request(`/games/image/${round.round.id}/guess`, {
          method: 'POST',
          token: nova,
          body: { guess: `неверный вариант ${attempt}` },
        }),
      );
    }
    record('image attempts limited', payload?.attemptsLeft === 0);
    record('image answer revealed after attempts', Boolean(payload?.answer));
  } else {
    record('image round available', false);
  }

  console.log('\n── Admin ──');
  const stats = await requireOk('admin stats', request('/admin/stats', { token: admin }));
  record('admin stats populated', (stats?.users ?? 0) >= 10);
  const users = await requireOk('admin users', request('/admin/users?filter=all', { token: admin }));
  record('admin users list', (users?.users?.length ?? 0) > 0);
  const target = users?.users?.find((user) => user.username === 'sasha_vibe');
  if (target) {
    const banned = await requireOk(
      'admin ban user',
      request(`/admin/users/${target.id}/ban`, { method: 'POST', token: admin, body: { banned: true, reason: 'SMOKE' } }),
    );
    record('ban applied', banned?.banned === true);
    await requireOk(
      'admin unban user',
      request(`/admin/users/${target.id}/ban`, { method: 'POST', token: admin, body: { banned: false } }),
    );
    const balance = await requireOk(
      'admin balance adjust',
      request(`/admin/users/${target.id}/balance`, { method: 'POST', token: admin, body: { amount: 5, reason: 'SMOKE' } }),
    );
    record('balance changed', balance?.coins === target.coins + 5);
    await requireOk(
      'admin balance revert',
      request(`/admin/users/${target.id}/balance`, { method: 'POST', token: admin, body: { amount: -5, reason: 'SMOKE revert' } }),
    );
  }
  const categories = await requireOk('admin categories', request('/admin/categories', { token: admin }));
  record('categories available', (categories?.length ?? 0) > 5);
  const questions = await requireOk('admin questions', request('/admin/questions', { token: admin }));
  record('questions available', (questions?.questions?.length ?? 0) > 0);
  const adminReports = await requireOk('admin reports', request('/admin/reports?status=PENDING', { token: admin }));
  record('reports endpoint', Array.isArray(adminReports?.reports));
  const transactions = await requireOk('admin transactions', request('/admin/transactions', { token: admin }));
  record('transactions visible', (transactions?.transactions?.length ?? 0) > 0);

  console.log('\n── Bot API ──');
  const botHeaders = { 'x-bot-secret': 'funbox-local-bot-secret' };
  const botProfile = await requireOk(
    'bot profile',
    fetch(`${API}/bot/user/900000001`, { headers: botHeaders }),
  );
  record('bot profile stats', (botProfile?.stats?.gamesPlayed ?? 0) > 0);
  const botGames = await requireOk('bot games', fetch(`${API}/bot/games`, { headers: botHeaders }));
  record('bot games list', botGames?.length === 4);
  const botLeaderboard = await requireOk('bot leaderboard', fetch(`${API}/bot/leaderboard`, { headers: botHeaders }));
  record('bot leaderboard', botLeaderboard?.length === 5);
  const botSettings = await requireOk('bot settings', fetch(`${API}/bot/settings/900000001`, { headers: botHeaders }));
  record('bot settings available', botSettings?.notifyDaily === true);
  const botUnauthorized = await fetch(`${API}/bot/games`);
  record('bot secret enforced', botUnauthorized.status === 401, `HTTP ${botUnauthorized.status}`);

  console.log('\n── Security ──');
  const invalidInit = await request('/auth/telegram', {
    method: 'POST',
    body: { initData: 'user=%7B%22id%22%3A1%7D&hash=deadbeef' },
  });
  record('invalid Telegram initData rejected', [401, 503].includes(invalidInit.status), `HTTP ${invalidInit.status}`);

  maxSocket.disconnect();

  console.log('\n════════════════════════════════');
  console.log(`Passed: ${results.filter((item) => item.ok).length}/${results.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(` - ${failure.name}: ${failure.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('SMOKE CRASH', error);
  process.exit(1);
});
