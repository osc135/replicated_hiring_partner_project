interface Segment {
  value: number;
  color: string;
  label: string;
}

interface Props {
  segments: Segment[];
  title: string;
  size?: number;
}

export default function DonutChart({ segments, title, size = 96 }: Props) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <div className="rounded-full border-4 border-gray-100 flex items-center justify-center"
          style={{ width: size, height: size }}>
          <span className="text-xs text-gray-400">N/A</span>
        </div>
        <p className="text-xs text-gray-500 font-medium mt-2">{title}</p>
      </div>
    );
  }

  // Build conic-gradient segments
  let accumulated = 0;
  const gradientStops: string[] = [];
  for (const seg of segments) {
    const start = (accumulated / total) * 360;
    accumulated += seg.value;
    const end = (accumulated / total) * 360;
    gradientStops.push(`${seg.color} ${start}deg ${end}deg`);
  }

  const gradient = `conic-gradient(${gradientStops.join(', ')})`;
  const innerSize = size * 0.6;

  return (
    <div className="flex flex-col items-center">
      <div className="relative rounded-full" style={{ width: size, height: size, background: gradient }}>
        {/* Inner white circle for donut effect */}
        <div className="absolute bg-white rounded-full flex items-center justify-center"
          style={{
            width: innerSize, height: innerSize,
            top: (size - innerSize) / 2,
            left: (size - innerSize) / 2,
          }}>
          <span className="text-sm font-bold text-gray-900">{total}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 font-medium mt-2">{title}</p>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 mt-1.5">
        {segments.filter(s => s.value > 0).map(seg => (
          <span key={seg.label} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            {seg.label} ({seg.value})
          </span>
        ))}
      </div>
    </div>
  );
}
