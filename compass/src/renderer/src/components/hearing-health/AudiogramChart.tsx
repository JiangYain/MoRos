import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AUDIOGRAM_MARKERS } from "../../../../shared/client-audiograms";
import { useI18n, type TranslationKey } from "../../i18n";
import type {
  AudiogramMarker,
  AudiogramPoint,
  CurveType,
  EarSide,
  EarThresholds,
} from "./model";
import { CURVE_KEYS, FREQUENCIES, INTER_OCTAVES, OCTAVE_FREQUENCIES } from "./model";
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  chartPointFromClient,
  getX,
  getXByFrequency,
  getY,
  thresholdFromClick,
} from "./chart-geometry";

const MARKER_LABEL_KEYS: Record<AudiogramMarker, TranslationKey> = {
  "unmasked": "hearingHealth.marker.unmasked",
  "no-response": "hearingHealth.marker.noResponse",
  "unmeasurable": "hearingHealth.marker.unmeasurable",
  "masked": "hearingHealth.marker.masked",
  "masked-no-response": "hearingHealth.marker.maskedNoResponse",
  "masked-unmeasurable": "hearingHealth.marker.maskedUnmeasurable",
  "always-response": "hearingHealth.marker.alwaysResponse",
  "masked-always-response": "hearingHealth.marker.maskedAlwaysResponse",
};

function isMaskedMarker(marker: AudiogramMarker): boolean {
  return marker.startsWith("masked");
}

type MarkerModifier = "none" | "no-response" | "unmeasurable" | "always-response";

function markerModifier(marker: AudiogramMarker): MarkerModifier {
  if (marker.endsWith("no-response")) return "no-response";
  if (marker.endsWith("unmeasurable")) return "unmeasurable";
  if (marker.endsWith("always-response")) return "always-response";
  return "none";
}

/** Arrow with a small head; used for the response/measurability modifiers. */
function ModifierArrow({
  x,
  y,
  dx,
  dy,
  color,
  width = 1.4,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  width?: number;
}): React.JSX.Element {
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const vx = -uy;
  const vy = ux;
  const endX = x + dx;
  const endY = y + dy;
  const headA = `${endX - ux * 3 + vx * 2},${endY - uy * 3 + vy * 2}`;
  const headB = `${endX - ux * 3 - vx * 2},${endY - uy * 3 - vy * 2}`;
  return (
    <g stroke={color} strokeWidth={width} fill="none" strokeLinecap="round">
      <line x1={x} y1={y} x2={endX} y2={endY} />
      <polyline points={`${headA} ${endX},${endY} ${headB}`} />
    </g>
  );
}

/** Modifier arrow attached below/above a plotted symbol. */
function PointModifier({
  ear,
  marker,
  x,
  y,
  color,
}: {
  ear: EarSide;
  marker: AudiogramMarker;
  x: number;
  y: number;
  color: string;
}): React.JSX.Element | null {
  const modifier = markerModifier(marker);
  if (modifier === "none") return null;
  // Clinical convention: no-response arrows slant down and outward
  // (left-down on right-ear charts, right-down on left-ear charts).
  if (modifier === "no-response") {
    const direction = ear === "right" ? -1 : 1;
    return <ModifierArrow x={x + direction * 2} y={y + 4} dx={direction * 5} dy={5} color={color} />;
  }
  if (modifier === "unmeasurable") {
    return <ModifierArrow x={x} y={y + 4.5} dx={0} dy={7} color={color} />;
  }
  return <ModifierArrow x={x} y={y - 4.5} dx={0} dy={-7} color={color} />;
}

/** Base symbol for one plotted point, following audiometric conventions. */
function PointSymbol({
  curve,
  ear,
  point,
  x,
  y,
  color,
}: {
  curve: CurveType;
  ear: EarSide;
  point: AudiogramPoint;
  x: number;
  y: number;
  color: string;
}): React.JSX.Element {
  const masked = isMaskedMarker(point.marker);
  let base: React.JSX.Element;
  if (curve === "AC") {
    if (ear === "right") {
      base = masked
        ? <polygon points={`${x},${y - 4.4} ${x - 4.2},${y + 3.6} ${x + 4.2},${y + 3.6}`} fill="var(--color-bg)" stroke={color} strokeWidth={1.8} />
        : <circle cx={x} cy={y} r={3.8} fill="var(--color-bg)" stroke={color} strokeWidth={1.8} />;
    } else {
      base = masked
        ? <rect x={x - 3.6} y={y - 3.6} width={7.2} height={7.2} fill="var(--color-bg)" stroke={color} strokeWidth={1.8} />
        : (
            <g stroke={color} strokeWidth={1.8}>
              <line x1={x - 3.8} y1={y - 3.8} x2={x + 3.8} y2={y + 3.8} />
              <line x1={x + 3.8} y1={y - 3.8} x2={x - 3.8} y2={y + 3.8} />
            </g>
          );
    }
  } else if (curve === "BC") {
    const glyph = ear === "right" ? (masked ? "[" : "<") : (masked ? "]" : ">");
    base = (
      <text x={x} y={y + 3.5} fill={color} fontSize={11} fontWeight={600} textAnchor="middle">
        {glyph}
      </text>
    );
  } else {
    base = (
      <text x={x} y={y + 3.5} fill={color} fontSize={10} fontWeight={600} textAnchor="middle">
        m
      </text>
    );
  }
  return (
    <g>
      {base}
      <PointModifier ear={ear} marker={point.marker} x={x} y={y} color={color} />
    </g>
  );
}

/** Small preview of a marker variant for the context-menu rows. */
function MarkerPreview({ marker }: { marker: AudiogramMarker }): React.JSX.Element {
  const masked = isMaskedMarker(marker);
  const modifier = markerModifier(marker);
  const cx = 8;
  const cy = modifier === "always-response" ? 10 : 6;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {masked
        ? <polygon points={`${cx},${cy - 3.4} ${cx - 3.2},${cy + 2.8} ${cx + 3.2},${cy + 2.8}`} fill="none" stroke="currentColor" strokeWidth={1.4} />
        : <circle cx={cx} cy={cy} r={3} fill="none" stroke="currentColor" strokeWidth={1.4} />}
      {modifier === "no-response" && (
        <ModifierArrow x={cx - 1.4} y={cy + 3.4} dx={-3.4} dy={3.4} color="currentColor" width={1.2} />
      )}
      {modifier === "unmeasurable" && (
        <ModifierArrow x={cx} y={cy + 3.6} dx={0} dy={4.6} color="currentColor" width={1.2} />
      )}
      {modifier === "always-response" && (
        <ModifierArrow x={cx} y={cy - 3.6} dx={0} dy={-4.6} color="currentColor" width={1.2} />
      )}
    </svg>
  );
}

function buildPath(points: (AudiogramPoint | null)[]): string {
  let drawing = false;
  return points.reduce((path, point, index) => {
    if (point === null) {
      drawing = false;
      return path;
    }
    const next = `${drawing ? " L" : "M"} ${getX(index).toFixed(1)} ${getY(point.db).toFixed(1)}`;
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
          <text x={PAD_LEFT - 8} y={getY(db) + 3} fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)" textAnchor="end">{db}</text>
        </g>
      ))}
      {INTER_OCTAVES.map((frequency) => (
        <line key={frequency} x1={getXByFrequency(frequency)} y1={PAD_TOP} x2={getXByFrequency(frequency)} y2={CHART_HEIGHT - PAD_BOTTOM} className="hearing-health-grid-line-inter" />
      ))}
      {OCTAVE_FREQUENCIES.map((frequency) => (
        <g key={frequency}>
          <line x1={getXByFrequency(frequency)} y1={PAD_TOP} x2={getXByFrequency(frequency)} y2={CHART_HEIGHT - PAD_BOTTOM} className="hearing-health-grid-line" />
          <text x={getXByFrequency(frequency)} y={CHART_HEIGHT - PAD_BOTTOM + 15} fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)" textAnchor="middle">
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
  const color = ear === "right" ? "var(--hh-ear-right)" : "var(--hh-ear-left)";
  const suffix = ear === "right" ? "right" : "left";
  const curves: Array<{ curve: CurveType; className: string }> = [
    { curve: "AC", className: `hearing-health-path-ac-${suffix}` },
    { curve: "BC", className: `hearing-health-path-bc-${suffix}` },
    { curve: "UCL", className: `hearing-health-path-ucl-${suffix}` },
  ];
  return (
    <>
      {curves.map(({ curve, className }) => {
        const points = thresholds[CURVE_KEYS[curve]];
        const path = buildPath(points);
        return (
          <g key={curve}>
            {path && <path d={path} className={className} />}
            {points.map((point, index) => point === null ? null : (
              <PointSymbol
                key={`${curve}-${index}`}
                curve={curve}
                ear={ear}
                point={point}
                x={getX(index)}
                y={getY(point.db)}
                color={color}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

interface ChartHover {
  x: number;
  y: number;
  frequency: number;
  db: number;
  hit: { curve: CurveType; point: AudiogramPoint } | null;
}

interface ChartMenu {
  x: number;
  y: number;
  frequencyIndex: number;
  db: number;
  hit: { curve: CurveType; frequencyIndex: number; point: AudiogramPoint } | null;
}

/** Points within this dB distance of the cursor count as hovered/targeted. */
const HIT_TOLERANCE_DB = 7;

function findPointHit(
  thresholds: EarThresholds,
  frequencyIndex: number,
  db: number,
): { curve: CurveType; frequencyIndex: number; point: AudiogramPoint } | null {
  let best: { curve: CurveType; frequencyIndex: number; point: AudiogramPoint } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const curve of ["AC", "BC", "UCL"] as const) {
    const point = thresholds[CURVE_KEYS[curve]][frequencyIndex];
    if (!point) continue;
    const distance = Math.abs(point.db - db);
    if (distance <= HIT_TOLERANCE_DB && distance < bestDistance) {
      bestDistance = distance;
      best = { curve, frequencyIndex, point };
    }
  }
  return best;
}

interface AudiogramChartProps {
  ear: EarSide;
  thresholds: EarThresholds;
  activeCurve: CurveType;
  showPictograms: boolean;
  showSpeechSpectrum: boolean;
  onThresholdChange: (frequencyIndex: number, db: number) => void;
  onRemovePoint: (curve: CurveType, frequencyIndex: number) => void;
  onSetMarker: (curve: CurveType, frequencyIndex: number, marker: AudiogramMarker) => void;
  onCopyCurve: (curve: CurveType) => void;
  onClearCurve: (curve: CurveType) => void;
}

export function AudiogramChart(props: AudiogramChartProps): React.JSX.Element {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<ChartHover | null>(null);
  const [menu, setMenu] = useState<ChartMenu | null>(null);
  // A mousedown that closes the menu must not fall through as an insert click.
  const suppressClickRef = useRef(false);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (): void => {
      suppressClickRef.current = true;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu, menu]);

  const onMouseMove = (event: React.MouseEvent<SVGSVGElement>): void => {
    if (menu) return;
    const svgRect = event.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const cursor = chartPointFromClient(svgRect, event.clientX, event.clientY);
    const hit = findPointHit(props.thresholds, cursor.frequencyIndex, cursor.db);
    setHover({
      x: event.clientX - containerRect.left,
      y: event.clientY - containerRect.top,
      frequency: FREQUENCIES[cursor.frequencyIndex],
      db: hit ? hit.point.db : cursor.db,
      hit: hit ? { curve: hit.curve, point: hit.point } : null,
    });
  };

  const onContextMenu = (event: React.MouseEvent<SVGSVGElement>): void => {
    event.preventDefault();
    const svgRect = event.currentTarget.getBoundingClientRect();
    const cursor = chartPointFromClient(svgRect, event.clientX, event.clientY);
    setHover(null);
    setMenu({
      x: event.clientX,
      y: event.clientY,
      frequencyIndex: cursor.frequencyIndex,
      db: cursor.db,
      hit: findPointHit(props.thresholds, cursor.frequencyIndex, cursor.db),
    });
  };

  const runMenuAction = (action: () => void): void => {
    closeMenu();
    action();
  };

  const menuTargetCurve = menu ? (menu.hit?.curve ?? props.activeCurve) : props.activeCurve;
  const menuCurveHasPoints = menu
    ? props.thresholds[CURVE_KEYS[menuTargetCurve]].some((point) => point !== null)
    : false;
  const earColor = props.ear === "right" ? "var(--hh-ear-right)" : "var(--hh-ear-left)";
  const tooltipFlipped = hover !== null
    && containerRef.current !== null
    && hover.x > containerRef.current.clientWidth - 120;

  return (
    <div className="hearing-health-chart-container" ref={containerRef}>
      <svg
        className="hearing-health-chart-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onContextMenu={onContextMenu}
      >
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
            strokeWidth={16}
            className="hearing-health-freq-hitarea"
            onClick={(event) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              // The hit line's own rect collapses to its drawn geometry, so the
              // conversion must use the SVG root rect for the viewBox scale.
              const svgBounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
              if (!svgBounds) return;
              props.onThresholdChange(index, thresholdFromClick(svgBounds, event.clientY));
            }}
          />
        ))}
      </svg>
      {hover && !menu && (
        <div
          className={`hearing-health-chart-tooltip${tooltipFlipped ? " flipped" : ""}`}
          style={{ left: hover.x, top: hover.y }}
          aria-hidden="true"
        >
          {hover.hit
            ? `${hover.hit.curve} (${hover.frequency}Hz, ${hover.db}dB)`
            : `${hover.frequency}Hz, ${hover.db}dB`}
        </div>
      )}
      {menu && createPortal(
        <div
          className="hearing-health-point-menu"
          role="menu"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 240)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 386)),
            color: "inherit",
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={Boolean(menu.hit)}
            onClick={() => runMenuAction(() => props.onThresholdChange(menu.frequencyIndex, menu.db))}
          >
            <span className="hearing-health-point-menu-icon" aria-hidden="true" />
            {t("hearingHealth.point.insert")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!menu.hit}
            onClick={() => {
              const hit = menu.hit;
              if (hit) runMenuAction(() => props.onRemovePoint(hit.curve, hit.frequencyIndex));
            }}
          >
            <span className="hearing-health-point-menu-icon" aria-hidden="true" />
            {t("hearingHealth.point.delete")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!menuCurveHasPoints}
            onClick={() => runMenuAction(() => props.onCopyCurve(menuTargetCurve))}
          >
            <span className="hearing-health-point-menu-icon" aria-hidden="true" />
            {t("hearingHealth.curve.copy")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!menuCurveHasPoints}
            onClick={() => runMenuAction(() => props.onClearCurve(menuTargetCurve))}
          >
            <span className="hearing-health-point-menu-icon" aria-hidden="true">
              <Trash2 size={13} strokeWidth={1.6} />
            </span>
            {t("hearingHealth.curve.delete")}
          </button>
          <div className="hearing-health-point-menu-rule" />
          {AUDIOGRAM_MARKERS.map((marker) => {
            const selected = menu.hit?.point.marker === marker;
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "selected" : ""}
                key={marker}
                disabled={!menu.hit}
                onClick={() => {
                  const hit = menu.hit;
                  if (hit) runMenuAction(() => props.onSetMarker(hit.curve, hit.frequencyIndex, marker));
                }}
              >
                <span
                  className="hearing-health-point-menu-icon marker"
                  style={{ color: earColor }}
                  aria-hidden="true"
                >
                  <MarkerPreview marker={marker} />
                </span>
                {t(MARKER_LABEL_KEYS[marker])}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
