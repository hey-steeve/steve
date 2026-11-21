const indigo500 = "#5c59f3";
const emphasis = 500;
const fontFallback = ["Helvetica", "Arial", "sans-serif"] as const;

export const designTokens = {
  color: {
    indigo500,
    primary: indigo500,
    indigo700: "#2f33a8",
    indigo900: "#0c0a66",
    indigo100: "#d6dbff",
    indigo50: "#f0f3ff",
    heading: "#282830",
    foreground: "#464754",
    caption: "#656779",
    grey500: "#9da3ba",
    canvas: "#ffffff",
    surface: "#f5f8fe",
    border: "#ecf1fc",
    cream: "#fffcf5",
    creamCard: "#fff3e5",
    fluoYellow: "#fcff7e",
    teal: "#2aa79c",
    tealDeep: "#124548",
    orange: "#ff9359",
    danger: "#ed4e4e",
    success: "#7fca6c",
  },
  radius: {
    default: "16px",
  },
  shadow: {
    faint:
      "0 1px 2px rgba(12,10,102,0.06), 0 4px 16px rgba(12,10,102,0.06)",
  },
  font: {
    family: "Alan Sans",
    fallback: fontFallback,
    weight: {
      body: 400,
      heading: 600,
      button: emphasis,
    },
  },
} as const;
