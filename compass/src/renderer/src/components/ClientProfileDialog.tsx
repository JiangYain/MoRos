import { Check, Mars, Venus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import phonakLogo from "../assets/hearing-aid-phonak.svg";
import resoundLogo from "../assets/hearing-aid-resound.svg";
import signiaLogo from "../assets/hearing-aid-signia.svg";
import starkeyLogo from "../assets/hearing-aid-starkey.svg";
import widexLogo from "../assets/hearing-aid-widex.svg";
import {
  clientProfileDisplayName,
  clientRegistryKey,
  HEARING_AID_BRANDS,
  type ClientGender,
  type ClientHearingAidBrand,
  type ClientProfileDraft,
  type SelectableClientHearingAidBrand,
} from "./client-registry";

interface ClientProfileDialogProps {
  existingClients: string[];
  /** When set, the dialog edits this profile instead of creating a new one. */
  initialProfile?: ClientProfileDraft;
  onClose(): void;
  onSave(profile: ClientProfileDraft): void;
}

const EMPTY_PROFILE: ClientProfileDraft = {
  name: "",
  gender: null,
  age: null,
  contact: "",
  notes: "",
  hearingAidBrands: [],
};

const GENDER_OPTIONS: ClientGender[] = ["female", "male"];

const BRAND_LOGOS: Record<SelectableClientHearingAidBrand, string> = {
  phonak: phonakLogo,
  widex: widexLogo,
  signia: signiaLogo,
  resound: resoundLogo,
  starkey: starkeyLogo,
};

export function ClientProfileDialog({
  existingClients,
  initialProfile,
  onClose,
  onSave,
}: ClientProfileDialogProps): React.JSX.Element {
  const { t } = useI18n();
  const editing = initialProfile !== undefined;
  const [profile, setProfile] = useState<ClientProfileDraft>(initialProfile
    ? { ...initialProfile, hearingAidBrands: [...initialProfile.hearingAidBrands] }
    : EMPTY_PROFILE);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const displayName = clientProfileDisplayName(profile);
  const duplicate = useMemo(() => {
    const key = clientRegistryKey(displayName);
    if (!key) return false;
    // While editing, keeping the client's own name is not a collision.
    const selfKey = initialProfile ? clientRegistryKey(initialProfile.name) : null;
    return existingClients.some((client) => {
      const clientKey = clientRegistryKey(client);
      return clientKey === key && clientKey !== selfKey;
    });
  }, [displayName, existingClients, initialProfile]);
  const canSave = Boolean(displayName) && !duplicate;

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  const update = <Key extends keyof ClientProfileDraft>(
    field: Key,
    value: ClientProfileDraft[Key],
  ): void => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const selectBrand = (brand: ClientHearingAidBrand): void => {
    setProfile((current) => ({
      ...current,
      hearingAidBrands: [brand],
    }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;

    if (event.key === "Enter") {
      if (target.tagName === "INPUT") {
        const inputType = (target as HTMLInputElement).type;
        if (inputType === "checkbox" || inputType === "radio") {
          event.preventDefault();
          (target as HTMLInputElement).click();
          return;
        }
        if (inputType === "text" || inputType === "number" || inputType === "tel") {
          event.preventDefault();
          if (canSave) {
            onSave(profile);
          }
          return;
        }
      }
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "number") {
        return;
      }

      event.preventDefault();

      if (!formRef.current) return;
      const focusableElements = Array.from(
        formRef.current.querySelectorAll<HTMLElement>(
          'input[type="text"], input[type="number"], input[type="tel"], input[type="radio"], input[type="checkbox"], button:not([disabled])'
        )
      );

      const currentIndex = focusableElements.indexOf(target);
      if (currentIndex === -1) return;

      const direction = event.key === "ArrowDown" ? 1 : -1;
      let nextIndex = currentIndex + direction;

      if (nextIndex < 0) {
        nextIndex = focusableElements.length - 1;
      } else if (nextIndex >= focusableElements.length) {
        nextIndex = 0;
      }

      focusableElements[nextIndex]?.focus();
    }
  };

  return (
    <div
      className="client-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <form
        ref={formRef}
        className="client-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave(profile);
        }}
      >
        <header>
          <h2 id={titleId}>{t(editing ? "client.editProfileTitle" : "client.newProfile")}</h2>
          <button type="button" className="client-dialog-close" aria-label={t("common.close")} onClick={onClose}>
            <X size={15} strokeWidth={1.65} />
          </button>
        </header>

        <div className="client-profile-body">
          <div className="client-profile-compact-grid">
            <label className="client-profile-field client-profile-name">
              <span>{t("client.name")}</span>
              <input
                autoFocus
                value={profile.name}
                placeholder={t("client.namePlaceholder")}
                autoComplete="name"
                onChange={(event) => update("name", event.target.value)}
              />
            </label>

            <fieldset className="client-profile-field client-profile-gender">
              <legend>{t("client.gender")}</legend>
              <div data-selected-gender={profile.gender}>
                <span className="client-profile-gender-thumb" aria-hidden="true" />
                {GENDER_OPTIONS.map((option) => (
                  <label key={option} data-gender-option={option}>
                    <input
                      type="radio"
                      name="client-gender"
                      value={option}
                      checked={profile.gender === option}
                      onChange={() => update("gender", option)}
                    />
                    {option === "female" ? (
                      <Venus className="client-profile-gender-symbol" size={12} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Mars className="client-profile-gender-symbol" size={12} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <span>{t(option === "female" ? "client.female" : "client.male")}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="client-profile-field client-profile-age-input">
              <span>{t("client.age")}</span>
              <input
                type="number"
                min={0}
                max={130}
                inputMode="numeric"
                value={profile.age ?? ""}
                aria-label={t("client.agePlaceholder")}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  update("age", Number.isFinite(value) ? Math.min(130, Math.max(0, Math.round(value))) : null);
                }}
              />
            </label>

            <div className="client-profile-contact-row">
              <label className="client-profile-field client-profile-contact">
                <span>{t("client.contact")}</span>
                <input
                  value={profile.contact}
                  placeholder={t("client.contactPlaceholder")}
                  autoComplete="tel"
                  onChange={(event) => update("contact", event.target.value)}
                />
              </label>

              <label className="client-profile-field client-profile-notes">
                <span>{t("client.notes")}</span>
                <input
                  value={profile.notes}
                  placeholder={t("client.notesPlaceholder")}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </label>
            </div>

            <fieldset className="client-profile-field client-profile-brands">
              <legend>{t("client.brand")} <small>{t("client.singleSelect")}</small></legend>
              <div>
                <label className="client-profile-brand-none" title={t("client.brandNone")}>
                  <input
                    type="radio"
                    name="client-hearing-aid-brand"
                    value=""
                    checked={profile.hearingAidBrands.length === 0}
                    onChange={() => update("hearingAidBrands", [])}
                  />
                  <span>{t("client.brandNone")}</span>
                  <span className="client-profile-brand-check" aria-hidden="true">
                    <Check size={9} strokeWidth={2.4} />
                  </span>
                </label>
                {HEARING_AID_BRANDS.map((brand) => (
                  <label key={brand.value} title={brand.label}>
                    <input
                      type="radio"
                      name="client-hearing-aid-brand"
                      value={brand.value}
                      aria-label={brand.label}
                      checked={profile.hearingAidBrands.includes(brand.value)}
                      onChange={() => selectBrand(brand.value)}
                    />
                    <img
                      className={`client-profile-brand-logo brand-${brand.value}`}
                      src={BRAND_LOGOS[brand.value]}
                      alt={brand.label}
                      draggable={false}
                    />
                    <span className="client-profile-brand-check" aria-hidden="true">
                      <Check size={9} strokeWidth={2.4} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <footer>
          <p className={duplicate ? "client-profile-status error" : "client-profile-status"} aria-live="polite">
            {duplicate
              ? t("client.exists", { name: displayName })
              : !displayName
                ? t("client.nameRequired")
                : editing
                  ? ""
                  : t("client.willCreate", { name: displayName })}
          </p>
          <div>
            <button type="button" className="client-profile-cancel" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="client-profile-save" disabled={!canSave}>
              {t(editing ? "common.save" : "client.createProfile")}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
