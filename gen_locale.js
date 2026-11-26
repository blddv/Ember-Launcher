// Генератор локалей: reads переводов JSON (key -> value), writes UMD-файл в порядке ru.js.
const fs = require('fs');
const path = require('path');

const lang = process.argv[2];
const comment = process.argv[3];
const srcPath = process.argv[4];
const outPath = process.argv[5];

const ru = require('/home/user/Ember-Launcher/renderer/locales/ru.js');
const ruKeys = Object.keys(ru);
const dict = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

const missing = [];
const lines = [];
for (const k of ruKeys) {
  let v = dict[k];
  if (v === undefined) {
    missing.push(k);
    v = ru[k]; // fallback
  }
  lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
}

const header = `// ${comment}\n// UMD: file works in browser (renderer) and in Node (main process).\n(function (root, factory) {\n  const dict = factory();\n  if (typeof module === "object" && module.exports) module.exports = dict;\n  else (root.EMB_LOCALES = root.EMB_LOCALES || {}).${lang} = dict;\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  return {\n`;
const tail = `  };\n});\n`;
fs.writeFileSync(outPath, header + lines.join('\n') + tail);
if (missing.length) {
  console.log('MISSING (used Russian fallback):');
  for (const m of missing) console.log('  ' + m);
}
console.log('written', outPath, 'keys:', lines.length);
