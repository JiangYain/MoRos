// Static six-line Unicode block art for "COMPASS". The period is rendered as
// a separate accent-colored layer so it always follows the active theme.
const COMPASS_ART = [
  " ██████╗  ██████╗  ███╗   ███╗ ██████╗   █████╗  ███████╗ ███████╗",
  "██╔════╝ ██╔═══██╗ ████╗ ████║ ██╔══██╗ ██╔══██╗ ██╔════╝ ██╔════╝",
  "██║      ██║   ██║ ██╔████╔██║ ██████╔╝ ███████║ ███████╗ ███████╗",
  "██║      ██║   ██║ ██║╚██╔╝██║ ██╔═══╝  ██╔══██║ ╚════██║ ╚════██║",
  "╚██████╗ ╚██████╔╝ ██║ ╚═╝ ██║ ██║      ██║  ██║ ███████║ ███████║",
  " ╚═════╝  ╚═════╝  ╚═╝     ╚═╝ ╚═╝      ╚═╝  ╚═╝ ╚══════╝ ╚══════╝",
].join("\n");

const PERIOD_ART = ["", "", "", "", "██╗", "╚═╝"].join("\n");

export function Hero(): React.JSX.Element {
  return (
    <div className="hero">
      <div className="hero-inner">
        <h1 className="hero-ascii-title" aria-label="Compass.">
          <span className="hero-ascii-word" aria-hidden="true">
            <span className="hero-ascii-base">{COMPASS_ART}</span>
            <span className="hero-ascii-glow">{COMPASS_ART}</span>
          </span>
          <span className="hero-ascii-period" aria-hidden="true">{PERIOD_ART}</span>
        </h1>
      </div>
    </div>
  );
}
