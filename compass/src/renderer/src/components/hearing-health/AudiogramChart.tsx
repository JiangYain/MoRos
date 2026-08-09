import type { EarSide, EarThresholds } from "./model";
import { FREQUENCIES, INTER_OCTAVES } from "./model";

const CHART_WIDTH = 360;
const CHART_HEIGHT = 320;
const PAD_LEFT = 36;
const PAD_RIGHT = 18;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const INNER_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const INNER_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
const DB_MIN = -10;
const DB_MAX = 120;

function getX(frequencyIndex: number): number {
  return PAD_LEFT + (frequencyIndex / (FREQUENCIES.length - 1)) * INNER_WIDTH;
}

function getXByFrequency(frequency: number): number {
  const index = FREQUENCIES.findIndex((candidate) => candidate === frequency);
  if (index !== -1) return getX(index);
  const lowerIndex = frequency === 750 ? 1 : frequency === 1500 ? 3 : frequency === 3000 ? 4 : 5;
  return getX(lowerIndex) + (getX(lowerIndex + 1) - getX(lowerIndex)) * 0.58;
}

function getY(db: number): number {
  return PAD_TOP + ((db - DB_MIN) / (DB_MAX - DB_MIN)) * INNER_HEIGHT;
}

function buildPath(points: (number | null)[]): string {
  let drawing = false;
  return points.reduce((path, db, index) => {
    if (db === null) {
      drawing = false;
      return path;
    }
    const next = `${drawing ? " L" : "M"} ${getX(index).toFixed(1)} ${getY(db).toFixed(1)}`;
    drawing = true;
    return path + next;
  }, "");
}

function AudiogramGrid(): React.JSX.Element {
  return (
    <>
      {[0, 20, 40, 60, 80, 100, 120].map((db) => (
        <g key={db}>
          <line x1={PAD_LEFT} y1={getY(db)} x2={CHART_WIDTH - PAD_RIGHT} y2={getY(db)} className="hearing-health-grid-line" />
          <text x={PAD_LEFT - 8} y={getY(db) + 3} fontSize={9} fill="#8e8e93" fontFamily="var(--font-sans)" textAnchor="end">{db}</text>
        </g>
      ))}
      {INTER_OCTAVES.map((frequency) => (
        <line key={frequency} x1={getXByFrequency(frequency)} y1={PAD_TOP} x2={getXByFrequency(frequency)} y2={CHART_HEIGHT - PAD_BOTTOM} className="hearing-health-grid-line-inter" />
      ))}
      {FREQUENCIES.map((frequency, index) => (
        <g key={frequency}>
          <line x1={getX(index)} y1={PAD_TOP} x2={getX(index)} y2={CHART_HEIGHT - PAD_BOTTOM} className="hearing-health-grid-line" />
          <text x={getX(index)} y={CHART_HEIGHT - PAD_BOTTOM + 15} fontSize={9} fill="#8e8e93" fontFamily="var(--font-sans)" textAnchor="middle">
            {frequency >= 1000 ? `${frequency / 1000}k` : frequency}
          </text>
        </g>
      ))}
    </>
  );
}

function AudiogramOverlays({ showPictograms, showSpeechSpectrum }: { showPictograms: boolean; showSpeechSpectrum: boolean }): React.JSX.Element {
  return (
    <>
      {showSpeechSpectrum && (
        <polygon
          points={`${getXByFrequency(250)},${getY(15)} ${getXByFrequency(1000)},${getY(20)} ${getXByFrequency(4000)},${getY(25)} ${getXByFrequency(4000)},${getY(55)} ${getXByFrequency(1000)},${getY(50)} ${getXByFrequency(250)},${getY(40)}`}
          className="hearing-health-speech-banana"
        />
      )}
      {showPictograms && (
        <g>
          <text x={getXByFrequency(250)} y={getY(15)} className="hearing-health-pictogram-item">🍃</text>
          <text x={getXByFrequency(4000)} y={getY(15)} className="hearing-health-pictogram-item">🐦</text>
          <text x={getXByFrequency(500)} y={getY(30)} className="hearing-health-pictogram-item">💧</text>
          <text x={getXByFrequency(1000)} y={getY(45)} className="hearing-health-pictogram-item">🗣️</text>
          <text x={getXByFrequency(500)} y={getY(65)} className="hearing-health-pictogram-item">🎸</text>
          <text x={getXByFrequency(250)} y={getY(95)} className="hearing-health-pictogram-item">🚜</text>
          <text x={getXByFrequency(1000)} y={getY(110)} className="hearing-health-pictogram-item">✈️</text>
        </g>
      )}
    </>
  );
}

function ThresholdCurves({ ear, thresholds }: { ear: EarSide; thresholds: EarThresholds }): React.JSX.Element {
  const color = ear === "right" ? "#dc2626" : "#2563eb";
  const suffix = ear === "right" ? "right" : "left";
  return (
    <>
      {buildPath(thresholds.ac) && <path d={buildPath(thresholds.ac)} className={`hearing-health-path-ac-${suffix}`} />}
      {thresholds.ac.map((db, index) => db === null ? null : ear === "right" ? (
        <circle key={`rac-${index}`} cx={getX(index)} cy={getY(db)} r={3.8} fill="#ffffff" stroke={color} strokeWidth={1.8} />
      ) : (
        <g key={`lac-${index}`}>
          <line x1={getX(index) - 3.8} y1={getY(db) - 3.8} x2={getX(index) + 3.8} y2={getY(db) + 3.8} stroke={color} strokeWidth={1.8} />
          <line x1={getX(index) + 3.8} y1={getY(db) - 3.8} x2={getX(index) - 3.8} y2={getY(db) + 3.8} stroke={color} strokeWidth={1.8} />
        </g>
      ))}
      {buildPath(thresholds.bc) && <path d={buildPath(thresholds.bc)} className={`hearing-health-path-bc-${suffix}`} />}
      {thresholds.bc.map((db, index) => db === null ? null : (
        <text key={`${ear}-bc-${index}`} x={getX(index)} y={getY(db) + 3.5} fill={color} fontSize={11} fontWeight={600} textAnchor="middle">
          {ear === "right" ? "<" : ">"}
        </text>
      ))}
      {buildPath(thresholds.ucl) && <path d={buildPath(thresholds.ucl)} className={`hearing-health-path-ucl-${suffix}`} />}
      {thresholds.ucl.map((db, index) => db === null ? null : (
        <text key={`${ear}-ucl-${index}`} x={getX(index)} y={getY(db) + 3.5} fill={color} fontSize={10} fontWeight={600} textAnchor="middle">m</text>
      ))}
    </>
  );
}

interface AudiogramChartProps {
  ear: EarSide;
  thresholds: EarThresholds;
  showPictograms: boolean;
  showSpeechSpectrum: boolean;
  onThresholdChange: (frequencyIndex: number, db: number) => void;
}

export function AudiogramChart(props: AudiogramChartProps): React.JSX.Element {
  return (
    <div className="hearing-health-chart-container">
      <svg className="hearing-health-chart-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <AudiogramOverlays showPictograms={props.showPictograms} showSpeechSpectrum={props.showSpeechSpectrum} />
        <AudiogramGrid />
        <ThresholdCurves ear={props.ear} thresholds={props.thresholds} />
        {FREQUENCIES.map((_, index) => (
          <line
            key={`hit-${props.ear}-${index}`}
            x1={getX(index)}
            y1={PAD_TOP}
            x2={getX(index)}
            y2={CHART_HEIGHT - PAD_BOTTOM}
            stroke="transparent"
            strokeWidth={20}
            className="hearing-health-freq-hitarea"
            onClick={(event) => {
              const clickY = event.clientY - event.currentTarget.getBoundingClientRect().top;
              const rawDb = DB_MIN + ((clickY - PAD_TOP) / INNER_HEIGHT) * (DB_MAX - DB_MIN);
              props.onThresholdChange(index, Math.max(DB_MIN, Math.min(DB_MAX, Math.round(rawDb / 5) * 5)));
            }}
          />
        ))}
      </svg>
    </div>
  );
}
