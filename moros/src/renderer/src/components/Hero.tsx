import { MorosAsciiWordmark } from "./MorosAsciiWordmark";

export function Hero(): React.JSX.Element {
  return (
    <div className="hero">
      <div className="hero-inner">
        <h1 className="hero-ascii-title">
          <MorosAsciiWordmark />
        </h1>
      </div>
    </div>
  );
}
