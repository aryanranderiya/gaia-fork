export const THEME_COLOR = "#00bbff";

export const BORDER = {
  primary: { style: "round" as const, color: THEME_COLOR },
  warning: { style: "round" as const, color: "yellow" },
  error: { style: "single" as const, color: "red" },
} as const;
