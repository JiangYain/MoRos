interface Props {
  size?: number;
  className?: string;
}

/** Compass wordmark glyph (from the brand HTML). */
export function CompassLogo({ size = 20, className }: Props): React.JSX.Element {
  return (
    <svg
      className={`compass-logo${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 732 732"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Compass"
      focusable="false"
    >
      <g transform="translate(-78,-133.5) translate(0,499.5) scale(1,0.8541423571) translate(0,-499.5)">
        <g className="compass-logo-base">
          <path
            d="M 280 71 L 78 214 L 78 928 L 552 928 L 552 854 L 169 852 L 299 722 L 603 722 L 608 695 L 307 694 L 307 316 L 280 316 L 280 702 L 152 829 L 152 290 L 552 289 L 552 215 L 128 213 L 288 98 L 754 98 L 806 71 Z"
            fill="currentColor"
          />
        </g>
        <g className="compass-logo-accent">
          <g className="compass-logo-accent-reveal">
            <path
              d="M 810 103 L 594 215 L 597 287 L 716 229 L 594 927 L 666 927 L 810 783 L 807 700 L 688 803 Z"
              fill="#D94632"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
