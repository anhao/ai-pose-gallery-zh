import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { t, isVietnamese, nodeTitles, localizeNode } from "./i18n.js";
import { loadCatalogueTranslations, catalogueTerm, catalogueTitle, catalogueSearchText } from "./catalogue-i18n.js";

const LIBRARIES = {
  pose: {
    key: "pose",
    label: t("姿势库 (1,439)", "Thư viện tư thế (1,439)"),
    shortLabel: t("姿势", "Tư thế"),
    defaultId: "full_single_P001_front",
    titleField: "姿势名称",
    primaryField: "分类",
    secondaryField: "角度",
    primaryPlaceholder: t("全部动作分类", "Tất cả loại động tác"),
    secondaryPlaceholder: t("全部视角", "Tất cả góc nhìn"),
  },
  costume: {
    key: "costume",
    label: t("服装库 (3,224)", "Thư viện trang phục (3,224)"),
    shortLabel: t("服装", "Trang phục"),
    defaultId: "SPR-0001",
    titleField: "服装名称",
    primaryField: "一级分类",
    secondaryField: "分类",
    primaryPlaceholder: t("全部 · 现实 / 二次元", "Tất cả · Thực tế / Anime"),
    secondaryPlaceholder: t("全部服装分类", "Tất cả loại trang phục"),
  },
  portrait: {
    key: "portrait",
    label: t("人像库 (1,499)", "Thư viện chân dung (1,499)"),
    shortLabel: t("人像", "Chân dung"),
    defaultId: "f71f980dde3",
    titleField: "发型名称",
    primaryField: "发长",
    secondaryField: "分区",
    primaryPlaceholder: t("全部发长", "Tất cả độ dài tóc"),
    secondaryPlaceholder: t("全部分区", "Tất cả nhóm"),
  },
};

const NODE_LIB_MAP = {
  PoseGalleryNode: "pose",
  CostumeGalleryNode: "costume",
  PortraitGalleryNode: "portrait",
  CharacterRecipeNode: "recipe",
};

const catalogueCache = {};
const PAGE_SIZE = 60;

function injectStylesheet() {
  if (document.getElementById("pca-comfy-styles")) return;
  const link = document.createElement("link");
  link.id = "pca-comfy-styles";
  link.rel = "stylesheet";
  link.href = new URL("./style.css", import.meta.url).href;
  document.head.appendChild(link);
}

async function fetchCatalogue(lib) {
  await loadCatalogueTranslations(api);
  if (catalogueCache[lib]) return catalogueCache[lib];
  const resp = await api.fetchApi(
    `/pose_character_atlas/catalogue?library=${encodeURIComponent(lib)}`,
    isVietnamese ? { headers: { "Accept-Language": "vi" } } : undefined
  );
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    throw new Error(t(`加载 ${lib} 图库失败: HTTP ${resp.status}`, `Không thể tải thư viện ${lib}: HTTP ${resp.status}`) + (typeof detail.error === "string" ? ` · ${detail.error}` : ""));
  }
  const data = await resp.json();
  catalogueCache[lib] = (data.items || []).map((item) => lib === "costume" ? { ...item, 一级分类: item["一级分类"] || "现实" } : item);
  return catalogueCache[lib];
}

function getThumbUrl(lib, id, relPath, useDepth = false) {
  if (!relPath && lib === "costume") relPath = catalogueCache.costume?.find((r) => r.id === id)?.缩略图;
  if (lib === "costume" && /^charadb-O\d{3}$/.test(id)) return `https://charadb-2fi.pages.dev/thumb/${id.slice(8)}.webp`;
  if (lib === "costume" && relPath?.startsWith("https://ai-costume-anime-gallery.pages.dev/")) return relPath;
  const depthParam = lib === "pose" && useDepth ? "&depth=1" : "";
  if (relPath) {
    return `/pose_character_atlas/image?path=${encodeURIComponent(relPath)}${depthParam}`;
  }
  return `/pose_character_atlas/image?library=${encodeURIComponent(lib)}&id=${encodeURIComponent(id)}&kind=thumb${depthParam}`;
}

function getRawItemTitle(lib, item) {
  const cfg = LIBRARIES[lib];
  return (
    item[cfg.titleField] ||
    item["标题"] ||
    item["姿势名称"] ||
    item["服装名称"] ||
    item["发型名称"] ||
    item.id
  );
}

function getItemTitle(lib, item) {
  return catalogueTitle(lib, item, getRawItemTitle(lib, item));
}

function findWidget(node, name) {
  return (node.widgets || []).find((w) => w.name === name);
}

function setWidgetValue(node, name, value) {
  const w = findWidget(node, name);
  if (!w) return;
  w.value = value;
  if (typeof w.callback === "function") {
    w.callback(value);
  }
  app.graph.setDirtyCanvas(true, true);
}

const NSFW_POSE_SYSTEMS = new Set(["全身单人・性感系", "双人缠绵"]);
const NSFW_COSTUME_CATEGORIES = new Set(["内衣・睡衣", "性感穿搭"]);

function isItemNsfw(lib, item) {
  if (lib === "pose") return NSFW_POSE_SYSTEMS.has(item["体系"]);
  if (lib === "costume") return Boolean(item["敏感"]) || NSFW_COSTUME_CATEGORIES.has(item["分类"]);
  return false;
}

class PoseAtlasModal {
  constructor() {
    this.backdrop = null;
    this.activeLib = "pose";
    this.targetNode = null;
    this.mode = "single"; // "single" | "recipe"
    this.safeMode = true;
    this.useDepth = false;
    this.searchQuery = "";
    this.primaryFilter = "";
    this.secondaryFilter = "";
    this.sourceFilter = "";
    this.page = 1;
    this.costumeView = "front";
    this.recipeSelection = {
      portrait: LIBRARIES.portrait.defaultId,
      costume: LIBRARIES.costume.defaultId,
      pose: LIBRARIES.pose.defaultId,
    };
  }

  async open({ node = null, initialLib = "pose", mode = "single" } = {}) {
    injectStylesheet();
    this.targetNode = node;
    this.mode = mode;
    this.activeLib = initialLib;
    this.page = 1;

    if (node) {
      this.costumeView = findWidget(node, "costume_view")?.value || "front";
      this.useDepth = Boolean(findWidget(node, "use_depth")?.value);
      if (mode === "recipe") {
        this.recipeSelection.portrait =
          findWidget(node, "portrait_id")?.value ||
          LIBRARIES.portrait.defaultId;
        this.recipeSelection.costume =
          findWidget(node, "costume_id")?.value || LIBRARIES.costume.defaultId;
        this.recipeSelection.pose =
          findWidget(node, "pose_id")?.value || LIBRARIES.pose.defaultId;
      } else {
        const currentId =
          findWidget(node, "image_id")?.value ||
          LIBRARIES[initialLib].defaultId;
        this.recipeSelection[initialLib] = currentId;
      }
    }

    this.renderShell();
    await this.switchLibrary(this.activeLib);
  }

  close() {
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
  }

  renderShell() {
    this.close();
    const backdrop = document.createElement("div");
    backdrop.className = "pca-modal-backdrop";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) this.close();
    });

    backdrop.innerHTML = `
      <div class="pca-modal">
        <div class="pca-header">
          <div class="pca-title-group">
            <div>
              <h3 class="pca-title">${t("AI 角色三合一参考图集 (ComfyUI 选图器)", "AI bộ ảnh tham khảo nhân vật 3 trong 1 (Bộ chọn ảnh ComfyUI)")}</h3>
              <div class="pca-subtitle">${t("6,162 条中文参考索引 · Shisei / wquguru CC0 · 二次元图片需联网 ·", "6,162 mục tham khảo tiếng Trung · Shisei / wquguru CC0 · Ảnh anime cần kết nối mạng ·")} <a href="https://github.com/taki-ttt/charadb/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${t("CharaDB来源条款", "Điều khoản nguồn CharaDB")}</a></div>
            </div>
          </div>
          <div class="pca-tabs" id="pca-tabs"></div>
          <button class="pca-btn" id="pca-close-btn">${t("关闭 ✕", "Đóng ✕")}</button>
        </div>
        <div class="pca-toolbar">
          <input class="pca-search-input" id="pca-search" type="text" aria-label="${t("搜索图库", "Tìm trong thư viện")}" placeholder="${t("搜索中文标题、动作、服装、发型、编号 (如: 坐姿 / 水手服 / 双马尾 / SPR-0001)...", "Tìm theo tên tiếng Việt hoặc tiếng Trung, động tác, trang phục, kiểu tóc hoặc ID (VD: SPR-0001)...")}" />
          <select class="pca-select" id="pca-filter-primary"></select>
          <select class="pca-select" id="pca-filter-secondary"></select>
          <select class="pca-select" aria-label="${t("服装来源", "Nguồn trang phục")}" id="pca-filter-source"><option value="">${t("全部来源", "Tất cả nguồn")}</option><option value="gia">${t("ギア · 写实", "ギア · Tả thực")}</option><option value="gia-anime">${t("ギア · 动漫", "ギア · Anime")}</option><option value="charadb">CharaDB</option><option value="shisei">${t("Shisei · 中国历代", "Shisei · Các triều đại Trung Quốc")}</option></select>
          <button class="pca-btn" id="pca-depth-btn">${this.useDepth ? t("🌗 深度图 (Depth)", "🌗 Bản đồ độ sâu (Depth)") : t("🗿 素体白模", "🗿 Mô hình cơ thể trắng")}</button>
          <button class="pca-btn" id="pca-sfw-btn">${this.safeMode ? t("🛡️ 安全模式 (SFW)", "🛡️ Chế độ an toàn (SFW)") : t("🔞 18+ 完整模式", "🔞 Chế độ đầy đủ 18+")}</button>
          <button class="pca-btn" id="pca-random-btn">${t("🎲 随机抽一张", "🎲 Chọn ảnh ngẫu nhiên")}</button>
          <button class="pca-btn" id="pca-reset-btn">${t("重置筛选", "Đặt lại bộ lọc")}</button>
        </div>
        <div class="pca-grid-wrap">
          <div class="pca-grid" id="pca-grid"></div>
        </div>
        <div class="pca-footer">
          <div class="pca-recipe-slots" id="pca-recipe-slots"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="pca-btn" id="pca-prev-page">${t("上一页", "Trang trước")}</button>
            <span id="pca-page-info" style="font-size:12px;color:#9ca3af;">1 / 1</span>
            <button class="pca-btn" id="pca-next-page">${t("下一页", "Trang sau")}</button>
            <button class="pca-btn pca-btn-primary" id="pca-apply-btn">${t("确认应用到节点", "Áp dụng vào nút")}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    this.backdrop = backdrop;

    backdrop
      .querySelector("#pca-close-btn")
      .addEventListener("click", () => this.close());

    const searchInput = backdrop.querySelector("#pca-search");
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.page = 1;
      this.renderGrid();
    });

    backdrop
      .querySelector("#pca-filter-primary")
      .addEventListener("change", (e) => {
        this.primaryFilter = e.target.value;
        this.secondaryFilter = "";
        this.populateFilters();
        this.page = 1;
        this.renderGrid();
      });

    backdrop
      .querySelector("#pca-filter-secondary")
      .addEventListener("change", (e) => {
        this.secondaryFilter = e.target.value;
        this.page = 1;
        this.renderGrid();
      });

    backdrop.querySelector("#pca-filter-source").addEventListener("change", (e) => {
      this.sourceFilter = e.target.value;
      this.page = 1;
      this.renderGrid();
    });
    const depthBtn = backdrop.querySelector("#pca-depth-btn");
    depthBtn.addEventListener("click", () => {
      this.useDepth = !this.useDepth;
      depthBtn.textContent = this.useDepth ? t("🌗 深度图 (Depth)", "🌗 Bản đồ độ sâu (Depth)") : t("🗿 素体白模", "🗿 Mô hình cơ thể trắng");
      if (this.targetNode) {
        setWidgetValue(this.targetNode, "costume_view", this.costumeView);
      setWidgetValue(this.targetNode, "use_depth", this.useDepth);
      }
      this.renderGrid();
      this.renderFooterSlots();
    });

    const sfwBtn = backdrop.querySelector("#pca-sfw-btn");
    sfwBtn.addEventListener("click", () => {
      if (this.safeMode) {
        if (!window.confirm(t("是否关闭安全模式并显示 18+ 敏感参考分类（性感姿势、双人缠绵、内衣穿搭）？请确认您已年满 18 周岁。", "Tắt chế độ an toàn và hiển thị các mục nhạy cảm 18+ (tư thế gợi cảm, cặp đôi thân mật, đồ lót)? Vui lòng xác nhận bạn đã đủ 18 tuổi."))) {
          return;
        }
        this.safeMode = false;
      } else {
        this.safeMode = true;
      }
      sfwBtn.textContent = this.safeMode ? t("🛡️ 安全模式 (SFW)", "🛡️ Chế độ an toàn (SFW)") : t("🔞 18+ 完整模式", "🔞 Chế độ đầy đủ 18+");
      this.page = 1;
      this.populateFilters();
      this.renderGrid();
    });

    backdrop
      .querySelector("#pca-random-btn")
      .addEventListener("click", () => this.pickRandom());

    backdrop.querySelector("#pca-reset-btn").addEventListener("click", () => {
      this.searchQuery = "";
      this.primaryFilter = "";
      this.secondaryFilter = "";
      this.sourceFilter = "";
      backdrop.querySelector("#pca-filter-source").value = "";
      searchInput.value = "";
      this.page = 1;
      this.populateFilters();
      this.renderGrid();
    });

    backdrop.querySelector("#pca-prev-page").addEventListener("click", () => {
      if (this.page > 1) {
        this.page--;
        this.renderGrid();
      }
    });

    backdrop.querySelector("#pca-next-page").addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(this.getFilteredItems().length / PAGE_SIZE)
      );
      if (this.page < totalPages) {
        this.page++;
        this.renderGrid();
      }
    });

    backdrop
      .querySelector("#pca-apply-btn")
      .addEventListener("click", () => this.applyAndClose());
  }

  renderTabs() {
    const tabsEl = this.backdrop.querySelector("#pca-tabs");
    tabsEl.innerHTML = "";
    Object.values(LIBRARIES).forEach((libCfg) => {
      const btn = document.createElement("button");
      btn.className = `pca-tab-btn ${this.activeLib === libCfg.key ? "active" : ""}`;
      btn.textContent = libCfg.label;
      btn.addEventListener("click", () => this.switchLibrary(libCfg.key));
      tabsEl.appendChild(btn);
    });
  }

  async switchLibrary(lib) {
    this.activeLib = lib;
    this.backdrop.querySelector("#pca-filter-source").style.display = lib === "costume" ? "" : "none";
    this.primaryFilter = "";
    this.secondaryFilter = "";
    this.page = 1;
    this.renderTabs();

    const gridEl = this.backdrop.querySelector("#pca-grid");
    gridEl.textContent = t(`正在加载 ${LIBRARIES[lib].label}...`, `Đang tải ${LIBRARIES[lib].label}...`);

    try {
      await fetchCatalogue(lib);
    } catch (error) {
      gridEl.textContent = t(`加载失败，请重试。${error.message}`, `Tải thất bại, vui lòng thử lại. ${error.message}`);
      return;
    }
    this.populateFilters();
    this.renderGrid();
    this.renderFooterSlots();
  }

  populateFilters() {
    const rawItems = catalogueCache[this.activeLib] || [];
    const items = this.safeMode
      ? rawItems.filter((it) => !isItemNsfw(this.activeLib, it))
      : rawItems;
    const cfg = LIBRARIES[this.activeLib];

    const primarySet = new Set();
    const secondarySet = new Set();
    items.forEach((it) => {
      if (cfg.primaryField && it[cfg.primaryField]) {
        primarySet.add(it[cfg.primaryField]);
      }
      if (cfg.secondaryField && it[cfg.secondaryField] && (!this.primaryFilter || it[cfg.primaryField] === this.primaryFilter)) {
        secondarySet.add(it[cfg.secondaryField]);
      }
    });

    const pSelect = this.backdrop.querySelector("#pca-filter-primary");
    pSelect.setAttribute("aria-label", cfg.primaryPlaceholder);
    pSelect.innerHTML = `<option value="">${cfg.primaryPlaceholder}</option>`;
    Array.from(primarySet).forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = catalogueTerm(val);
      pSelect.appendChild(opt);
    });
    pSelect.value = this.primaryFilter;

    const sSelect = this.backdrop.querySelector("#pca-filter-secondary");
    if (!cfg.secondaryField) {
      sSelect.style.display = "none";
    } else {
      sSelect.style.display = "";
      sSelect.setAttribute("aria-label", cfg.secondaryPlaceholder);
      sSelect.innerHTML = `<option value="">${cfg.secondaryPlaceholder}</option>`;
      Array.from(secondarySet).forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = catalogueTerm(val);
        sSelect.appendChild(opt);
      });
      sSelect.value = this.secondaryFilter;
    }
  }

  getFilteredItems() {
    const rawItems = catalogueCache[this.activeLib] || [];
    const items = this.safeMode
      ? rawItems.filter((it) => !isItemNsfw(this.activeLib, it))
      : rawItems;
    const cfg = LIBRARIES[this.activeLib];
    const q = this.searchQuery;

    return items.filter((it) => {
      if (this.activeLib === "costume" && this.sourceFilter && (it.source || "gia") !== this.sourceFilter) return false;
      if (
        this.primaryFilter &&
        cfg.primaryField &&
        it[cfg.primaryField] !== this.primaryFilter
      ) {
        return false;
      }
      if (
        this.secondaryFilter &&
        cfg.secondaryField &&
        it[cfg.secondaryField] !== this.secondaryFilter
      ) {
        return false;
      }
      if (q) {
        const title = getRawItemTitle(this.activeLib, it);
        const hay =
          `${it.id || ""} ${title} ${it["检索"] || ""} ${it["分类"] || ""} ${catalogueSearchText(this.activeLib, it, title)}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }

  renderGrid() {
    const filtered = this.getFilteredItems();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (this.page > totalPages) this.page = totalPages;

    const start = (this.page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    const pageInfo = this.backdrop.querySelector("#pca-page-info");
    pageInfo.textContent = t(`第 ${this.page} / ${totalPages} 页（共 ${filtered.length} 项）`, `Trang ${this.page} / ${totalPages} (${filtered.length} mục)`);

    const gridEl = this.backdrop.querySelector("#pca-grid");
    gridEl.innerHTML = "";

    const selectedId = this.recipeSelection[this.activeLib];
    const cfg = LIBRARIES[this.activeLib];

    slice.forEach((original) => {
      const chosenView = original.views?.find((v) => v.id === this.costumeView) || original.views?.[0];
      const item = chosenView ? { ...original, ...chosenView, id: original.id } : original;
      const card = document.createElement("div");
      card.className = `pca-card ${item.id === selectedId ? "selected" : ""}`;
      const title = getItemTitle(this.activeLib, item);
      const badge = catalogueTerm(
        (cfg.secondaryField && item[cfg.secondaryField]) ||
        item[cfg.primaryField] ||
        "");
      const subText =
        catalogueTerm(item[cfg.primaryField] || "") +
        (cfg.secondaryField && item[cfg.secondaryField]
          ? ` · ${catalogueTerm(item[cfg.secondaryField])}`
          : "") + (item.source === "charadb" ? " · たき AI / CharaDB" : "");

      card.innerHTML = `
        <div class="pca-card-img-wrap">
          <img class="pca-card-img" loading="lazy" src="${getThumbUrl(this.activeLib, item.id, item["缩略图"], this.useDepth)}" alt="${title}" />
          <span class="pca-card-id">#${item.id}</span>
          ${badge ? `<span class="pca-card-badge">${badge}</span>` : ""}
        </div>
        <div class="pca-card-meta">
          <div class="pca-card-title" title="${title}">${title}</div>
          <div class="pca-card-sub">${subText}</div>
        </div>
      `;

      if (original.views?.length) {
        const select = document.createElement("select");
        select.className = "pca-select";
        select.setAttribute("aria-label", t("服装视角", "Góc nhìn trang phục"));
        original.views.forEach((view) => {
          const option = document.createElement("option");
          option.value = view.id;
          option.textContent = t(view.label, ({ front: "Chính diện", diag: "Góc chéo", side: "Bên cạnh", back: "Phía sau" })[view.id] || view.label);
          select.appendChild(option);
        });
        select.value = chosenView.id;
        select.addEventListener("click", (e) => e.stopPropagation());
        select.addEventListener("change", () => { this.costumeView = select.value; this.recipeSelection.costume = item.id; this.renderGrid(); this.renderFooterSlots(); });
        card.appendChild(select);
      }
      card.addEventListener("click", () => {
        this.recipeSelection[this.activeLib] = item.id;
        if (this.activeLib === "costume") this.costumeView = chosenView?.id || "front";
        if (this.mode === "single") {
          this.applyAndClose();
        } else {
          this.renderGrid();
          this.renderFooterSlots();
        }
      });

      gridEl.appendChild(card);
    });
  }

  renderFooterSlots() {
    const slotsEl = this.backdrop.querySelector("#pca-recipe-slots");
    slotsEl.innerHTML = "";
    ["portrait", "costume", "pose"].forEach((libKey) => {
      const id = this.recipeSelection[libKey];
      const row = catalogueCache[libKey]?.find((r) => r.id === id);
      const view = row?.views?.find((v) => v.id === this.costumeView) || row?.views?.[0];
      const pill = document.createElement("div");
      pill.className = `pca-slot-pill ${this.activeLib === libKey ? "active" : ""}`;
      pill.innerHTML = `
        <img src="${getThumbUrl(libKey, id, view?.缩略图 || row?.缩略图, this.useDepth)}" alt="${id}" />
        <div>
          <div style="font-weight:600;color:#fff;">${LIBRARIES[libKey].shortLabel}</div>
          <div style="color:#9ca3af;font-family:monospace;">#${id}</div>
        </div>
      `;
      pill.addEventListener("click", () => this.switchLibrary(libKey));
      slotsEl.appendChild(pill);
    });
  }

  pickRandom() {
    const filtered = this.getFilteredItems().filter((item) => item.source !== "charadb");
    if (!filtered.length) return;
    const rand = filtered[Math.floor(Math.random() * filtered.length)];
    this.recipeSelection[this.activeLib] = rand.id;
    if (this.activeLib === "costume") this.costumeView = rand.views?.find((v) => v.id === "front")?.id || rand.views?.[0]?.id || "front";
    this.renderGrid();
    this.renderFooterSlots();
    if (this.mode === "single") {
      this.applyAndClose();
    }
  }

  applyAndClose() {
    if (this.targetNode) {
      setWidgetValue(this.targetNode, "costume_view", this.costumeView);
      setWidgetValue(this.targetNode, "use_depth", this.useDepth);
      if (this.mode === "recipe") {
        setWidgetValue(
          this.targetNode,
          "portrait_id",
          this.recipeSelection.portrait
        );
        setWidgetValue(
          this.targetNode,
          "costume_id",
          this.recipeSelection.costume
        );
        setWidgetValue(this.targetNode, "pose_id", this.recipeSelection.pose);
      } else {
        setWidgetValue(
          this.targetNode,
          "image_id",
          this.recipeSelection[this.activeLib]
        );
      }
      if (typeof this.targetNode.pcaRefreshPreview === "function") {
        this.targetNode.pcaRefreshPreview();
      }
    } else if (window.LiteGraph) {
      const node = window.LiteGraph.createNode("CharacterRecipeNode");
      if (node) {
        app.graph.add(node);
        node.pos = [200, 200];
        setWidgetValue(node, "portrait_id", this.recipeSelection.portrait);
        setWidgetValue(node, "costume_id", this.recipeSelection.costume);
        setWidgetValue(node, "costume_view", this.costumeView);
        setWidgetValue(node, "pose_id", this.recipeSelection.pose);
        if (typeof node.pcaRefreshPreview === "function") {
          node.pcaRefreshPreview();
        }
      }
    }
    this.close();
  }
}

const modalInstance = new PoseAtlasModal();

function attachNodePreviewWidget(node, nodeKind) {
  injectStylesheet();
  const container = document.createElement("div");
  container.className = "pca-node-preview";

  const refresh = () => {
    container.innerHTML = "";
    const useDepth = Boolean(findWidget(node, "use_depth")?.value);
    if (nodeKind === "recipe") {
      const slots = [
        {
          lib: "portrait",
          label: LIBRARIES.portrait.shortLabel,
          val:
            findWidget(node, "portrait_id")?.value ||
            LIBRARIES.portrait.defaultId,
        },
        {
          lib: "costume",
          label: LIBRARIES.costume.shortLabel,
          val:
            findWidget(node, "costume_id")?.value ||
            LIBRARIES.costume.defaultId,
        },
        {
          lib: "pose",
          label: useDepth ? t("姿势(深度)", "Tư thế (độ sâu)") : LIBRARIES.pose.shortLabel,
          val: findWidget(node, "pose_id")?.value || LIBRARIES.pose.defaultId,
        },
      ];
      slots.forEach((s) => {
        const card = document.createElement("div");
        card.className = "pca-node-thumb-card";
        card.title = t(`点击更换${s.label}参考图`, `Nhấn để đổi ảnh tham khảo: ${s.label}`);
        card.innerHTML = `
          <img src="${(s.lib === "costume" ? `/pose_character_atlas/image?library=costume&id=${encodeURIComponent(s.val)}&kind=thumb&view=${encodeURIComponent(findWidget(node, "costume_view")?.value || "front")}` : getThumbUrl(s.lib, s.val, null, useDepth))}" alt="${s.val}" />
          <div class="pca-node-thumb-label">${s.label} #${s.val}</div>
        `;
        card.addEventListener("click", () => {
          modalInstance.open({ node, initialLib: s.lib, mode: "recipe" });
        });
        container.appendChild(card);
      });
    } else {
      const id =
        findWidget(node, "image_id")?.value || LIBRARIES[nodeKind].defaultId;
      const card = document.createElement("div");
      card.className = "pca-node-thumb-card";
      card.title = t("点击打开图库选图", "Nhấn để chọn ảnh từ thư viện");
      card.innerHTML = `
        <img src="${(nodeKind === "costume" ? `/pose_character_atlas/image?library=costume&id=${encodeURIComponent(id)}&kind=thumb&view=${encodeURIComponent(findWidget(node, "costume_view")?.value || "front")}` : getThumbUrl(nodeKind, id, null, useDepth))}" alt="${id}" />
        <div class="pca-node-thumb-label">${LIBRARIES[nodeKind].shortLabel}${nodeKind === "pose" && useDepth ? t("(深度)", " (độ sâu)") : ""} #${id}</div>
      `;
      card.addEventListener("click", () => {
        modalInstance.open({ node, initialLib: nodeKind, mode: "single" });
      });
      container.appendChild(card);
    }
  };

  node.pcaRefreshPreview = refresh;

  if (typeof node.addDOMWidget === "function") {
    node.addDOMWidget("pca_preview", "preview", container, {
      serialize: false,
      hideOnZoom: false,
    });
  }

  ["image_id", "portrait_id", "costume_id", "pose_id", "use_depth", "costume_view"].forEach((wName) => {
    const w = findWidget(node, wName);
    if (w) {
      const origCb = w.callback;
      w.callback = function () {
        if (typeof origCb === "function") origCb.apply(this, arguments);
        refresh();
      };
    }
  });

  refresh();
}

app.registerExtension({
  name: "PoseCharacterAtlas.Gallery",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    const nodeKind = NODE_LIB_MAP[nodeData.name];
    if (!nodeKind) return;
    if (isVietnamese) {
      nodeData.display_name = nodeTitles[nodeData.name];
      nodeType.title = nodeTitles[nodeData.name];
    }

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origOnNodeCreated
        ? origOnNodeCreated.apply(this, arguments)
        : undefined;

      const btnLabel =
        nodeKind === "recipe"
          ? t("🎨 打开三合一选图器", "🎨 Mở bộ chọn ảnh 3 trong 1")
          : t(`🖼️ 打开${LIBRARIES[nodeKind].shortLabel}图库选图`, `🖼️ Mở thư viện ${LIBRARIES[nodeKind].shortLabel}`);

      this.addWidget("button", btnLabel, null, () => {
        modalInstance.open({
          node: this,
          initialLib: nodeKind === "recipe" ? "portrait" : nodeKind,
          mode: nodeKind === "recipe" ? "recipe" : "single",
        });
      });

      localizeNode(this);
      attachNodePreviewWidget(this, nodeKind);
      if (this.size && this.size[1] < 340) {
        this.setSize([Math.max(this.size[0], 310), 360]);
      }
      return r;
    };
  },
});
