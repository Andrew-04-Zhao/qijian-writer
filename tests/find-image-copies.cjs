const fs = require('fs');
const path = require('path');

const libraryRoot = process.argv[2];
const searchRoots = process.argv.slice(3);
const text = fs.readFileSync(path.join(libraryRoot, 'library.json'), 'utf8');
const keys = new Set([...text.matchAll(/[0-9a-f-]{36}\.([0-9a-f]{32}\.(?:jpe?g|png|gif|webp))/gi)].map((match) => match[1].toLowerCase()));
const stems = [...keys].map((key) => key.slice(0, key.indexOf('.')));
const found = [];

function visit(directory) {
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      const key = [...keys].find((candidate) => lower.endsWith(candidate)) || stems.find((candidate) => lower.includes(candidate));
      if (key) found.push({ key, target });
    }
  }
}

searchRoots.forEach(visit);
console.log(JSON.stringify({ searched: searchRoots, keys: keys.size, found }, null, 2));
