import { useI18n } from "../i18n";

// 独立的空状态骨架：保留侧边栏（由 App 布局决定），仅展示本地化标题与克制说明。
// 不伪造医疗数据、管理功能、API 或后端存储。
export function HearingHealthWorkspace(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <section className="hearing-health-workspace" aria-labelledby="hearing-health-title">
      <div className="hearing-health-inner">
        <h1 id="hearing-health-title" className="hearing-health-title">{t("hearingHealth.title")}</h1>
        <p className="hearing-health-description">{t("hearingHealth.description")}</p>
      </div>
    </section>
  );
}
