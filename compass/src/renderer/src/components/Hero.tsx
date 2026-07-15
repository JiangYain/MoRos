// Static six-line Unicode block art for "COMPASS." (including the period).
// Rendered identically in two stacked layers (base + glow) so they overlay
// pixel-perfectly. No typewriter, no random chars, no WebGL.
const COMPASS_ART = [
  " ██████╗  ██████╗  ███╗   ███╗ ██████╗   █████╗  ███████╗ ███████╗",
  "██╔════╝ ██╔═══██╗ ████╗ ████║ ██╔══██╗ ██╔══██╗ ██╔════╝ ██╔════╝",
  "██║      ██║   ██║ ██╔████╔██║ ██████╔╝ ███████║ ███████╗ ███████╗",
  "██║      ██║   ██║ ██║╚██╔╝██║ ██╔═══╝  ██╔══██║ ╚════██║ ╚════██║",
  "╚██████╗ ╚██████╔╝ ██║ ╚═╝ ██║ ██║      ██║  ██║ ███████║ ███████║ ██╗",
  " ╚═════╝  ╚═════╝  ╚═╝     ╚═╝ ╚═╝      ╚═╝  ╚═╝ ╚══════╝ ╚══════╝ ╚═╝",
].join("\n");

export function Hero(): React.JSX.Element {
  return (
    <div className="hero">
      <div className="hero-inner">
        <h1 className="hero-ascii-title" aria-label="Compass.">
          <span className="hero-ascii-base" aria-hidden="true">{COMPASS_ART}</span>
          <span className="hero-ascii-glow" aria-hidden="true">{COMPASS_ART}</span>
        </h1>
      </div>
    </div>
  );
}
