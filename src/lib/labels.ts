/** Vietnamese labels for every enum in registry.ts. label() falls back to
 *  the raw value for anything unmapped, so a new enum member never renders
 *  blank — it just shows raw until someone adds a translation. */

const STATUS: Record<string, string> = {
  active: "Đang chạy",
  ongoing: "Duy trì",
  paused: "Tạm dừng",
  planned: "Dự kiến",
  blocked: "Bị chặn",
  complete: "Hoàn tất",
  archived: "Lưu trữ",
  unconfigured: "Chưa cấu hình",
};

const PRIORITY: Record<string, string> = {
  high: "Cao",
  medium: "Vừa",
  low: "Thấp",
};

const CLIENT_TYPE: Record<string, string> = {
  internal: "Nội bộ",
  ecommerce: "TMĐT",
  webapp: "Web app",
  edtech: "Giáo dục",
  agency: "Agency",
};

const PROJECT_TYPE: Record<string, string> = {
  internal: "Nội bộ",
  product: "Sản phẩm",
  infra: "Hạ tầng",
  "client-site": "Web khách",
  personal: "Cá nhân",
};

const MAPS = {
  status: STATUS,
  priority: PRIORITY,
  clientType: CLIENT_TYPE,
  projectType: PROJECT_TYPE,
} as const;

export type LabelKind = keyof typeof MAPS;

export function label(kind: LabelKind, value: string): string {
  return MAPS[kind][value] ?? value;
}
