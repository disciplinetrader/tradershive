const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r/g, '');
const lines = content.split('\n');
const S = (n) => Array(n + 1).join(' ');

// === BUG 1 fix: useEffect only fires on OPEN ===
// Find GotoDialog function start
let fnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('function GotoDialog({')) { fnIdx = i; break; }
}
if (fnIdx < 0) { console.error('GotoDialog not found'); process.exit(1); }

// Find the date state line (before useEffect)
let dateIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('const [date, setDate] = useState<string>("");')) { dateIdx = i; break; }
}
if (dateIdx < 0) { console.error('date state not found'); process.exit(1); }

// Add initializedRef after date state
lines[dateIdx] = lines[dateIdx] + '\n const initializedRef = useRef(false);';

// Find the useEffect inside GotoDialog
let fxIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('useEffect(() => {') && i > fnIdx) { fxIdx = i; break; }
}
if (fxIdx < 0) { console.error('useEffect not found'); process.exit(1); }

// Change `if (!open) return;` to include ref reset
for (let i = fxIdx; i < fxIdx + 5; i++) {
 if (lines[i].includes('if (!open) return;')) {
 lines[i] = lines[i].replace('if (!open) return;', 'if (!open) { initializedRef.current = false; return; }');
 break;
 }
}

// Find `const d = new Date(todayMs);` inside the effect and add guard before it
let initLineIdx = -1;
for (let i = fxIdx; i < fxIdx + 10; i++) {
 if (lines[i].includes('const d = new Date(todayMs);')) { initLineIdx = i; break; }
}
if (initLineIdx < 0) { console.error('init line not found'); process.exit(1); }

const initIndent = lines[initLineIdx].match(/^\s*/)[0];
lines.splice(initLineIdx, 0,
 initIndent + 'if (initializedRef.current) return;',
 initIndent + 'initializedRef.current = true;'
);

// Change deps from [open, todayMs] to [open]
for (let i = fxIdx; i < fxIdx + 20; i++) {
 if (lines[i].includes('[open, todayMs]')) {
 lines[i] = lines[i].replace('[open, todayMs]', '[open]');
 break;
 }
}

// === BUG 2 fix: use full dataset span, not captured visibleRange ===
let handleIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('const handleGo = () => {')) { handleIdx = i; break; }
}
if (handleIdx < 0) { console.error('handleGo not found'); process.exit(1); }

let spanIdx = -1;
for (let i = handleIdx; i < handleIdx + 10; i++) {
 if (lines[i].includes('const span = visibleRange')) { spanIdx = i; break; }
}
if (spanIdx < 0) { console.error('span line not found'); process.exit(1); }

lines[spanIdx] = lines[spanIdx].replace(
 'const span = visibleRange ? visibleRange.to - visibleRange.from : 0;',
 'const span = candles.length > 1 ? candles[candles.length - 1].time - candles[0].time : 0;'
);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
