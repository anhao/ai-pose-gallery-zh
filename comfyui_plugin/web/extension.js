import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LIBRARIES = {
  pose: {
    key: "pose",
    label: "姿势库 (1,439)",
    shortLabel: "姿势",
    defaultId: "full_single_P001_front",
    titleField: "姿势名称",
    primaryField: "分类",
    secondaryField: "角度",
    primaryPlaceholder: "全部动作分类",
    secondaryPlaceholder: "全部视角",
  },
  costume: {
    key: "costume",
    label: "服装库 (1,407)",
    shortLabel: "服装",
    defaultId: "SPR-0001",
    titleField: "服装名称",
    primaryField: "分类",
    secondaryField: "",
    primaryPlaceholder: "全部穿搭大类",
    secondaryPlaceholder: "全部细分区",
  },
  portrait: {
    key: "portrait",
    label: "人像库 (1,499)",
    shortLabel: "人像",
    defaultId: "f71f980dde3",
    titleField: "发型名称",
    primaryField: "发长",
    secondaryField: "分区",
    primaryPlaceholder: "全部发长",
    secondaryPlaceholder: "全部分区",
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
  if (catalogueCache[lib]) return catalogueCache[lib];
  const resp = await api.fetchApi(
    `/pose_character_atlas/catalogue?library=${encodeURIComponent(lib)}`
  );
  if (!resp.ok) {
    throw new Error(`加载 ${lib} 图库失败: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  catalogueCache[lib] = data.items || [];
  return catalogueCache[lib];
}

function getThumbUrl(lib, id, relPath) {
  if (relPath) {
    return `/pose_character_atlas/image?path=${encodeURIComponent(relPath)}`;
  }
  return `/pose_character_atlas/image?library=${encodeURIComponent(lib)}&id=${encodeURIComponent(id)}&kind=thumb`;
}

function getItemTitle(lib, item) {
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
  if (lib === "costume") return NSFW_COSTUME_CATEGORIES.has(item["分类"]);
  return false;
}

class PoseAtlasModal {
  constructor() {
    this.backdrop = null;
    this.activeLib = "pose";
    this.targetNode = null;
    this.mode = "single"; // "single" | "recipe"
    this.safeMode = true;
    this.searchQuery = "";
    this.primaryFilter = "";
    this.secondaryFilter = "";
    this.page = 1;
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
              <h3 class="pca-title">AI 角色三合一参考图集 (ComfyUI 选图器)</h3>
              <div class="pca-subtitle">4,345 张高清中文标签参考图 · 点击卡片即可填入节点</div>
            </div>
          </div>
          <div class="pca-tabs" id="pca-tabs"></div>
          <button class="pca-btn" id="pca-close-btn">关闭 ✕</button>
        </div>
        <div class="pca-toolbar">
          <input class="pca-search-input" id="pca-search" type="text" placeholder="搜索中文标题、动作、服装、发型、编号 (如: 坐姿 / 水手服 / 双马尾 / SPR-0001)..." />
          <select class="pca-select" id="pca-filter-primary"></select>
          <select class="pca-select" id="pca-filter-secondary"></select>
          <button class="pca-btn" id="pca-sfw-btn">${this.safeMode ? "🛡️ 安全模式 (SFW)" : "🔞 18+ 完整模式"}</button>
          <button class="pca-btn" id="pca-random-btn">🎲 随机抽一张</button>
          <button class="pca-btn" id="pca-reset-btn">重置筛选</button>
        </div>
        <div class="pca-grid-wrap">
          <div class="pca-grid" id="pca-grid"></div>
        </div>
        <div class="pca-footer">
          <div class="pca-recipe-slots" id="pca-recipe-slots"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="pca-btn" id="pca-prev-page">上一页</button>
            <span id="pca-page-info" style="font-size:12px;color:#9ca3af;">1 / 1</span>
            <button class="pca-btn" id="pca-next-page">下一页</button>
            <button class="pca-btn pca-btn-primary" id="pca-apply-btn">确认应用到节点</button>
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

    const sfwBtn = backdrop.querySelector("#pca-sfw-btn");
    sfwBtn.addEventListener("click", () => {
      if (this.safeMode) {
        if (!window.confirm("是否关闭安全模式并显示 18+ 敏感参考分类（性感姿势、双人缠绵、内衣穿搭）？请确认您已年满 18 周岁。")) {
          return;
        }
        this.safeMode = false;
      } else {
        this.safeMode = true;
      }
      sfwBtn.textContent = this.safeMode ? "🛡️ 安全模式 (SFW)" : "🔞 18+ 完整模式";
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
    this.primaryFilter = "";
    this.secondaryFilter = "";
    this.page = 1;
    this.renderTabs();

    const gridEl = this.backdrop.querySelector("#pca-grid");
    gridEl.innerHTML = `<div style="padding:40px;color:#9ca3af;">正在加载 ${LIBRARIES[lib].label}...</div>`;

    await fetchCatalogue(lib);
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
      if (cfg.secondaryField && it[cfg.secondaryField]) {
        secondarySet.add(it[cfg.secondaryField]);
      }
    });

    const pSelect = this.backdrop.querySelector("#pca-filter-primary");
    pSelect.innerHTML = `<option value="">${cfg.primaryPlaceholder}</option>`;
    Array.from(primarySet).forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      pSelect.appendChild(opt);
    });

    const sSelect = this.backdrop.querySelector("#pca-filter-secondary");
    if (!cfg.secondaryField) {
      sSelect.style.display = "none";
    } else {
      sSelect.style.display = "";
      sSelect.innerHTML = `<option value="">${cfg.secondaryPlaceholder}</option>`;
      Array.from(secondarySet).forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        sSelect.appendChild(opt);
      });
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
        const title = getItemTitle(this.activeLib, it);
        const hay =
          `${it.id || ""} ${title} ${it["检索"] || ""} ${it["分类"] || ""}`.toLowerCase();
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
    pageInfo.textContent = `第 ${this.page} / ${totalPages} 页（共 ${filtered.length} 项）`;

    const gridEl = this.backdrop.querySelector("#pca-grid");
    gridEl.innerHTML = "";

    const selectedId = this.recipeSelection[this.activeLib];
    const cfg = LIBRARIES[this.activeLib];

    slice.forEach((item) => {
      const card = document.createElement("div");
      card.className = `pca-card ${item.id === selectedId ? "selected" : ""}`;
      const title = getItemTitle(this.activeLib, item);
      const badge =
        (cfg.secondaryField && item[cfg.secondaryField]) ||
        item[cfg.primaryField] ||
        "";
      const subText =
        (item[cfg.primaryField] || "") +
        (cfg.secondaryField && item[cfg.secondaryField]
          ? ` · ${item[cfg.secondaryField]}`
          : "");

      card.innerHTML = `
        <div class="pca-card-img-wrap">
          <img class="pca-card-img" loading="lazy" src="${getThumbUrl(this.activeLib, item.id, item["缩略图"])}" alt="${title}" />
          <span class="pca-card-id">#${item.id}</span>
          ${badge ? `<span class="pca-card-badge">${badge}</span>` : ""}
        </div>
        <div class="pca-card-meta">
          <div class="pca-card-title" title="${title}">${title}</div>
          <div class="pca-card-sub">${subText}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        this.recipeSelection[this.activeLib] = item.id;
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
      const pill = document.createElement("div");
      pill.className = `pca-slot-pill ${this.activeLib === libKey ? "active" : ""}`;
      pill.innerHTML = `
        <img src="${getThumbUrl(libKey, id)}" alt="${id}" />
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
    const filtered = this.getFilteredItems();
    if (!filtered.length) return;
    const rand = filtered[Math.floor(Math.random() * filtered.length)];
    this.recipeSelection[this.activeLib] = rand.id;
    this.renderGrid();
    this.renderFooterSlots();
    if (this.mode === "single") {
      this.applyAndClose();
    }
  }

  applyAndClose() {
    if (this.targetNode) {
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
    if (nodeKind === "recipe") {
      const slots = [
        {
          lib: "portrait",
          label: "人像",
          val:
            findWidget(node, "portrait_id")?.value ||
            LIBRARIES.portrait.defaultId,
        },
        {
          lib: "costume",
          label: "服装",
          val:
            findWidget(node, "costume_id")?.value ||
            LIBRARIES.costume.defaultId,
        },
        {
          lib: "pose",
          label: "姿势",
          val: findWidget(node, "pose_id")?.value || LIBRARIES.pose.defaultId,
        },
      ];
      slots.forEach((s) => {
        const card = document.createElement("div");
        card.className = "pca-node-thumb-card";
        card.title = `点击更换${s.label}参考图`;
        card.innerHTML = `
          <img src="${getThumbUrl(s.lib, s.val)}" alt="${s.val}" />
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
      card.title = "点击打开图库选图";
      card.innerHTML = `
        <img src="${getThumbUrl(nodeKind, id)}" alt="${id}" />
        <div class="pca-node-thumb-label">${LIBRARIES[nodeKind].shortLabel} #${id}</div>
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

  ["image_id", "portrait_id", "costume_id", "pose_id"].forEach((wName) => {
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

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origOnNodeCreated
        ? origOnNodeCreated.apply(this, arguments)
        : undefined;

      const btnLabel =
        nodeKind === "recipe"
          ? "🎨 打开三合一选图器 (4,345张)"
          : `🖼️ 打开${LIBRARIES[nodeKind].shortLabel}图库选图`;

      this.addWidget("button", btnLabel, null, () => {
        modalInstance.open({
          node: this,
          initialLib: nodeKind === "recipe" ? "portrait" : nodeKind,
          mode: nodeKind === "recipe" ? "recipe" : "single",
        });
      });

      attachNodePreviewWidget(this, nodeKind);
      if (this.size && this.size[1] < 340) {
        this.setSize([Math.max(this.size[0], 310), 360]);
      }
      return r;
    };
  },
});
