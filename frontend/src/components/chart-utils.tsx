interface GridLinesProps {
  width: number;
  height: number;
  ticks?: number[];
}

export function ChartGridLines({ width, height, ticks = [0, 0.5, 1] }: GridLinesProps) {
  return (
    <>
      {ticks.map((t) => {
        const y = height * (1 - t);
        return (
          <line
            key={t}
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray={t === 0 ? undefined : '2 2'}
          />
        );
      })}
    </>
  );
}
