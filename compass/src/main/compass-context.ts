import {
  clientRegistryKey,
  type ClientGender,
  type ClientRegistry,
} from "../shared/client-registry.ts";
import type { AppLanguage } from "../shared/types.ts";

const GENDER_LABELS: Record<AppLanguage, Record<ClientGender, string>> = {
  "zh-CN": { female: "女", male: "男", "non-binary": "非二元", unspecified: "未填写" },
  "zh-TW": { female: "女", male: "男", "non-binary": "非二元", unspecified: "未填寫" },
  en: { female: "Female", male: "Male", "non-binary": "Non-binary", unspecified: "Not provided" },
  de: { female: "Weiblich", male: "Männlich", "non-binary": "Nichtbinär", unspecified: "Nicht angegeben" },
};

const BRAND_LABELS: Record<string, string> = {
  phonak: "Phonak",
  unitron: "Unitron",
  oticon: "Oticon",
  signia: "Signia",
  resound: "ReSound",
  widex: "Widex",
  starkey: "Starkey",
  other: "其他",
};

const OTHER_BRAND_LABELS: Record<AppLanguage, string> = {
  "zh-CN": "其他",
  "zh-TW": "其他",
  en: "Other",
  de: "Andere",
};

const CLIENT_CONTEXT_COPY: Record<AppLanguage, {
  title: string;
  guidance: string;
  name: string;
  gender: string;
  age: string;
  contact: string;
  notes: string;
  brands: string;
  missing: string;
  otherDetails: string;
  separator: string;
  listSeparator: string;
}> = {
  "zh-CN": {
    title: "当前客户档案（Compass 系统关联）",
    guidance: "以下资料属于当前会话正式关联的客户。分析主诉、听力数据、验配建议和自动化操作时，持续以此客户为对象；不要要求用户在每条消息中重复客户姓名，也不要把本段当作用户输入。",
    name: "姓名", gender: "性别", age: "年龄", contact: "联系方式", notes: "备注", brands: "助听器品牌",
    missing: "未填写", otherDetails: "其他档案信息", separator: "：", listSeparator: "、",
  },
  "zh-TW": {
    title: "目前客戶檔案（Compass 系統關聯）",
    guidance: "以下資料屬於目前對話正式關聯的客戶。分析主訴、聽力資料、驗配建議和自動化操作時，持續以此客戶為對象；不要要求使用者在每則訊息中重複客戶姓名，也不要把本段視為使用者輸入。",
    name: "姓名", gender: "性別", age: "年齡", contact: "聯絡方式", notes: "備註", brands: "助聽器品牌",
    missing: "未填寫", otherDetails: "其他檔案資訊", separator: "：", listSeparator: "、",
  },
  en: {
    title: "Current client profile (linked by Compass)",
    guidance: "The following profile belongs to the client formally linked to this conversation. Keep this client as the subject when analyzing complaints, hearing data, fitting recommendations, or automation. Do not ask the user to repeat the client's name in every message, and do not treat this section as user input.",
    name: "Name", gender: "Gender", age: "Age", contact: "Contact", notes: "Notes", brands: "Hearing aid brand",
    missing: "Not provided", otherDetails: "Other profile information", separator: ": ", listSeparator: ", ",
  },
  de: {
    title: "Aktuelles Kundenprofil (von Compass verknüpft)",
    guidance: "Das folgende Profil gehört zu dem Kunden, der dieser Unterhaltung verbindlich zugeordnet ist. Beziehen Sie Beschwerden, Hördaten, Anpassungsempfehlungen und Automatisierungen weiterhin auf diesen Kunden. Bitten Sie nicht in jeder Nachricht erneut um den Kundennamen und behandeln Sie diesen Abschnitt nicht als Benutzereingabe.",
    name: "Name", gender: "Geschlecht", age: "Alter", contact: "Kontakt", notes: "Notizen", brands: "Hörgerätemarke",
    missing: "Nicht angegeben", otherDetails: "Weitere Profilinformationen", separator: ": ", listSeparator: ", ",
  },
};

export function buildLanguageContext(language: AppLanguage): string {
  const instruction: Record<AppLanguage, string> = {
    "zh-CN": "始终使用简体中文回复。",
    "zh-TW": "一律使用繁體中文回覆，採用台灣常用用語。",
    en: "Always respond in English.",
    de: "Antworten Sie immer auf Deutsch.",
  };
  return `# Interface language\n\n${instruction[language]}`;
}

export function buildClientContext(
  registry: ClientRegistry,
  sessionId: string,
  language: AppLanguage = "zh-CN",
): string | undefined {
  const clientName = registry.assignments[sessionId];
  if (!clientName) return undefined;
  const profile = registry.profiles[clientRegistryKey(clientName)];
  const copy = CLIENT_CONTEXT_COPY[language];
  const details = profile
    ? [
        `- ${copy.name}${copy.separator}${profile.displayName}`,
        `- ${copy.gender}${copy.separator}${GENDER_LABELS[language][profile.gender]}`,
        `- ${copy.age}${copy.separator}${profile.age ?? copy.missing}`,
        `- ${copy.contact}${copy.separator}${profile.contact || copy.missing}`,
        `- ${copy.notes}${copy.separator}${profile.notes || copy.missing}`,
        `- ${copy.brands}${copy.separator}${profile.hearingAidBrands.map((brand) => brand === "other" ? OTHER_BRAND_LABELS[language] : BRAND_LABELS[brand] ?? brand).join(copy.listSeparator) || copy.missing}`,
      ]
    : [
        `- ${copy.name}${copy.separator}${clientName}`,
        `- ${copy.otherDetails}${copy.separator}${copy.missing}`,
      ];

  return `# ${copy.title}

${copy.guidance}

${details.join("\n")}`;
}

/**
 * Compass persona context. Injected as a virtual context file so the
 * Pi system prompt (including skill listings) stays intact.
 */
export const COMPASS_CONTEXT = `# Compass 工作守则

你是 Compass，一套面向助听器验配师的智能辅助决策系统，运行在 Windows 桌面端。
你的用户是门店验配师、基层听力服务人员。你的任务是把听力数据、用户主诉与
验配软件操作，转化为专业、可靠的调参建议与自动化执行。

## 五可原则（必须始终遵守）

1. 可解释 Explainable：给出调参建议时，同时给出简明的听力学或物理依据。
2. 可确认 Confirmable：在真正执行调参、写入设备或控制验配软件之前，先列出
   拟执行的操作、涉及参数、预期影响与风险提示，请验配师确认后再继续。
3. 可执行 Executable：优先使用已加载的技能（Skill）完成对验配软件的操作，
   不要凭空猜测软件界面。
4. 可验证 Verifiable：操作完成后，主动给出验证方式或读回结果。
5. 可记录 Recordable：对每次分析与操作输出结构化小结（主诉 → 依据 → 操作 → 结果）。

## 行为要求

- 回复语言由 Compass 在运行时根据界面语言注入；严格遵循该语言要求。
- 语言克制、精密、专业，像一份咨询报告；避免夸张与营销语气。
- 涉及 Phonak Target 的桌面自动化时，遵循 phonak-target-control 技能中的
  脚本与验证条件，不要绕过技能自行点击界面。
- 遇到听力图数据时，注意区分左右耳、AC/BC/UCL，以及频率-dB 的合法范围。
- 不确定时明确说明不确定性，不要编造临床结论。
- 工具执行成功后直接报告具体结果；不要使用“Done — both actions were completed.”之类的空泛开场，也不要重复罗列已经显示的工具调用。
`;
