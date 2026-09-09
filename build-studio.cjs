const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
let lines = fs.readFileSync(path, 'utf8').split('\n');
const S = (n) => Array(n + 1).join(' ');

// === Idempotency: revert prior script runs ===
while (lines.some(l => l.includes('const [priceScale, setPriceScale]'))) {
 const idx = lines.findIndex(l => l.includes('const [priceScale, setPriceScale]'));
 if (idx >= 0) lines.splice(idx, 2); else break;
}
while (lines.some(l => l.includes('const [chartTimezone, setChartTimezone]'))) {
 const idx = lines.findIndex(l => l.includes('const [chartTimezone, setChartTimezone]'));
 if (idx >= 0) lines.splice(idx, 2); else break;
}
while (lines.some(l => l.includes('const [tzOpen, setTzOpen]'))) {
 const idx = lines.findIndex(l => l.includes('const [tzOpen, setTzOpen]'));
 if (idx >= 0) lines.splice(idx, 2); else break;
}
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('priceScale,') && lines[i].match(/priceScale,/g) && !lines[i].includes('priceScale:')) {
 lines[i] = lines[i].replace('priceScale,', 'priceScale: "auto",');
 }
}
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('[symbol, displayTf, view?.dataset.timezone, priceScale, chartTimezone]')) {
 lines[i] = lines[i].replace('[symbol, displayTf, view?.dataset.timezone, priceScale, chartTimezone]',
 '[symbol, displayTf, view?.dataset.timezone]');
 }
}
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('chartTimezone === "Exchange"')) {
 lines[i] = lines[i].replace(
 'chartTimezone === "Exchange" ? (view?.dataset.timezone ?? "UTC") : chartTimezone',
 'view?.dataset.timezone ?? "UTC"'
 );
 }
}
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('timeZone: chartTimezone === "Exchange"')) {
 lines[i] = lines[i].replace(
 'timeZone: chartTimezone === "Exchange" ? (view?.dataset.timezone ?? "UTC") : chartTimezone',
 'timeZone: view?.dataset.timezone ?? "UTC"'
 );
 }
}
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('" " + tzLabel')) {
 lines[i] = lines[i].replace('" " + tzLabel', '" UTC"');
 }
}
// Remove tzList + tzLabel declarations
while (lines.some(l => l.includes('const tzList = ['))) {
 const idx = lines.findIndex(l => l.includes('const tzList = ['));
 if (idx >= 0) {
 const endIdx = idx;
 for (let j = idx; j < lines.length; j++) { if (lines[j].includes('];')) { endIdx = j; break; } }
 lines.splice(idx, endIdx - idx + 1);
 } else break;
}
while (lines.some(l => l.includes('const tzLabel'))) {
 const idx = lines.findIndex(l => l.includes('const tzLabel'));
 if (idx >= 0) lines.splice(idx, 3); else break;
}

// === Apply changes from clean base ===

// Change 1: Calendar import
lines[13] = lines[13].replace(
 'ChevronDown, Eye, EyeOff, LineChart, Newspaper, Shapes',
 'Calendar, ChevronDown, Eye, EyeOff, LineChart, Newspaper, Shapes'
);

// Change 2: PriceScaleMode import
lines[17] = lines[17].replace(
 'ChartSettings, IndicatorConfig, IndicatorKey',
 'ChartSettings, IndicatorConfig, IndicatorKey, PriceScaleMode'
);

// Change 3: add priceScale + chartTimezone + tzOpen state after decimals
let decimalsIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('const decimals = decimalsFor(lastPrice);')) { decimalsIdx = i; break; }
}
lines.splice(decimalsIdx + 2, 0,
 S(2) + 'const [priceScale, setPriceScale] = useState<PriceScaleMode>("auto");',
 S(2) + 'const [chartTimezone, setChartTimezone] = useState<string>("Exchange");',
 S(2) + 'const [tzOpen, setTzOpen] = useState(false);',
 ''
);

// Change 4: replace priceScale: "auto" with priceScale,
let priceScaleIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('priceScale: "auto",')) { priceScaleIdx = i; break; }
}
lines[priceScaleIdx] = lines[priceScaleIdx].replace('priceScale: "auto",', 'priceScale,');

// Change 5: update timezone in settings
let tzSettingIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes("timezone: view?.dataset.timezone")) { tzSettingIdx = i; break; }
}
if (tzSettingIdx >= 0) {
 lines[tzSettingIdx] = ' timezone: chartTimezone === "Exchange" ? (view?.dataset.timezone ?? "UTC") : chartTimezone,';
}

// Change 6: update deps
let depsIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('[symbol, displayTf, view?.dataset.timezone]')) { depsIdx = i; break; }
}
lines[depsIdx] = lines[depsIdx].replace(
 '[symbol, displayTf, view?.dataset.timezone]',
 '[symbol, displayTf, view?.dataset.timezone, priceScale, chartTimezone]'
);

// Change 7: wrap chartWrapRef div in flex-col container
let chartWrapIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('chartWrapRef') && lines[i].includes('<div')) { chartWrapIdx = i; break; }
}
const indent = lines[chartWrapIdx].match(/^\s*/)[0];
lines[chartWrapIdx] =
 indent + '<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">\n' +
 indent + ' <div ref={chartWrapRef} className="relative min-w-0 flex-1">';

// Change 8: Find the closing </div> of the original chartWrapRef div using depth tracking
let depthCount = 1;
let originalCloseIdx = -1;
for (let i = chartWrapIdx + 1; i < lines.length; i++) {
 const l = lines[i];
 const opens = l.match(/<div\b/g);
 if (opens) depthCount += opens.length;
 const closes = l.match(/<\/div>/g);
 if (closes) depthCount -= closes.length;
 if (depthCount === 1) {
 originalCloseIdx = i;
 break;
 }
}
if (originalCloseIdx < 0) { console.error('original close not found'); process.exit(1); }

const footerLines = [
 indent + ' </div>',
 indent + '',
 indent + ' <div data-testid="studio-footer" className="flex h-7 shrink-0 items-center justify-between gap-0.5 border-t border-border/60 px-2">',
 indent + ' <div className="flex items-center gap-0.5">',
 indent + ' {([',
 indent + ' { label: "5y", tf: "1W", spanMs: 5 * 365 * 24 * 60 * 60 * 1000 },',
 indent + ' { label: "1y", tf: "1W", spanMs: 365 * 24 * 60 * 60 * 1000 },',
 indent + ' { label: "6m", tf: "2H", spanMs: 180 * 24 * 60 * 60 * 1000 },',
 indent + ' { label: "3m", tf: "1H", spanMs: 90 * 24 * 60 * 60 * 1000 },',
 indent + ' { label: "1m", tf: "30m", spanMs: 30 * 24 * 60 * 60 * 1000 },',
 indent + ' { label: "5d", tf: "5m", spanMs: 5 * 24 * 60 * 60 * 1000 },',
 indent + ' { label: "1d", tf: "1m", spanMs: 24 * 60 * 60 * 1000 },',
 indent + ' ])',
 indent + ' .map((preset) => {',
 indent + ' const disabled =',
 indent + ' candles.length === 0',
 indent + ' || view == null',
 indent + ' || (view.transport.marketTime - preset.spanMs) > candles[candles.length - 1].time',
 indent + ' || !aggregatableFrom(baseTf).includes(preset.tf as Timeframe);',
 indent + ' const handleClick = () => {',
 indent + ' if (disabled) return;',
 indent + ' setDisplayTf(preset.tf as Timeframe);',
 indent + ' const fromMs = view.transport.marketTime - preset.spanMs;',
 indent + ' const toMs = view.transport.marketTime;',
 indent + ' adapter?.setVisibleTimeRange?.(fromMs, toMs);',
 indent + ' };',
 indent + ' return (',
 indent + ' <button',
 indent + ' key={preset.label}',
 indent + ' type="button"',
 indent + ' disabled={disabled}',
 indent + ' onClick={handleClick}',
 indent + ' className={cn(',
 indent + ' "h-6 min-w-[26px] rounded-[2px] px-1 text-[10px] font-mono font-semibold leading-none transition",',
 indent + ' disabled',
 indent + ' ? "cursor-not-allowed text-muted-foreground/40"',
 indent + ' : "hover:bg-muted focus-visible:outline-none focus-visible:ring-2"',
 indent + ' )}',
 indent + ' >',
 indent + ' {preset.label}',
 indent + ' </button>',
 indent + ' );',
 indent + ' })}',
 indent + ' <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border/60" />',
 indent + ' <Calendar',
 indent + ' className="h-3.5 w-3.5 shrink-0 text-muted-foreground"',
 indent + ' aria-label="Calendar"',
 indent + ' />',
 indent + ' </div>',
 indent + ' <div className="flex items-center gap-1">',
 indent + ' {view != null && (',
 indent + ' <button',
 indent + ' type="button"',
 indent + ' data-testid="utc-clock"',
 indent + ' onClick={() => setTzOpen((v) => !v)}',
 indent + ' className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground transition hover:bg-muted"',
 indent + ' >',
 indent + ' {new Date(view.transport.marketTime).toLocaleTimeString("en-GB", {',
 indent + ' timeZone: chartTimezone === "Exchange" ? (view.dataset.timezone ?? "UTC") : chartTimezone,',
 indent + ' hour: "2-digit",',
 indent + ' minute: "2-digit",',
 indent + ' second: "2-digit",',
 indent + ' })}',
 indent + ' {" " + tzLabel}',
 indent + ' </button>',
 indent + ' )}',
 indent + ' <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border/60" />',
 indent + ' {(["percentage", "log", "auto"] as const).map((mode) => (',
 indent + ' <button',
 indent + ' key={mode}',
 indent + ' type="button"',
 indent + ' aria-label={`Price scale ${mode}`}',
 indent + ' aria-pressed={priceScale === mode}',
 indent + ' data-active={priceScale === mode ? "1" : "0"}',
 indent + ' onClick={() => setPriceScale(mode)}',
 indent + ' className="h-6 min-w-[26px] rounded-[2px] px-1 text-[10px] font-mono font-semibold leading-none transition data-[active=1]:bg-primary data-[active=1]:text-primary-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2"',
 indent + ' >',
 indent + ' {mode === "percentage" ? "%" : mode}',
 indent + ' </button>',
 indent + ' ))}',
 indent + ' </div>',
 indent + ' {tzOpen && view != null && (',
 indent + ' <div',
 indent + ' className="absolute bottom-full right-0 z-50 mb-0.5 max-h-56 w-48 overflow-y-auto rounded-md border border-border bg-popover p-0.5 shadow-lg"',
 indent + ' data-testid="timezone-picker"',
 indent + ' >',
 indent + ' <button',
 indent + ' type="button"',
 indent + ' aria-label="Exchange timezone"',
 indent + ' aria-pressed={chartTimezone === "Exchange"}',
 indent + ' onClick={() => { setChartTimezone("Exchange"); setTzOpen(false); }}',
 indent + ' className={cn(',
 indent + ' "flex w-full items-center rounded-[2px] px-2 py-1 text-left text-[11px] transition",',
 indent + ' chartTimezone === "Exchange"',
 indent + ' ? "bg-accent text-accent-foreground font-semibold"',
 indent + ' : "hover:bg-muted text-muted-foreground"',
 indent + ' )}',
 indent + ' >',
 indent + ' Exchange',
 indent + ' </button>',
 indent + ' <span className="my-0.5 h-px w-full bg-border/60" />',
 indent + ' {tzList.slice(1).map((tz) => (',
 indent + ' <button',
 indent + ' key={tz.value}',
 indent + ' type="button"',
 indent + ' aria-label={tz.label}',
 indent + ' aria-pressed={chartTimezone === tz.value}',
 indent + ' onClick={() => { setChartTimezone(tz.value); setTzOpen(false); }}',
 indent + ' className={cn(',
 indent + ' "flex w-full items-center rounded-[2px] px-2 py-1 text-left text-[11px] transition",',
 indent + ' chartTimezone === tz.value',
 indent + ' ? "bg-accent text-accent-foreground font-semibold"',
 indent + ' : "hover:bg-muted text-muted-foreground"',
 indent + ' )}',
 indent + ' >',
 indent + ' {tz.label}',
 indent + ' </button>',
 indent + ' ))}',
 indent + ' </div>',
 indent + ' )}',
 indent + ' </div>',
 indent + '</div>',
];

lines.splice(originalCloseIdx, 1, ...footerLines);

// === Stage 2: Add tzList and tzLabel declarations before return ===
let topReturnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].trim() === 'return (' && lines[i].match(/^\s*/)[0].length <= 2) {
 topReturnIdx = i;
 break;
 }
}
if (topReturnIdx < 0) { console.error('top return not found'); process.exit(1); }

const tzData = [
 { value: 'Exchange', label: 'Exchange' },
 { value: 'Pacific/Honolulu', label: '(UTC-10) Honolulu' },
 { value: 'America/Anchorage', label: '(UTC-8) Anchorage' },
 { value: 'America/Juneau', label: '(UTC-8) Juneau' },
 { value: 'America/Los_Angeles', label: '(UTC-7) Los Angeles' },
 { value: 'America/Phoenix', label: '(UTC-7) Phoenix' },
 { value: 'America/Vancouver', label: '(UTC-7) Vancouver' },
 { value: 'America/Denver', label: '(UTC-6) Denver' },
 { value: 'America/Mexico_City', label: '(UTC-6) Mexico City' },
 { value: 'America/El_Salvador', label: '(UTC-6) San Salvador' },
 { value: 'America/Bogota', label: '(UTC-5) Bogota' },
 { value: 'America/Chicago', label: '(UTC-5) Chicago' },
 { value: 'America/Lima', label: '(UTC-5) Lima' },
 { value: 'America/Caracas', label: '(UTC-4) Caracas' },
 { value: 'America/New_York', label: '(UTC-4) New York' },
 { value: 'America/Toronto', label: '(UTC-4) Toronto' },
 { value: 'America/Argentina/Buenos_Aires', label: '(UTC-3) Buenos Aires' },
 { value: 'America/Halifax', label: '(UTC-3) Halifax' },
 { value: 'America/Santiago', label: '(UTC-3) Santiago' },
 { value: 'America/Sao_Paulo', label: '(UTC-3) Sao Paulo' },
 { value: 'Atlantic/Azores', label: '(UTC) Azores' },
 { value: 'Atlantic/Reykjavik', label: '(UTC) Reykjavik' },
 { value: 'Africa/Casablanca', label: '(UTC+1) Casablanca' },
 { value: 'Europe/Dublin', label: '(UTC+1) Dublin' },
 { value: 'Africa/Lagos', label: '(UTC+1) Lagos' },
 { value: 'Europe/Lisbon', label: '(UTC+1) Lisbon' },
 { value: 'Europe/London', label: '(UTC+1) London' },
 { value: 'Africa/Tunis', label: '(UTC+1) Tunis' },
 { value: 'Europe/Amsterdam', label: '(UTC+2) Amsterdam' },
 { value: 'Europe/Athens', label: '(UTC+2) Athens' },
 { value: 'Europe/Bucharest', label: '(UTC+2) Bucharest' },
 { value: 'Europe/Helsinki', label: '(UTC+2) Helsinki' },
 { value: 'Africa/Johannesburg', label: '(UTC+2) Johannesburg' },
 { value: 'Europe/Kiev', label: '(UTC+2) Kiev' },
 { value: 'Africa/Cairo', label: '(UTC+2) Cairo' },
 { value: 'Europe/Riga', label: '(UTC+2) Riga' },
 { value: 'Europe/Sofia', label: '(UTC+2) Sofia' },
 { value: 'Asia/Amman', label: '(UTC+3) Amman' },
 { value: 'Europe/Istanbul', label: '(UTC+3) Istanbul' },
 { value: 'Europe/Kaliningrad', label: '(UTC+3) Kaliningrad' },
 { value: 'Europe/Minsk', label: '(UTC+3) Minsk' },
 { value: 'Europe/Moscow', label: '(UTC+3) Moscow' },
 { value: 'Europe/Volgograd', label: '(UTC+3) Volgograd' },
 { value: 'Africa/Nairobi', label: '(UTC+3) Nairobi' },
 { value: 'Europe/Samara', label: '(UTC+4) Samara' },
 { value: 'Asia/Dubai', label: '(UTC+4) Dubai' },
 { value: 'Asia/Tbilisi', label: '(UTC+4) Tbilisi' },
 { value: 'Asia/Yerevan', label: '(UTC+4) Yerevan' },
 { value: 'Asia/Baku', label: '(UTC+4) Baku' },
 { value: 'Asia/Muscat', label: '(UTC+4) Muscat' },
 { value: 'Indian/Mauritius', label: '(UTC+4) Mauritius' },
 { value: 'Indian/Reunion', label: '(UTC+4) Reunion' },
 { value: 'Asia/Kabul', label: '(UTC+4:30) Kabul' },
 { value: 'Asia/Tashkent', label: '(UTC+5) Tashkent' },
 { value: 'Asia/Yekaterinburg', label: '(UTC+5) Yekaterinburg' },
 { value: 'Asia/Karachi', label: '(UTC+5) Karachi' },
 { value: 'Asia/Kolkata', label: '(UTC+5:30) Kolkata' },
 { value: 'Asia/Colombo', label: '(UTC+5:30) Colombo' },
 { value: 'Asia/Kathmandu', label: '(UTC+5:45) Kathmandu' },
 { value: 'Asia/Dhaka', label: '(UTC+6) Dhaka' },
 { value: 'Asia/Almaty', label: '(UTC+6) Almaty' },
 { value: 'Asia/Bishkek', label: '(UTC+6) Bishkek' },
 { value: 'Asia/Omsk', label: '(UTC+6) Omsk' },
 { value: 'Indian/Chagos', label: '(UTC+6) Chagos' },
 { value: 'Asia/Yangon', label: '(UTC+6:30) Yangon' },
 { value: 'Asia/Bangkok', label: '(UTC+7) Bangkok' },
 { value: 'Asia/Ho_Chi_Minh', label: '(UTC+7) Ho Chi Minh' },
 { value: 'Asia/Jakarta', label: '(UTC+7) Jakarta' },
 { value: 'Asia/Novosibirsk', label: '(UTC+7) Novosibirsk' },
 { value: 'Asia/Phnom_Penh', label: '(UTC+7) Phnom Penh' },
 { value: 'Asia/Vientiane', label: '(UTC+7) Vientiane' },
 { value: 'Asia/Hong_Kong', label: '(UTC+8) Hong Kong' },
 { value: 'Asia/Irkutsk', label: '(UTC+8) Irkutsk' },
 { value: 'Asia/Kuala_Lumpur', label: '(UTC+8) Kuala Lumpur' },
 { value: 'Asia/Macau', label: '(UTC+8) Macau' },
 { value: 'Asia/Shanghai', label: '(UTC+8) Shanghai' },
 { value: 'Asia/Singapore', label: '(UTC+8) Singapore' },
 { value: 'Asia/Taipei', label: '(UTC+8) Taipei' },
 { value: 'Asia/Ulaanbaatar', label: '(UTC+8) Ulaanbaatar' },
 { value: 'Asia/Pyongyang', label: '(UTC+8:30) Pyongyang' },
 { value: 'Asia/Tokyo', label: '(UTC+9) Tokyo' },
 { value: 'Asia/Seoul', label: '(UTC+9) Seoul' },
 { value: 'Asia/Yakutsk', label: '(UTC+9) Yakutsk' },
 { value: 'Australia/Adelaide', label: '(UTC+9:30) Adelaide' },
 { value: 'Australia/Darwin', label: '(UTC+9:30) Darwin' },
 { value: 'Australia/Brisbane', label: '(UTC+10) Brisbane' },
 { value: 'Australia/Hobart', label: '(UTC+10) Hobart' },
 { value: 'Asia/Vladivostok', label: '(UTC+10) Vladivostok' },
 { value: 'Australia/Melbourne', label: '(UTC+10) Melbourne' },
 { value: 'Australia/Sydney', label: '(UTC+10) Sydney' },
 { value: 'Pacific/Noumea', label: '(UTC+11) Noumea' },
 { value: 'Pacific/Guadalcanal', label: '(UTC+11) Guadalcanal' },
 { value: 'Asia/Magadan', label: '(UTC+11) Magadan' },
 { value: 'Pacific/Norfolk', label: '(UTC+11) Norfolk Island' },
 { value: 'Pacific/Auckland', label: '(UTC+12) Auckland' },
 { value: 'Pacific/Fiji', label: '(UTC+12) Fiji' },
 { value: 'Pacific/Tarawa', label: '(UTC+12) Tarawa' },
 { value: 'Pacific/Majuro', label: '(UTC+12) Majuro' },
 { value: 'Pacific/Nauru', label: '(UTC+12) Nauru' },
 { value: 'Pacific/Tongatapu', label: '(UTC+13) Tongatapu' },
 { value: 'Pacific/Apia', label: '(UTC+13) Apia' },
 { value: 'Pacific/Kiritimati', label: '(UTC+14) Kiritimati' },
];

const tzLines = [
 S(2) + 'const tzList = [',
 S(4) + '{ value: "Exchange", label: "Exchange" },',
 ...tzData.filter(t => t.value !== 'Exchange').map(t => S(4) + `{ value: "${t.value}", label: "${t.label}" },`),
 S(2) + '];',
 S(2) + 'const tzLabel = (() => {',
 S(4) + 'if (chartTimezone === "Exchange") return view?.dataset.timezone?.split("/").pop() ?? "UTC";',
 S(4) + 'return chartTimezone.split("/").pop() ?? chartTimezone;',
 S(2) + '})();',
 '',
];
lines.splice(topReturnIdx, 0, ...tzLines);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');

// === Add setVisibleTimeRange to ChartAdapter interface ===
const adapterPath = 'src/lib/chart/adapter.ts';
const adapterSrc = fs.readFileSync(adapterPath, 'utf8');
if (!adapterSrc.includes('setVisibleTimeRange')) {
 const aLines = adapterSrc.split('\n');
 // Find the resetTimeScale? line
 let idx = -1;
 for (let i = 0; i < aLines.length; i++) {
 if (aLines[i].includes('resetTimeScale?()')) { idx = i; break; }
 }
 if (idx >= 0) {
 aLines.splice(idx + 1, 0,
 ' /** Set the visible time range in ms. */',
 ' setVisibleTimeRange?(fromMs: number, toMs: number): void;',
 '');
 fs.writeFileSync(adapterPath, aLines.join('\n'));
 console.log('adapter updated');
 }
}

// === Add setVisibleTimeRange impl to lightweight adapter ===
const lwPath = 'src/lib/chart/adapters/lightweight.ts';
const lwSrc = fs.readFileSync(lwPath, 'utf8');
if (!lwSrc.includes('setVisibleTimeRange(fromMs')) {
 const lwLines = lwSrc.split('\n');
 let idx = -1;
 for (let i = 0; i < lwLines.length; i++) {
 if (lwLines[i].includes('resetTimeScale() {')) { idx = i; break; }
 }
 if (idx >= 0) {
 lwLines.splice(idx + 4, 0,
 ' setVisibleTimeRange(fromMs, toMs) {',
 ' try {',
 ' const ts = chart.timeScale();',
 ' const first = barTimes[0];',
 ' const last = barTimes[barTimes.length - 1];',
 ' if (!first || !last) return;',
 ' const margin = barStep * 20;',
 ' const clampedFrom = Math.max(fromMs, first - margin);',
 ' const minBars = Math.min(30, barTimes.length);',
 ' const clampedTo = Math.min(Math.max(toMs, clampedFrom + barStep * minBars), last + margin);',
 ' const from = timeToLogical(clampedFrom);',
 ' const to = timeToLogical(clampedTo);',
 ' if (from != null && to != null && to > from) ts.setVisibleLogicalRange({ from, to });',
 ' } catch { /* ignore */ }',
 ' },',
 '');
 fs.writeFileSync(lwPath, lwLines.join('\n'));
 console.log('lightweight updated');
 }
}
