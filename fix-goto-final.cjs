const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r/g, '');
const lines = content.split('\n');
const S = (n) => Array(n + 1).join(' ');

// === Bug 1 fix: initializedRef + [open] deps ===
// Find GotoDialog
let fnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('function GotoDialog({')) { fnIdx = i; break; }
}
if (fnIdx < 0) { console.error('GotoDialog not found'); process.exit(1); }

// Find `const [date, setDate] = useState<string>("");`
let dateIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('const [date, setDate] = useState<string>("");')) { dateIdx = i; break; }
}
if (dateIdx < 0) { console.error('date state not found'); process.exit(1); }

// Add initializedRef on the same line
lines[dateIdx] = lines[dateIdx] + '\n const initializedRef = useRef(false);';

// Find the useEffect inside GotoDialog
let fxIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('useEffect(() => {') && i > fnIdx) { fxIdx = i; break; }
}
if (fxIdx < 0) { console.error('useEffect not found'); process.exit(1); }

// Change `if (!open) return;` to reset ref
for (let i = fxIdx; i < fxIdx + 5; i++) {
 if (lines[i].includes('if (!open) return;')) {
 lines[i] = lines[i].replace('if (!open) return;', 'if (!open) { initializedRef.current = false; return; }');
 break;
 }
}

// Add guard + set before `const d = new Date(todayMs);`
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

// === Add firstMs check to disabledMatcher ===
let cbIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('const disabledMatcher = useCallback(')) { cbIdx = i; break; }
}
if (cbIdx < 0) { console.error('disabledMatcher not found'); process.exit(1); }

// Find `if (dayMs > todayMs) return true;` and add firstMs check after it
for (let i = cbIdx; i < cbIdx + 10; i++) {
 if (lines[i].includes('if (dayMs > todayMs) return true;')) {
 const indent = lines[i].match(/^\s*/)[0];
 lines.splice(i + 1, 0, indent + 'if (dayMs < firstMs) return true;');
 break;
 }
}

// Update deps line
for (let i = cbIdx; i < cbIdx + 20; i++) {
 if (lines[i].includes('[todayMs]')) {
 lines[i] = lines[i].replace('[todayMs]', '[todayMs, firstMs]');
 break;
 }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
