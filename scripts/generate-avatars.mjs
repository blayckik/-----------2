import fs from 'node:fs/promises';
import path from 'node:path';

const users = [
  ['funbox_admin', '#8b5cf6', '#4c1d95', '#f2c7a5', '#211a1a', 0, true],
  ['nova_fun', '#a855f7', '#312e81', '#f6d0b3', '#2a1b2e', 1, false],
  ['max_play', '#22d3ee', '#0e7490', '#d9a47e', '#191919', 2, false],
  ['eva_quiz', '#ec4899', '#831843', '#f1c3a4', '#5b2a1e', 3, false],
  ['leo_words', '#f59e0b', '#92400e', '#c98a63', '#171717', 0, true],
  ['kira_moon', '#818cf8', '#3730a3', '#f3c9ab', '#2c1b2e', 1, false],
  ['tim_arcade', '#34d399', '#047857', '#e6b18a', '#20140f', 2, false],
  ['mira_light', '#f472b6', '#9d174d', '#f7d6bd', '#6b3a2a', 3, false],
  ['dan_storm', '#fb7185', '#9f1239', '#d79b73', '#1a1a1a', 0, false],
  ['luna_play', '#c084fc', '#6b21a8', '#eec3a4', '#3a2145', 1, true],
  ['sasha_vibe', '#fbbf24', '#b45309', '#f5ceb4', '#7a4a21', 3, false],
  ['ivan_quest', '#60a5fa', '#1d4ed8', '#dda67e', '#241a13', 2, false],
];

const hairPaths = [
  // short crop
  (hair) => `<path d="M79 103c0-38 21-58 50-58 31 0 49 22 49 58 0 5-2 10-4 13-3-19-12-29-27-34-13 13-38 16-55 11-1 14-6 21-9 23-2-3-4-8-4-13Z" fill="${hair}"/>`,
  // bob
  (hair) => `<path d="M73 128c-4-48 18-83 57-83 39 0 59 34 55 82-1 12-6 20-12 24l-7-51c-15 6-39 8-62 1l-8 50c-8-4-12-13-12-23Z" fill="${hair}"/><path d="M77 120c-7 1-13-6-12-14 2-9 8-12 14-10l-2 24Zm104 0c7 1 13-6 12-14-2-9-8-12-14-10l2 24Z" fill="${hair}"/>`,
  // curly
  (hair) => `<path d="M82 100c-8-11-5-26 3-33-2-15 10-28 22-26 5-17 27-20 36-7 17-8 35 4 35 20 13 7 16 23 7 33 7 12-3 27-15 30-8 15-31 17-43 6-14 9-33 3-37-9-4-1-6-7-8-14Z" fill="${hair}"/>`,
  // long
  (hair) => `<path d="M71 171c-8-58 6-123 57-123s65 65 57 123l-15 2 4-91c-12 7-31 10-46 9-16 1-34-2-46-9l4 91-15-2Z" fill="${hair}"/>`,
];

const clothesColors = ['#1f2937', '#111827', '#312e81', '#3f1f2a', '#0f3b3a', '#422006'];

for (const [index, [name, accent, accentDark, skin, hairColor, hairVariant, glasses]] of users.entries()) {
  const clothes = clothesColors[index % clothesColors.length];
  const hair = hairPaths[Number(hairVariant)](hairColor);
  const glassesSvg = glasses
    ? `<g fill="none" stroke="#f8fafc" stroke-opacity=".75" stroke-width="2.5"><rect x="98" y="102" width="25" height="18" rx="7"/><rect x="132" y="102" width="25" height="18" rx="7"/><path d="M123 109h9M98 109l-11-4M157 109l11-4"/></g>`
    : '';
  const earrings =
    index % 3 === 2
      ? `<circle cx="80" cy="128" r="3" fill="${accent}"/><circle cx="175" cy="128" r="3" fill="${accent}"/>`
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accentDark}"/>
    </linearGradient>
    <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${clothes}"/>
      <stop offset="100%" stop-color="#08080f"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="20%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".28"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <rect width="256" height="256" fill="url(#glow)"/>
  <circle cx="218" cy="45" r="46" fill="#ffffff" opacity=".07"/>
  <circle cx="34" cy="214" r="58" fill="#000000" opacity=".12"/>
  <path d="M34 256c0-51 33-80 94-80s94 29 94 80H34Z" fill="url(#shirt)"/>
  <path d="M110 163h36l7 26-25 18-25-18 7-26Z" fill="${skin}"/>
  <path d="M112 180c9 9 23 9 32 0l-3 15-13 9-13-9-3-15Z" fill="#ffffff" opacity=".12"/>
  <path d="M128 212l-14-13 14-7 14 7-14 13Z" fill="${accent}" opacity=".75"/>
  <ellipse cx="128" cy="118" rx="47" ry="55" fill="${skin}"/>
  <path d="M81 118c0-4 1-8 2-11 2 6 5 9 8 11l-2 17-6-5-2-12Zm94 0c0-4-1-8-2-11-2 6-5 9-8 11l2 17 6-5 2-12Z" fill="${skin}" opacity=".85"/>
  ${hair}
  <ellipse cx="110" cy="116" rx="4.2" ry="5.2" fill="#20161c"/>
  <ellipse cx="146" cy="116" rx="4.2" ry="5.2" fill="#20161c"/>
  <circle cx="111.5" cy="114.5" r="1.3" fill="#ffffff" opacity=".8"/>
  <circle cx="147.5" cy="114.5" r="1.3" fill="#ffffff" opacity=".8"/>
  <path d="M121 133c4 3 10 3 14 0" fill="none" stroke="#7c3f32" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  <path d="M117 148c7 5 15 5 22 0" fill="none" stroke="#5b2b2b" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M112 102c5-3 11-3 15 0M134 102c5-3 11-3 15 0" fill="none" stroke="${hairColor}" stroke-width="3.2" stroke-linecap="round"/>
  ${glassesSvg}
  ${earrings}
  <path d="M100 164c7 7 17 11 28 11s21-4 28-11" fill="none" stroke="#000000" stroke-opacity=".15" stroke-width="3"/>
</svg>`;

  const dir = path.resolve('apps/web/public/avatars');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.svg`), svg);
}

console.log(`Generated ${users.length} local avatars`);
