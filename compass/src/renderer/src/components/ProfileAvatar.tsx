import { profileInitials } from "@shared/profile";
import { useCompass } from "../store";
import { useI18n } from "../i18n";

export function ProfileAvatar({ className = "" }: { className?: string }): React.JSX.Element {
  const avatar = useCompass((state) => state.profileAvatar);
  const name = useCompass((state) => state.profileName);
  const { t } = useI18n();
  const initials = profileInitials(name);
  // Neutral fallback when no name is set yet — never a hardcoded identity.
  const fallback = initials || t("settings.profileAvatarFallback");
  const altText = name ? name : t("settings.profileAvatarAlt");

  return (
    <span className={`profile-avatar${className ? ` ${className}` : ""}`}>
      {avatar ? <img src={avatar} alt={altText} /> : <span aria-hidden="true">{fallback}</span>}
    </span>
  );
}
