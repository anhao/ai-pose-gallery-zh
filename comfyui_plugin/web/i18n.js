// Vietnamese is the only UI language; browser locale is ignored.
// Raw protocol values (widget names, values, outputs) stay untouched.
export const isVietnamese = true;

export function t(chinese, vietnamese) {
  return isVietnamese ? vietnamese : chinese;
}

export const nodeTitles = {
  PoseGalleryNode: "AI ảnh tham khảo tư thế (Pose Gallery)",
  CostumeGalleryNode: "AI ảnh tham khảo trang phục (Costume Gallery)",
  PortraitGalleryNode: "AI ảnh tham khảo chân dung (Portrait Gallery)",
  CharacterRecipeNode: "AI công thức nhân vật 3 trong 1 (3-in-1 Recipe)",
};

export const inputLabels = {
  image_id: "ID ảnh", portrait_id: "ID chân dung", costume_id: "ID trang phục",
  pose_id: "ID tư thế", resize_mode: "Chế độ đổi kích thước", width: "Chiều rộng",
  height: "Chiều cao", flip_horizontal: "Lật ngang", flip_pose_horizontal: "Lật ngang tư thế",
  use_depth: "Dùng bản đồ độ sâu", costume_view: "Góc nhìn trang phục",
  style_preset: "Phong cách", extra_prompt: "Prompt bổ sung",
};

export const outputLabels = {
  姿势图: "Ảnh tư thế", 图片ID: "ID ảnh", 姿势提示词: "Prompt tư thế (tiếng Trung)",
  服装图: "Ảnh trang phục", 中文服装描述: "Mô tả trang phục (tiếng Trung)",
  英文服装Prompt: "Prompt trang phục (tiếng Anh)", 人像图: "Ảnh chân dung",
  人像发型描述: "Mô tả chân dung và tóc (tiếng Trung)", 三合一拼图: "Ảnh ghép 3 trong 1",
  中文合成Prompt: "Prompt tổng hợp (tiếng Trung)", 英文合成Prompt: "Prompt tổng hợp (tiếng Anh)",
};

// shortcut: native resize_mode/style_preset/costume_view combo values remain raw, translate when ComfyUI exposes a supported value/label API.
export function localizeNode(node) {
  if (!isVietnamese) return;
  for (const widget of node.widgets || []) {
    // Labels are display-only; names and values are workflow/API contracts.
    if (inputLabels[widget.name]) widget.label = inputLabels[widget.name];
    if (widget.name === "extra_prompt") {
      const placeholder = "Prompt bổ sung (tùy chọn, ví dụ: mắt bạc, ánh sáng ngược bên cửa sổ)";
      if (widget.options) widget.options.placeholder = placeholder;
      if (widget.inputEl) widget.inputEl.placeholder = placeholder;
    }
  }
  for (const input of node.inputs || []) {
    if (inputLabels[input.name]) input.label = inputLabels[input.name];
  }
  for (const output of node.outputs || []) {
    if (outputLabels[output.name]) output.label = outputLabels[output.name];
  }
}
