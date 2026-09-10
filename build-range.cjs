const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\r/g, '');
const lines = content.split('\n');
const S = (n) => Array(n + 1).join(' ');

// Find GotoDialog
let fnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('function GotoDialog({')) { fnIdx = i; break; }
}
if (fnIdx < 0) { console.error('GotoDialog not found'); process.exit(1); }

// Add TabsContent import
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('Tabs, TabsList, TabsTrigger')) {
 lines[i] = lines[i].replace('Tabs, TabsList, TabsTrigger', 'Tabs, TabsContent, TabsList, TabsTrigger');
 break;
 }
}

// Add range state after month state
let monthIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('const [month, setMonth] = useState<Date | undefined>(undefined);')) {
 monthIdx = i;
  break;
 }
}
if (monthIdx < 0) { console.error('month state not found'); process.exit(1); }
const monthIndent = lines[monthIdx].match(/^\s*/)[0];
lines.splice(monthIdx + 1, 0,
 monthIndent + 'const [activeTab, setActiveTab] = useState<"date" | "range">("date");',
 monthIndent + 'const [startDate, setStartDate] = useState<string>("");',
 monthIndent + 'const [startTime, setStartTime] = useState<string>("00:00");',
 monthIndent + 'const [endDate, setEndDate] = useState<string>("");',
 monthIndent + 'const [endTime, setEndTime] = useState<string>("00:00");'
);

// Seed range state in useEffect after setTime line
let seedIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('setTime(`${hh}:${mi}`);')) {
 seedIdx = i;
 break;
 }
}
if (seedIdx < 0) { console.error('setTime line not found'); process.exit(1); }
const seedIndent = lines[seedIdx].match(/^\s*/)[0];
const rangeSeed = [
 seedIndent + 'setStartDate(`${yyyy}-${mm}-${dd}`);',
 seedIndent + 'setEndDate(`${yyyy}-${mm}-${dd}`);',
 seedIndent + 'setStartTime("00:00");',
 seedIndent + 'setEndTime("23:59");'
];
lines.splice(seedIdx + 1, 0, ...rangeSeed);

// Make Tabs controlled, remove disabled
let tabsIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('<Tabs defaultValue="date"')) {
 tabsIdx = i;
 break;
 }
}
if (tabsIdx < 0) { console.error('Tabs line not found'); process.exit(1); }
lines[tabsIdx] = lines[tabsIdx].replace(
 '<Tabs defaultValue="date"',
 '<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "date" | "range")}'
);

for (let i = tabsIdx; i < tabsIdx + 10; i++) {
 if (lines[i].includes('value="range" disabled>Custom range</TabsTrigger>')) {
 lines[i] = lines[i].replace(' disabled', '');
 break;
 }
}

// Find </Tabs> closing
let tabsCloseIdx = -1;
let tabsOpenIdx = -1;
let tabsDepth = 0;
for (let i = tabsIdx; i < lines.length; i++) {
 if (lines[i].includes('<Tabs ') && tabsOpenIdx < 0) {
 tabsOpenIdx = i;
 tabsDepth = 1;
 } else if (tabsOpenIdx >= 0) {
 if (lines[i].includes('<TabsList')) tabsDepth++;
 if (lines[i].includes('</TabsList>')) tabsDepth--;
 if (lines[i].includes('</Tabs>')) {
 tabsDepth--;
 if (tabsDepth === 0) { tabsCloseIdx = i; break; }
 }
 }
}
if (tabsCloseIdx < 0) { console.error('Tabs close not found'); process.exit(1); }

// Find <DialogFooter>
let footerIdx = -1;
for (let i = tabsCloseIdx; i < lines.length; i++) {
 if (lines[i].includes('<DialogFooter>')) { footerIdx = i; break; }
}
if (footerIdx < 0) { console.error('DialogFooter not found'); process.exit(1); }

const dateIndent = lines[tabsCloseIdx + 1].match(/^\s*/)[0];

// Wrap existing date content in TabsContent
lines.splice(tabsCloseIdx + 1, 0, dateIndent + '<TabsContent value="date" className="space-y-2">');
lines.splice(footerIdx + 1, 0, dateIndent + '</TabsContent>');

// Find updated footerIdx after splice
footerIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('<DialogFooter>')) { footerIdx = i; break; }
}

// Build range block
const rangeBlock = [
 dateIndent + '<TabsContent value="range" className="space-y-2">',
 dateIndent + ' <div className="grid grid-cols-2 gap-2">',
 dateIndent + ' <div>',
 dateIndent + ' <label className="text-[11px] text-muted-foreground">Start date</label>',
 dateIndent + ' <Input',
 dateIndent + S(6) + 'type="date"',
 dateIndent + S(6) + 'value={startDate}',
 dateIndent + S(6) + 'onChange={(e) => setStartDate(e.target.value)}',
 dateIndent + S(6) + 'className="h-8 text-[12px]"',
 dateIndent + ' />',
 dateIndent + ' </div>',
 dateIndent + ' <div>',
 dateIndent + ' <label className="text-[11px] text-muted-foreground">Start time</label>',
 dateIndent + ' <Input',
 dateIndent + S(6) + 'type="time"',
 dateIndent + S(6) + 'value={startTime}',
 dateIndent + S(6) + 'onChange={(e) => setStartTime(e.target.value)}',
 dateIndent + S(6) + 'className="h-8 text-[12px]"',
 dateIndent + ' />',
 dateIndent + ' </div>',
 dateIndent + ' </div>',
 dateIndent + ' <div className="grid grid-cols-2 gap-2">',
 dateIndent + ' <div>',
 dateIndent + ' <label className="text-[11px] text-muted-foreground">End date</label>',
 dateIndent + ' <Input',
 dateIndent + S(6) + 'type="date"',
 dateIndent + S(6) + 'value={endDate}',
 dateIndent + S(6) + 'onChange={(e) => setEndDate(e.target.value)}',
 dateIndent + S(6) + 'className="h-8 text-[12px]"',
 dateIndent + ' />',
 dateIndent + ' </div>',
 dateIndent + ' <div>',
 dateIndent + ' <label className="text-[11px] text-muted-foreground">End time</label>',
 dateIndent + ' <Input',
 dateIndent + S(6) + 'type="time"',
 dateIndent + S(6) + 'value={endTime}',
 dateIndent + S(6) + 'onChange={(e) => setEndTime(e.target.value)}',
 dateIndent + S(6) + 'className="h-8 text-[12px]"',
 dateIndent + ' />',
 dateIndent + ' </div>',
 dateIndent + ' </div>',
 dateIndent + ' <CalendarPicker',
 dateIndent + S(4) + 'mode="range"',
 dateIndent + S(4) + 'month={month}',
 dateIndent + S(4) + 'onMonthChange={setMonth}',
 dateIndent + S(4) + 'selected={{ from: startDate ? new Date(`${startDate}T00:00:00Z`) : undefined, to: endDate ? new Date(`${endDate}T00:00:00Z`) : undefined }}',
 dateIndent + S(4) + 'onSelect={(r) => {',
 dateIndent + S(6) + 'if (!r) return;',
 dateIndent + S(6) + 'if (r.from) {',
 dateIndent + S(8) + 'const y = r.from.getUTCFullYear();',
 dateIndent + S(8) + 'const m = String(r.from.getUTCMonth() + 1).padStart(2, "0");',
 dateIndent + S(8) + 'const d = String(r.from.getUTCDate()).padStart(2, "0");',
 dateIndent + S(8) + 'setStartDate(`${y}-${m}-${d}`);',
 dateIndent + S(6) + '}',
 dateIndent + S(6) + 'if (r.to) {',
 dateIndent + S(8) + 'const y = r.to.getUTCFullYear();',
 dateIndent + S(8) + 'const m = String(r.to.getUTCMonth() + 1).padStart(2, "0");',
 dateIndent + S(8) + 'const d = String(r.to.getUTCDate()).padStart(2, "0");',
 dateIndent + S(8) + 'setEndDate(`${y}-${m}-${d}`);',
 dateIndent + S(6) + '}',
 dateIndent + S(6) + 'if (r.from) setMonth(r.from);',
 dateIndent + S(4) + '}}',
 dateIndent + S(4) + 'disabled={disabledMatcher}',
 dateIndent + ' />',
 dateIndent + '</TabsContent>'
];

lines.splice(footerIdx, 0, ...rangeBlock);

// Update handleGo to branch on activeTab
let handleIdx = -1;
for (let i = fnIdx; i < lines.length; i++) {
 if (lines[i].includes('const handleGo = () => {')) { handleIdx = i; break; }
}
if (handleIdx < 0) { console.error('handleGo not found'); process.exit(1); }

let handleEnd = handleIdx;
let hDepth = 0;
for (let i = handleIdx; i < lines.length; i++) {
 const opens = (lines[i].match(/\{/g) || []).length;
 const closes = (lines[i].match(/\}/g) || []).length;
 hDepth += opens - closes;
 if (i > handleIdx && hDepth === 0) { handleEnd = i; break; }
}

const handleIndent = lines[handleIdx].match(/^\s*/)[0];
const newHandle = [
 handleIndent + 'const handleGo = () => {',
 handleIndent + ' if (activeTab === "range") {',
 handleIndent + ' if (!startDate || !endDate) return;',
 handleIndent + ' const [y1, m1, d1] = startDate.split("-").map(Number);',
 handleIndent + ' const [y2, m2, d2] = endDate.split("-").map(Number);',
 handleIndent + ' const [hh1, mi1] = (startTime || "00:00").split(":").map(Number);',
 handleIndent + ' const [hh2, mi2] = (endTime || "00:00").split(":").map(Number);',
 handleIndent + ' const fromMs = Date.UTC(y1, m1 - 1, d1, hh1, mi1);',
 handleIndent + ' const toMs = Date.UTC(y2, m2 - 1, d2, hh2, mi2);',
 handleIndent + ' if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return;',
 handleIndent + ' if (!(toMs > fromMs)) return;',
 handleIndent + ' onGo(fromMs, toMs);',
 handleIndent + ' onOpenChange(false);',
 handleIndent + ' return;',
 handleIndent + ' }',
 handleIndent + ' if (!date) return;',
 handleIndent + ' const [y, m, d] = date.split("-").map(Number);',
 handleIndent + ' const [hh, mi] = (time || "00:00").split(":").map(Number);',
 handleIndent + ' const ms = Date.UTC(y, m - 1, d, hh, mi);',
 handleIndent + ' if (!Number.isFinite(ms)) return;',
 handleIndent + ' const span = visibleRange ? visibleRange.to - visibleRange.from : 0;',
 handleIndent + ' onGo(ms, span > 0 ? ms + span : ms + 24 * 60 * 60 * 1000);',
 handleIndent + ' onOpenChange(false);',
 handleIndent + '};'
];
lines.splice(handleIdx, handleEnd - handleIdx + 1, ...newHandle);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
