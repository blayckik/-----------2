import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('apps/web/public/images/guess/manifest.json', 'utf8'));
let out = `# Guess the Image — image credits

All photos are sourced from Wikimedia Commons and used under the licenses below.
Attribution is provided for CC-licensed works. Public-domain images are marked accordingly.

| File | Subject | Author | License | Source |
|---|---|---|---|---|
`;
for (const value of Object.values(manifest)) {
  const artist = String(value.artist || 'Wikimedia Commons').replace(/\|/g, '/');
  out += `| ${value.file} | ${value.subject} | ${artist} | ${value.license} | [Commons](${value.descriptionUrl}) |\n`;
}
fs.writeFileSync('apps/web/public/images/guess/CREDITS.md', out);
console.log(`Credits written for ${Object.keys(manifest).length} images`);
