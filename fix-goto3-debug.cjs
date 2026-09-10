const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r/g, '');
const lines = content.split('\n');

// === Find and extract GotoDialog ===
let fnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('function GotoDialog({')) { fnIdx = i; break; }
}
if (fnIdx < 0) { console.error('GotoDialog not found'); process.exit(1); }

let depth = 0;
let fnEnd = -1;
for (let i = fnIdx; i < lines.length; i++) {
 const opens = (lines[i].match(/\{/g) || []).length;
 const closes = (lines[i].match(/\}/g) || []).length;
 depth += opens - closes;
 if (i > fnIdx && depth === 0) { fnEnd = i; break; }
}
if (fnEnd < 0) { console.error('GotoDialog end not found'); process.exit(1); }

const gotoBlock = lines.slice(fnIdx, fnEnd + 1);
lines.splice(fnIdx, fnEnd - fnIdx + 1);

// === Find StudioChart's closing `}` — the LAST line that is just `}` ===
let scCloseIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].match(/^\}\s*$/)) {
 scCloseIdx = i;
 }
}
console.log('StudioChart closing brace at line:', scCloseIdx + 1);
console.log('Content:', JSON.stringify(lines[scCloseIdx]));
console.log('Context:', JSON.stringify(lines[scCloseIdx - 1]));

// Insert GotoDialog AFTER StudioChart's closing brace
lines.splice(scCloseIdx + 1, 0, ...gotoBlock);

// === FIX 2: Revert span to use visibleRange ===
let handleIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('const handleGo = () => {')) { handleIdx = i; break; }
}
for (let i = handleIdx; i < handleIdx + 10; i++) {
 if (lines[i].includes('const span = candles.length > 1')) {
 lines[i] = lines[i].replace(
 'const span = candles.length > 1 ? candles[candles.length - 1].time - candles[0].time : 0;',
 'const span = visibleRange ? visibleRange.to - visibleRange.from : 0;'
 );
 break;
 }
}

// === FIX 3: Fix semicolon in props type ===
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('onGo: (fromMs: number, toMs: number) => void;')) {
 lines[i] = lines[i].replace('void;', 'void,');
 break;
 }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
