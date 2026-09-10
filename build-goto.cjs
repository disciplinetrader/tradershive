const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r/g, '');
const lines = content.split('\n');
const S = (n) => Array(n + 1).join(' ');

// === Idempotency ===
// Remove GotoDialog function
while (lines.some(l => l === 'function GotoDialog(')) {
 const fn = lines.indexOf('function GotoDialog(');
 let end = fn;
 let depth = 0;
 for (let i = fn; i < lines.length; i++) {
 const opens = (lines[i].match(/\{/g) || []).length;
 const closes = (lines[i].match(/\}/g) || []).length;
 depth += opens - closes;
 if (i > fn && depth === 0) { end = i; break; }
 }
 lines.splice(fn, end - fn + 1);
}
// Remove gotoOpen state
while (lines.some(l => l.includes('const [gotoOpen, setGotoOpen]'))) {
 const idx = lines.findIndex(l => l.includes('const [gotoOpen, setGotoOpen]'));
 if (idx >= 0) lines.splice(idx, 2); else break;
}
// Remove gotoRangeRef
while (lines.some(l => l.includes('gotoRangeRef'))) {
 const idx = lines.findIndex(l => l.includes('gotoRangeRef'));
 if (idx >= 0) lines.splice(idx, 2); else break;
}
// Remove Dialog imports
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle')) {
 lines[i] = '';
 }
}
// Remove Calendar (shadcn) import
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('Calendar } from "@/components/ui/calendar"')) {
 lines[i] = '';
 }
}
// Remove Tabs import
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('Tabs, TabsList, TabsTrigger')) {
 lines[i] = '';
 }
}
// Remove Input import
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('Input } from "@/components/ui/input"')) {
 lines[i] = '';
 }
}
// Remove gotoOpen dialog render
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('{gotoOpen && view != null && (')) {
 const indent = lines[i].match(/^\s*/)[0].length;
 let end = -1;
 for (let j = i; j < lines.length; j++) {
 if (lines[j].trim() === ')}' && lines[j].match(/^\s*/)[0].length === indent) {
 end = j; break; // matches the GotoDialog render line
 }
 }
 if (end >= 0) lines.splice(i, end - i + 1);
 break;
 }
}
// Restore calendar button to bare icon
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('onClick={() => {') && i + 3 < lines.length && lines[i+3].includes('setGotoOpen')) {
 // Find the closing </button>
 let closeBtn = -1;
 for (let j = i; j < i + 20; j++) {
 if (lines[j].includes('</button>')) { closeBtn = j; break; }
 }
 if (closeBtn > 0) {
 lines.splice(i, closeBtn - i + 1);
 // Replace with bare icon
 lines[i] = lines[i].replace(/<button[\s\S]*?<\/button>/, '');
 // Actually just put back the icon
 lines[i] = lines[i].match(/^\s*/)[0] + '<Calendar';
 lines[i] = lines[i] + '\n' + lines[i].match(/^\s*/)[0] + ' className="h-3.5 w-3.5 shrink-0 text-muted-foreground"\n' + lines[i].match(/^\s*/)[0] + ' aria-label="Calendar"\n' + lines[i].match(/^\s*/)[0] + ' />';
 }
 break;
 }
}

// === Apply ===

// 1. Add imports after last import line
let lastImportIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].startsWith('import ')) lastImportIdx = i;
}
lines.splice(lastImportIdx + 1, 0,
 'import { Calendar as CalendarPicker } from "@/components/ui/calendar";',
 'import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";',
 'import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";',
 'import { Input } from "@/components/ui/input";',
);

// 2. Add gotoOpen + gotoRangeRef after tzOpen state
let tzOpenIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('const [tzOpen, setTzOpen]')) { tzOpenIdx = i; break; }
}
if (tzOpenIdx >= 0) {
 let refIdx2 = -1;
 for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('useRef') && lines[i].includes('null')) { refIdx2 = i; break; }
 }
 lines.splice(tzOpenIdx + 2, 0,
 S(2) + 'const [gotoOpen, setGotoOpen] = useState(false);',
 ''
 );
 lines.splice(refIdx2 + 2, 0,
 S(2) + 'const gotoRangeRef = useRef<{ from: number; to: number } | null>(null);',
 ''
 );
}

// 3. Replace Calendar icon with button
let calendarIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].trim() === '<Calendar') { calendarIdx = i; break; }
}
if (calendarIdx < 0) { console.error('Calendar icon not found at line'); process.exit(1); }

let calendarCloseIdx = -1;
for (let i = calendarIdx; i < calendarIdx + 10; i++) {
 if (lines[i].match(/^\s*\/>$/)) { calendarCloseIdx = i; break; }
}
if (calendarCloseIdx < 0) { console.error('Calendar /> not found'); process.exit(1); }

const indent = lines[calendarIdx].match(/^\s*/)[0];
const btnIndent = indent + S(2);

// Replace the 3-line Calendar icon with a 14-line button
const calendarBlock = [
 indent + '<button',
 btnIndent + 'type="button"',
 btnIndent + 'aria-label="Go to date"',
 btnIndent + 'disabled={candles.length === 0}',
 btnIndent + 'onClick={() => {',
 btnIndent + S(2) + 'gotoRangeRef.current = adapter?.getVisibleTimeRange?.() ?? null;',
 btnIndent + S(2) + 'setGotoOpen(true);',
 btnIndent + '}}',
 btnIndent + 'className="rounded p-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">',
 btnIndent + S(2) + '<Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Calendar" />',
 indent + '</button>',
];
lines.splice(calendarIdx, calendarCloseIdx - calendarIdx + 1, ...calendarBlock);

// 4. Insert GotoDialog component before top-level return
let topReturnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].trim() === 'return (' && lines[i].match(/^\s*/)[0].length <= 2) {
 topReturnIdx = i; break; }
}

const gotoTabs = [
 '',
 S(2) + 'function GotoDialog({',
 S(4) + 'open,',
 S(4) + 'onOpenChange,',
 S(4) + 'candles,',
 S(4) + 'visibleRange,',
 S(4) + 'onGo,',
 S(2) + '}: {',
 S(4) + 'open: boolean;',
 S(4) + 'onOpenChange: (o: boolean) => void;',
 S(4) + 'candles: Candle[];',
 S(4) + 'visibleRange: { from: number; to: number } | null;',
 S(4) + 'onGo: (fromMs: number, toMs: number) => void;',
 S(2) + '}) {',
 S(2) + ' const [date, setDate] = useState<string>("");',
 S(2) + ' const [time, setTime] = useState<string>("00:00");',
 S(2) + ' const todayMs = candles.length ? candles[candles.length - 1].time : 0;',
 S(2) + ' const firstMs = candles.length ? candles[0].time : 0;',
 '',
 S(2) + ' useEffect(() => {',
 S(2) + ' if (!open) return;',
 S(2) + ' const d = new Date(todayMs);',
 S(2) + ' const yyyy = d.getUTCFullYear();',
 S(2) + ' const mm = String(d.getUTCMonth() + 1).padStart(2, "0");',
 S(2) + ' const dd = String(d.getUTCDate()).padStart(2, "0");',
 S(2) + ' setDate(`${yyyy}-${mm}-${dd}`);',
 S(2) + ' const hh = String(d.getUTCHours()).padStart(2, "0");',
 S(2) + ' const mi = String(d.getUTCMinutes()).padStart(2, "0");',
 S(2) + ' setTime(`${hh}:${mi}`);',
 S(2) + ' }, [open, todayMs]);',
 '',
 S(2) + ' const todayDay = useMemo(() => {',
 S(2) + ' const d = new Date(todayMs);',
 S(2) + ' return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));',
 S(2) + ' }, [todayMs]);',
 '',
 S(2) + ' const disabledMatcher = useCallback(',
 S(2) + ' (day: Date) => {',
 S(2) + ' const dayMs = day.getTime();',
 S(2) + ' if (dayMs > todayMs) return true;',
 S(2) + ' return false;',
 S(2) + ' },',
 S(2) + ' [todayMs]',
 S(2) + ' );',
 '',
 S(2) + ' const handleGo = () => {',
 S(2) + ' if (!date) return;',
 S(2) + ' const [y, m, d] = date.split("-").map(Number);',
 S(2) + ' const [hh, mi] = (time || "00:00").split(":").map(Number);',
 S(2) + ' const ms = Date.UTC(y, m - 1, d, hh, mi);',
 S(2) + ' if (!Number.isFinite(ms)) return;',
 S(2) + ' const span = visibleRange ? visibleRange.to - visibleRange.from : 0;',
 S(2) + ' onGo(ms, span > 0 ? ms + span : ms + 24 * 60 * 60 * 1000);',
 S(2) + ' onOpenChange(false);',
 S(2) + ' };',
 '',
 S(2) + ' const selectedDate = date ? new Date(`${date}T00:00:00Z`) : undefined;',
 '',
 S(2) + ' return (',
 S(2) + ' <Dialog open={open} onOpenChange={onOpenChange}>',
 S(2) + ' <DialogContent className="sm:max-w-sm" data-testid="goto-dialog">',
 S(2) + ' <DialogHeader>',
 S(2) + ' <DialogTitle>Go to</DialogTitle>',
 S(2) + ' </DialogHeader>',
 '',
 S(2) + ' <Tabs defaultValue="date" className="w-full">',
 S(2) + ' <TabsList className="grid w-full grid-cols-2">',
 S(2) + ' <TabsTrigger value="date">Date</TabsTrigger>',
 S(2) + ' <TabsTrigger value="range" disabled>Custom range</TabsTrigger>',
 S(2) + ' </TabsList>',
 S(2) + ' </Tabs>',
 '',
 S(2) + ' <div className="grid grid-cols-2 gap-2">',
 S(2) + ' <div>',
 S(2) + ' <label className="text-[11px] text-muted-foreground">Date</label>',
 S(2) + ' <Input',
 S(4) + 'type="date"',
 S(4) + 'value={date}',
 S(4) + 'onChange={(e) => setDate(e.target.value)}',
 S(4) + 'className="h-8 text-[12px]"',
 S(2) + '/>',
 S(2) + ' </div>',
 S(2) + ' <div>',
 S(2) + ' <label className="text-[11px] text-muted-foreground">Time</label>',
 S(2) + ' <Input',
 S(4) + 'type="time"',
 S(4) + 'value={time}',
 S(4) + 'onChange={(e) => setTime(e.target.value)}',
 S(4) + 'className="h-8 text-[12px]"',
 S(2) + '/>',
 S(2) + ' </div>',
 S(2) + ' </div>',
 '',
 S(2) + ' <CalendarPicker',
 S(4) + 'mode="single"',
 S(4) + 'selected={selectedDate}',
 S(4) + 'onSelect={(d) => {',
 S(6) + 'if (!d) return;',
 S(6) + 'const yyyy = d.getUTCFullYear();',
 S(6) + 'const mm = String(d.getUTCMonth() + 1).padStart(2, "0");',
 S(6) + 'const dd = String(d.getUTCDate()).padStart(2, "0");',
 S(6) + 'setDate(`${yyyy}-${mm}-${dd}`);',
 S(4) + '}}',
 S(4) + 'disabled={disabledMatcher}',
 S(4) + 'modifiers={{ replayDay: todayDay }}',
 S(4) + 'modifiersClassNames={{ replayDay: "ring-1 ring-primary" }}',
 S(2) + '/>',
 '',
 S(2) + ' <DialogFooter>',
 S(2) + ' <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>',
 S(2) + ' <Button size="sm" onClick={handleGo} disabled={!date}>Go to</Button>',
 S(2) + ' </DialogFooter>',
 S(2) + ' </DialogContent>',
 S(2) + ' </Dialog>',
 S(2) + ' );',
 S(2) + '}',
];
lines.splice(topReturnIdx, 0, ...gotoTabs);

// 5. Insert GotoDialog render inside footer
// Find footer close
let footerIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('data-testid="studio-footer"')) { footerIdx = i; break; }
}
let footerIndent = lines[footerIdx].match(/^\s*/)[0].length;
let depth = 1;
let footerCloseIdx = -1;
for (let i = footerIdx + 1; i < lines.length; i++) {
 if (lines[i].match(/^\s*<div\b/)) depth++;
 if (lines[i].match(/^\s*<\/div>\s*$/)) depth--;
 if (depth === 0) { footerCloseIdx = i; break; }
}
if (footerCloseIdx < 0) { console.error('footer close not found'); process.exit(1); }

lines.splice(footerCloseIdx, 0,
 indent + ' {gotoOpen && view != null && (',
 indent + S(2) + '<GotoDialog',
 indent + S(4) + 'open={gotoOpen}',
 indent + S(4) + 'onOpenChange={setGotoOpen}',
 indent + S(4) + 'candles={candles}',
 indent + S(4) + 'visibleRange={gotoRangeRef.current}',
 indent + S(4) + 'onGo={(from, to) => adapter?.setVisibleTimeRange?.(from, to)}',
 indent + S(2) + '/>',
 indent + ' )}',
);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
