'use client';

const cohorts = [
  { label: 'Week 1', values: [100, 68, 45, 38, 31] },
  { label: 'Week 2', values: [100, 72, 51, 42, 35] },
  { label: 'Week 3', values: [100, 65, 48, 39, null] },
  { label: 'Week 4', values: [100, 70, null, null, null] },
];

const headers = ['Day 0', 'Day 1', 'Day 7', 'Day 14', 'Day 30'];

function cellStyle(v: number | null) {
  if (v === null) {
    return {
      backgroundColor: 'transparent',
      borderColor: 'var(--border)',
      color: 'var(--muted-foreground)',
    };
  }
  const opacity = 0.12 + (v / 100) * 0.7;
  return {
    backgroundColor: `rgba(34, 197, 94, ${opacity})`,
    borderColor: `rgba(34, 197, 94, 0.3)`,
    color: v > 55 ? 'rgba(0,0,0,0.75)' : 'var(--foreground)',
  };
}

export function RetentionIllustration() {
  return (
    <div className="h-full px-4 pb-3 pt-5">
      <div className="col h-full gap-1.5">
        <div className="row gap-1">
          <div className="w-12 shrink-0" />
          {headers.map((h) => (
            <div
              key={h}
              className="flex-1 text-center text-[9px] text-muted-foreground"
            >
              {h}
            </div>
          ))}
        </div>
        {cohorts.map(({ label, values }) => (
          <div key={label} className="row flex-1 gap-1">
            <div className="flex w-12 shrink-0 items-center text-[9px] text-muted-foreground">
              {label}
            </div>
            {values.map((v, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static data
                key={i}
                className="flex flex-1 items-center justify-center rounded border text-[9px] font-medium transition-all duration-300 group-hover:scale-[1.03]"
                style={cellStyle(v)}
              >
                {v !== null ? `${v}%` : '—'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
