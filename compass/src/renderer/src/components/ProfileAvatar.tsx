import { useCompass } from "../store";

export function ProfileAvatar({ className = "" }: { className?: string }): React.JSX.Element {
  const avatar = useCompass((state) => state.profileAvatar);

  return (
    <span className={`profile-avatar${className ? ` ${className}` : ""}`}>
      {avatar ? <img src={avatar} alt="ChordJiang" /> : <span aria-hidden="true">CJ</span>}
    </span>
  );
}
