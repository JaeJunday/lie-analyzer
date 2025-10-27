import type { FC } from 'react';

interface HexRadarChartDatum {
  label: string;
  value: number; // expected 0-100
}

interface HexRadarChartProps {
  data: HexRadarChartDatum[];
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const HexRadarChart: FC<HexRadarChartProps> = ({ data }) => {
  if (!data?.length) return null;

  const axisCount = data.length;
  const size = 220;
  const center = size / 2;
  const radius = size * 0.36;
  const ringCount = 5;
  const angleStep = (Math.PI * 2) / axisCount;

  const polarToCartesian = (angle: number, value: number) => {
    const scaled = (clamp(value) / 100) * radius;
    return {
      x: center + Math.cos(angle) * scaled,
      y: center + Math.sin(angle) * scaled,
    };
  };

  const buildPolygonPath = (scale = 1) => {
    const points = data.map((_, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const scaledRadius = radius * scale;
      const x = center + Math.cos(angle) * scaledRadius;
      const y = center + Math.sin(angle) * scaledRadius;
      return `${x},${y}`;
    });
    return points.join(' ');
  };

  const chartPoints = data
    .map((datum, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const { x, y } = polarToCartesian(angle, datum.value);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Risk radar chart">
      <defs>
        <linearGradient id="hexRadarFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(34, 211, 238, 0.6)" />
          <stop offset="100%" stopColor="rgba(16, 185, 129, 0.4)" />
        </linearGradient>
      </defs>

      <g opacity={0.4} stroke="rgba(148, 163, 184, 0.25)" strokeWidth={1} fill="none">
        {[...Array(ringCount)].map((_, index) => {
          const scale = ((index + 1) / ringCount) * 0.95;
          return <polygon key={scale} points={buildPolygonPath(scale)} />;
        })}
      </g>

      <polygon points={buildPolygonPath()} fill="rgba(8, 47, 73, 0.55)" stroke="rgba(32, 211, 238, 0.35)" strokeWidth={1} />

      <polygon points={chartPoints} fill="url(#hexRadarFill)" stroke="rgba(16, 185, 129, 0.9)" strokeWidth={1.5} />

      {data.map((datum, index) => {
        const angle = -Math.PI / 2 + angleStep * index;
        const axisEnd = polarToCartesian(angle, 100);
        const labelPos = polarToCartesian(angle, 118);
        const textAnchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        const dy = Math.sin(angle) > 0.4 ? '1.2em' : Math.sin(angle) < -0.4 ? '-0.6em' : '0.35em';

        return (
          <g key={datum.label}>
            <line
              x1={center}
              y1={center}
              x2={axisEnd.x}
              y2={axisEnd.y}
              stroke="rgba(148, 163, 184, 0.3)"
              strokeWidth={1}
            />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor={textAnchor}
              fill="rgba(248, 250, 252, 0.85)"
              fontSize={11}
              fontWeight={600}
              letterSpacing="0.08em"
            >
              <tspan x={labelPos.x} dy={dy}>
                {datum.label.toUpperCase()}
              </tspan>
              <tspan x={labelPos.x} dy="1.2em" fill="rgba(94, 234, 212, 0.9)" fontWeight={500}>
                {Math.round(clamp(datum.value))}%
              </tspan>
            </text>
          </g>
        );
      })}

      <circle cx={center} cy={center} r={3} fill="rgba(94, 234, 212, 0.9)" />
    </svg>
  );
};

export default HexRadarChart;
