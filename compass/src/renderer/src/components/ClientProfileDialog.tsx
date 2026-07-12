import { X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  clientProfileDisplayName,
  HEARING_AID_BRANDS,
  normalizeClientName,
  type ClientGender,
  type ClientHearingAidBrand,
  type ClientProfileDraft,
} from "./client-registry";

interface ClientProfileDialogProps {
  existingClients: string[];
  onClose(): void;
  onSave(profile: ClientProfileDraft): void;
}

const EMPTY_PROFILE: ClientProfileDraft = {
  name: "",
  gender: "unspecified",
  age: null,
  contact: "",
  hearingAidBrands: [],
};

const GENDER_OPTIONS: Array<{ value: ClientGender; label: string }> = [
  { value: "female", label: "女" },
  { value: "male", label: "男" },
  { value: "non-binary", label: "其他" },
  { value: "unspecified", label: "未说明" },
];

export function ClientProfileDialog({
  existingClients,
  onClose,
  onSave,
}: ClientProfileDialogProps): React.JSX.Element {
  const [profile, setProfile] = useState<ClientProfileDraft>(EMPTY_PROFILE);
  const titleId = useId();
  const helpId = useId();
  const displayName = clientProfileDisplayName(profile);
  const duplicate = useMemo(() => {
    const key = normalizeClientName(displayName).toLocaleLowerCase("zh-CN");
    return Boolean(key) && existingClients.some(
      (client) => normalizeClientName(client).toLocaleLowerCase("zh-CN") === key,
    );
  }, [displayName, existingClients]);
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

  const toggleBrand = (brand: ClientHearingAidBrand): void => {
    setProfile((current) => ({
      ...current,
      hearingAidBrands: current.hearingAidBrands.includes(brand)
        ? current.hearingAidBrands.filter((candidate) => candidate !== brand)
        : [...current.hearingAidBrands, brand],
    }));
  };

  return (
    <div
      className="client-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <form
        className="client-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave(profile);
        }}
      >
        <header>
          <div>
            <span>CLIENT PROFILE</span>
            <h2 id={titleId}>新建客户档案</h2>
            <p id={helpId}>记录验配工作所需的核心客户信息。</p>
          </div>
          <button type="button" className="client-dialog-close" aria-label="关闭" onClick={onClose}>
            <X size={15} strokeWidth={1.65} />
          </button>
        </header>

        <div className="client-profile-body">
          <div className="client-profile-compact-grid">
            <label className="client-profile-field client-profile-name">
              <span>姓名</span>
              <input
                autoFocus
                value={profile.name}
                placeholder="输入客户姓名"
                autoComplete="name"
                onChange={(event) => update("name", event.target.value)}
              />
            </label>

            <label className="client-profile-field client-profile-age-input">
              <span>年龄</span>
              <input
                type="number"
                min={0}
                max={130}
                inputMode="numeric"
                value={profile.age ?? ""}
                placeholder="可选"
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  update("age", Number.isFinite(value) ? Math.min(130, Math.max(0, Math.round(value))) : null);
                }}
              />
            </label>

            <fieldset className="client-profile-field client-profile-gender">
              <legend>性别</legend>
              <div>
                {GENDER_OPTIONS.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="client-gender"
                      value={option.value}
                      checked={profile.gender === option.value}
                      onChange={() => update("gender", option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="client-profile-field client-profile-contact">
              <span>联系方式</span>
              <input
                value={profile.contact}
                placeholder="手机号、邮箱或其他联系方式"
                autoComplete="tel"
                onChange={(event) => update("contact", event.target.value)}
              />
            </label>

            <fieldset className="client-profile-field client-profile-brands">
              <legend>助听器品牌 <small>可多选</small></legend>
              <div>
                {HEARING_AID_BRANDS.map((brand) => (
                  <label key={brand.value}>
                    <input
                      type="checkbox"
                      checked={profile.hearingAidBrands.includes(brand.value)}
                      onChange={() => toggleBrand(brand.value)}
                    />
                    <span>{brand.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <footer>
          <p className={duplicate ? "client-profile-status error" : "client-profile-status"} aria-live="polite">
            {duplicate
              ? `“${displayName}”已存在`
              : displayName
                ? `将创建“${displayName}”的客户档案`
                : "姓名为必填项"}
          </p>
          <div>
            <button type="button" className="client-profile-cancel" onClick={onClose}>取消</button>
            <button type="submit" className="client-profile-save" disabled={!canSave}>创建档案</button>
          </div>
        </footer>
      </form>
    </div>
  );
}
