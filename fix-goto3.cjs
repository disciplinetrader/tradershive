const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r/g, '');
const lines = content.split('\n');
const S = (n) => Array(n + 1).join(' ');

// === FIX 1: Move GotoDialog out to module scope ===
// Find GotoDialog declaration
let fnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('function GotoDialog({')) { fnIdx = i; break; }
}
if (fnIdx < 0) { console.error('GotoDialog not found'); process.exit(1); }

// Find end of GotoDialog function: balance braces
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
const gotoStartLine = fnIdx + 1; // 1-based
const gotoEndLine = fnEnd + 1;

// Remove GotoDialog from its current (inner) location
lines.splice(fnIdx, fnEnd - fnIdx + 1);

// Find tzList declaration (module scope, after StudioChart closing brace)
let tzIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('const tzList = [')) { tzIdx = i; break; }
}
if (tzIdx < 0) { console.error('tzList not found'); process.exit(1); }

// Insert GotoDialog before tzList (still module scope, just before tzList)
lines.splice(tzIdx, 0, ...gotoBlock);

// === FIX 2: Revert span to use visibleRange ===
let handleIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('const handleGo = () => {')) { handleIdx = i; break; }
}
if (handleIdx < 0) { console.error('handleGo not found'); process.exit(1); }

for (let i = handleIdx; i < handleIdx + 10; i++) {
 if (lines[i].includes('const span = candles.length > 1')) {
 lines[i] = lines[i].replace(
 'const span = candles.length > 1 ? candles[candles.length - 1].time - candles[0].time : 0;',
 'const span = visibleRange ? visibleRange.to - visibleRange.from : 0;'
 );
 break;
 }
}

// === FIX 3: Fix the semicolon in props type ===
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('onGo: (fromMs: number, toMs: number) => void;')) {
 lines[i] = lines[i].replace('void;', 'void,');
 break;
 }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
