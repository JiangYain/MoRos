import { MAX_PROFILE_HANDLE_LENGTH, MAX_PROFILE_NAME_LENGTH, normalizeProfileHandle, normalizeProfileName } from "@shared/profile";
import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { useCompass } from "../../store";
import { ProfileAvatar } from "../ProfileAvatar";
import { prepareProfileImage } from "../profile-image";

export function ProfileSettings(): React.JSX.Element {
  const { t } = useI18n();
  const profileAvatar = useCompass((state) => state.profileAvatar);
  const setProfileAvatar = useCompass((state) => state.setProfileAvatar);
  const setError = useCompass((state) => state.setError);
  const profileName = useCompass((state) => state.profileName);
  const profileHandle = useCompass((state) => state.profileHandle);
  const setProfileIdentity = useCompass((state) => state.setProfileIdentity);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState(profileName);
  const [handleDraft, setHandleDraft] = useState(profileHandle);

  useEffect(() => { setNameDraft(profileName); setHandleDraft(profileHandle); }, [profileName, profileHandle]);
  const commitIdentity = (): void => {
    const name = normalizeProfileName(nameDraft);
    const handle = normalizeProfileHandle(handleDraft);
    setNameDraft(name);
    setHandleDraft(handle);
    if (name !== profileName || handle !== profileHandle) setProfileIdentity(name, handle);
  };
  const uploadAvatar = async (file: File | undefined): Promise<void> => {
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    try {
      setProfileAvatar(await prepareProfileImage(file, { read: t("error.imageRead"), type: t("error.imageType"), size: t("error.imageSize"), dimensions: t("error.imageDimensions"), processing: t("error.imageProcessing") }));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  };

  return (
    <div className="settings-page settings-profile-page" id="settings-page-profile">
      <header className="settings-page-head"><span className="settings-eyebrow">{t("settings.category.personal")}</span><h1>{t("settings.profile")}</h1><p>{t("settings.nav.profileDescription")}</p></header>
      <section className="settings-profile-identity" id="settings-profile-identity" aria-label={t("settings.profileIdentity")}>
        <button type="button" className="settings-profile-avatar-button" aria-label={t("settings.uploadPhoto")} disabled={avatarBusy} onClick={() => avatarInput.current?.click()}><ProfileAvatar className="settings-profile-avatar" /><span className="settings-profile-avatar-edit" aria-hidden="true"><Camera size={15} strokeWidth={1.65} /></span></button>
        <input ref={avatarInput} className="settings-profile-avatar-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadAvatar(event.currentTarget.files?.[0])} />
        <div className="settings-profile-photo-actions">
          <button type="button" onClick={() => avatarInput.current?.click()}>{avatarBusy ? t("settings.processing") : profileAvatar ? t("settings.changePhoto") : t("settings.addPhoto")}</button>
          {profileAvatar && <button type="button" className="remove" onClick={() => setProfileAvatar(null)}><Trash2 size={12} strokeWidth={1.6} /> {t("common.remove")}</button>}
        </div>
        <div className="settings-profile-inputs">
          <div className="settings-profile-input"><label htmlFor="profile-name-input">{t("settings.profileName")}</label><input id="profile-name-input" type="text" value={nameDraft} maxLength={MAX_PROFILE_NAME_LENGTH} placeholder={t("settings.profileNamePlaceholder")} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitIdentity} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
          <div className="settings-profile-input"><label htmlFor="profile-handle-input">{t("settings.profileHandle")}</label><input id="profile-handle-input" type="text" value={handleDraft} maxLength={MAX_PROFILE_HANDLE_LENGTH} placeholder={t("settings.profileHandlePlaceholder")} onChange={(event) => setHandleDraft(event.target.value)} onBlur={commitIdentity} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
        </div>
      </section>
    </div>
  );
}
