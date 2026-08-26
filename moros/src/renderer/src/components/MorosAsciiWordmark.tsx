const MOROS_ART = [
  "███╗   ███╗  ██████╗  ██████╗   ██████╗  ███████╗",
  "████╗ ████║ ██╔═══██╗ ██╔══██╗ ██╔═══██╗ ██╔════╝",
  "██╔████╔██║ ██║   ██║ ██████╔╝ ██║   ██║ ███████╗",
  "██║╚██╔╝██║ ██║   ██║ ██╔══██╗ ██║   ██║ ╚════██║",
  "██║ ╚═╝ ██║ ╚██████╔╝ ██║  ██║ ╚██████╔╝ ███████║",
  "╚═╝     ╚═╝  ╚═════╝  ╚═╝  ╚═╝  ╚═════╝  ╚══════╝",
].join("\n");

const PERIOD_ART = ["", "", "", "", "██╗", "╚═╝"].join("\n");

interface MorosAsciiWordmarkProps {
  className?: string;
}

export function MorosAsciiWordmark({
  className = "",
}: MorosAsciiWordmarkProps): React.JSX.Element {
  return (
    <span
      className={`moros-ascii-wordmark ${className}`.trim()}
      role="img"
      aria-label="Moros."
    >
      <span className="moros-ascii-word" aria-hidden="true">
        <span className="moros-ascii-base">{MOROS_ART}</span>
        <span className="moros-ascii-glow">{MOROS_ART}</span>
      </span>
      <span className="moros-ascii-period" aria-hidden="true">{PERIOD_ART}</span>
    </span>
  );
}
