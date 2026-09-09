const fs = require('fs');
const path = 'src/components/replay/studio/StudioChart.tsx';
const lines = fs.readFileSync(path, 'utf8').split('\n');
const S = (n) => Array(n + 1).join(' ');

// Revert any prior run of this script (idempotent)
while (lines.some(l => l.includes('const [chartTimezone, setChartTimezone]'))) {
 const idx = lines.findIndex(l => l.includes('const [chartTimezone, setChartTimezone]'));
 if (idx >= 0) lines.splice(idx, 2);
 else break;
}
while (lines.some(l => l.includes('const tzList'))) {
 const idx = lines.findIndex(l => l.includes('const tzList'));
 // tzList is multiple lines, find the closing ];
 let endIdx = idx;
 for (let i = idx; i < lines.length; i++) {
 if (lines[i].includes('];')) { endIdx = i; break; }
 }
 lines.splice(idx, endIdx - idx + 1);
}

// Change 1: Add chartTimezone state after priceScale state
let priceScaleIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('const [priceScale, setPriceScale]')) { priceScaleIdx = i; break; }
}
lines.splice(priceScaleIdx + 2, 0,
 S(2) + 'const [chartTimezone, setChartTimezone] = useState<string>("Exchange");',
 S(2) + 'const [tzOpen, setTzOpen] = useState(false);',
 ''
);

// Change 2: Replace hardcoded timezone in settings
let tzSettingIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes("timezone: view?.dataset.timezone")) { tzSettingIdx = i; break; }
}
lines[tzSettingIdx] = lines[tzSettingIdx].replace(
 "timezone: view?.dataset.timezone",
 "timezone: chartTimezone === \"Exchange\" ? (view?.dataset.timezone ?? \"UTC\") : chartTimezone"
);

// Change 3: Add chartTimezone to useMemo deps
let depsIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('[symbol, displayTf, view?.dataset.timezone]')) { depsIdx = i; break; }
}
if (depsIdx < 0) { console.error('deps not found'); process.exit(1); }
lines[depsIdx] = lines[depsIdx].replace(
 '[symbol, displayTf, view?.dataset.timezone]',
 '[symbol, displayTf, view?.dataset.timezone, chartTimezone]'
);

// Change 4: Add tzList declaration and click-outside ref right BEFORE the return statement
// Find top-level return statement
let topReturnIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].trim() === 'return (' && lines[i].match(/^\s*/)[0].length === 2) {
 topReturnIdx = i;
 break;
 }
}
if (topReturnIdx < 0) { console.error('top return not found'); process.exit(1); }

// Build tzList data
const tzListData = [
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

const tzListLines = [ S(2) + 'const tzList = [' ];
tzListData.forEach(tz => {
 tzListLines.push(S(4) + `{ value: "${tz.value}", label: "${tz.label}" },`);
});
tzListLines.push(S(2) + '];');
tzListLines.push('');
tzListLines.push(S(2) + 'const tzLabel = (() => {');
tzListLines.push(S(4) + 'if (chartTimezone === "Exchange") return view?.dataset.timezone?.split("/").pop() ?? "UTC";');
tzListLines.push(S(4) + 'return chartTimezone.split("/").pop() ?? chartTimezone;');
tzListLines.push(S(2) + '})();');
tzListLines.push('');

// tzList is computed every render — that's fine for the use case

lines.splice(topReturnIdx, 0, ...tzListLines);

// Change 5: Replace the clock <span> with a button, insert picker after the divider
let clockIdx = -1;
for (let i = 0; i < lines.length; i++) {
 if (lines[i].includes('data-testid="utc-clock"')) { clockIdx = i; break; }
}
if (clockIdx < 0) { console.error('utc-clock not found'); process.exit(1); }
const spanStartIdx = clockIdx - 2;
const spanEndIdx = clockIdx + 4;
const dividerIdx = spanEndIdx + 1;

// Compute indents from divider line
const rightGroupIndent = lines[dividerIdx].match(/^\s*/)[0]; // 8 spaces
const clockButtonIndent = rightGroupIndent + S(2); // 10 spaces
const pickerIndent = rightGroupIndent + S(2);
const pickerItemIndent = pickerIndent + S(2);

const clockButtonLines = [
 clockButtonIndent + '<button',
 clockButtonIndent + S(2) + 'type="button"',
 clockButtonIndent + S(2) + 'data-testid="utc-clock"',
 clockButtonIndent + S(2) + 'onClick={() => setTzOpen((v) => !v)}',
 clockButtonIndent + S(2) + 'className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground transition hover:bg-muted"',
 clockButtonIndent + '>',
 clockButtonIndent + S(2) + '{new Date(view.transport.marketTime).toLocaleTimeString("en-GB", {',
 clockButtonIndent + S(4) + 'timeZone: chartTimezone === "Exchange" ? (view?.dataset.timezone ?? "UTC") : chartTimezone,',
 clockButtonIndent + S(4) + 'hour: "2-digit",',
 clockButtonIndent + S(4) + 'minute: "2-digit",',
 clockButtonIndent + S(4) + 'second: "2-digit",',
 clockButtonIndent + S(2) + '})}',
 clockButtonIndent + S(2) + '{" " + tzLabel}',
 clockButtonIndent + '</button>',
];

const pickerLines = [
 pickerIndent + '{tzOpen && view != null && (',
 pickerIndent + S(2) + '<div',
 pickerIndent + S(4) + 'className="absolute bottom-full right-0 z-50 mb-0.5 max-h-56 w-48 overflow-y-auto rounded-md border border-border bg-popover p-0.5 shadow-lg"',
 pickerIndent + S(4) + 'data-testid="timezone-picker"',
 pickerIndent + S(2) + '>',
 pickerItemIndent + '<button',
 pickerItemIndent + S(2) + 'type="button"',
 pickerItemIndent + S(2) + 'aria-label="Exchange timezone"',
 pickerItemIndent + S(2) + 'aria-pressed={chartTimezone === "Exchange"}',
 pickerItemIndent + S(2) + 'onClick={() => { setChartTimezone("Exchange"); setTzOpen(false); }}',
 pickerItemIndent + S(2) + 'className={cn(',
 pickerItemIndent + S(4) + '"flex w-full items-center rounded-[2px] px-2 py-1 text-left text-[11px] transition",',
 pickerItemIndent + S(4) + 'chartTimezone === "Exchange"',
 pickerItemIndent + S(6) + '? "bg-accent text-accent-foreground font-semibold"',
 pickerItemIndent + S(6) + ': "hover:bg-muted text-muted-foreground"',
 pickerItemIndent + S(2) + ')}',
 pickerItemIndent + '>',
 pickerItemIndent + S(2) + 'Exchange',
 pickerItemIndent + '</button>',
 pickerItemIndent + '<span className="my-0.5 h-px w-full bg-border/60" />',
 pickerItemIndent + '{tzList.slice(1).map((tz) => (',
 pickerItemIndent + S(2) + '<button',
 pickerItemIndent + S(4) + 'key={tz.value}',
 pickerItemIndent + S(4) + 'type="button"',
 pickerItemIndent + S(4) + 'aria-label={tz.label}',
 pickerItemIndent + S(4) + 'aria-pressed={chartTimezone === tz.value}',
 pickerItemIndent + S(4) + 'onClick={() => { setChartTimezone(tz.value); setTzOpen(false); }}',
 pickerItemIndent + S(4) + 'className={cn(',
 pickerItemIndent + S(6) + '"flex w-full items-center rounded-[2px] px-2 py-1 text-left text-[11px] transition",',
 pickerItemIndent + S(6) + 'chartTimezone === tz.value',
 pickerItemIndent + S(8) + '? "bg-accent text-accent-foreground font-semibold"',
 pickerItemIndent + S(8) + ': "hover:bg-muted text-muted-foreground"',
 pickerItemIndent + S(4) + ')}',
 pickerItemIndent + '>',
 pickerItemIndent + S(2) + '{tz.label}',
 pickerItemIndent + '</button>',
 pickerItemIndent + '))}',
 pickerIndent + S(2) + '</div>',
 pickerIndent + ')}',
];

// Replace clock <span> with button
lines.splice(spanStartIdx, spanEndIdx - spanStartIdx + 1, ...clockButtonLines);
// Adjust divider index
const offset1 = clockButtonLines.length - (spanEndIdx - spanStartIdx + 1);
const newDividerIdx = dividerIdx + offset1;
// Insert picker after divider
lines.splice(newDividerIdx + 1, 0, ...pickerLines);

fs.writeFileSync(path, lines.join('\n'));
console.log('done');
