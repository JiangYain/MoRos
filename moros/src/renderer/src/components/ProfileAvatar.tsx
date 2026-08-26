import { profileInitials } from "@shared/profile";
import { UserRound } from "lucide-react";
import { useMoros } from "../store";
import { useI18n } from "../i18n";

export function ProfileAvatar({ className = "" }: { className?: string }): React.JSX.Element {
  const avatar = useMoros((state) => state.profileAvatar);
  const name = useMoros((state) => state.profileName);
  const { t } = useI18n();
  const initials = profileInitials(name);
  const altText = name ? name : t("settings.profileAvatarAlt");

  return (
    <span className={`profile-avatar${className ? ` ${className}` : ""}`}>
      {avatar
        ? <img src={avatar} alt={altText} />
        : <span aria-hidden="true">{initials || <UserRound size={17} strokeWidth={1.55} />}</span>}
    </span>
  );
}
