import { languageInfo } from "../../../shared/languages";

/** Makes a safe file name from free text. */
export function fileName(base: string, language: string): string {
  const clean = base.replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "snippet";
  return `${clean}.${languageInfo(language).ext}`;
}

/** Saves text as a file in the browser. */
export function downloadText(name: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
