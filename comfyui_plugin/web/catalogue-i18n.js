import { isVietnamese } from "./i18n.js";

let dictionaries = {};
let loaded = false;

export async function loadCatalogueTranslations(api) {
  if (!isVietnamese || loaded) return;
  const response = await api.fetchApi("/pose_character_atlas/i18n/vi");
  if (!response.ok) throw new Error("Không thể tải bản dịch thư viện");
  const data = await response.json();
  for (const name of ["terms", "poses", "costumes"]) {
    if (!data[name] || typeof data[name] !== "object" || Array.isArray(data[name])) {
      throw new Error("Bản dịch thư viện không hợp lệ");
    }
  }
  dictionaries = data;
  loaded = true;
}

export function catalogueTerm(raw) {
  const translated = isVietnamese && dictionaries.terms?.[raw];
  return typeof translated === "string" ? translated : raw;
}

export function catalogueTitle(lib, item, raw) {
  if (!isVietnamese) return raw;
  const key = lib === "pose" ? item.id?.replace(/_(front|high|low|side|diag)$/, "") : item.id;
  const translated = dictionaries[lib === "pose" ? "poses" : "costumes"]?.[key];
  return lib !== "portrait" && typeof translated === "string" ? translated : catalogueTerm(raw);
}

export function catalogueSearchText(lib, item, rawTitle) {
  if (!isVietnamese) return "";
  return [catalogueTitle(lib, item, rawTitle), ...["体系", "分类", "一级分类", "角度", "发长", "分区", "标题", "发型名称"].map((field) => catalogueTerm(item[field] || "")), ...(item["标签"] || []).map(catalogueTerm)].join(" ");
}
