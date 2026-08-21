import type { FTANode, FTAEdge, GateLabelStyle, NodeDisplayOptions } from "@/store/ftaStore";
import { isTauriEnv } from "@/lib/scram/runner";
import { buildDiagramSvg } from "./diagramSvg";

export interface DiagramExportInput {
  nodes: FTANode[];
  edges: FTAEdge[];
  gateLabelStyle: GateLabelStyle;
  nodeDisplay: NodeDisplayOptions;
  compact?: boolean;
}

function svgStringToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterizes the (already light-themed, selection-free) vector SVG to a PNG
 * data URL at 2x scale, so PNG export shares the exact same source of truth
 * as SVG export instead of a separate DOM screenshot. */
async function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  const scale = 2;
  const img = new Image();
  const svgUrl = svgStringToDataUrl(svg);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to rasterize diagram SVG."));
    img.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function parseSvgDimensions(svg: string): { width: number; height: number } {
  const w = svg.match(/width="([\d.]+)"/);
  const h = svg.match(/height="([\d.]+)"/);
  return { width: w ? Number(w[1]) : 800, height: h ? Number(h[1]) : 600 };
}

/** Returns whether the file was actually saved — `false` on a cancelled
 * save dialog (Tauri) or is always `true` in the browser fallback (a
 * plain `<a download>` click has no cancel state to observe). Lets the
 * caller show a "Diagram exported" success toast only when something
 * genuinely happened, not on every click regardless of outcome. */
export async function exportDiagramSvg(input: DiagramExportInput, filename = "fault-tree.svg"): Promise<boolean> {
  const svg = buildDiagramSvg(input.nodes, input.edges, {
    gateLabelStyle: input.gateLabelStyle,
    nodeDisplay: input.nodeDisplay,
    compact: input.compact,
  });
  return saveTextFile(svg, filename, [{ name: "SVG Image", extensions: ["svg"] }], "image/svg+xml");
}

export async function exportDiagramPng(input: DiagramExportInput, filename = "fault-tree.png"): Promise<boolean> {
  const svg = buildDiagramSvg(input.nodes, input.edges, {
    gateLabelStyle: input.gateLabelStyle,
    nodeDisplay: input.nodeDisplay,
    compact: input.compact,
  });
  const { width, height } = parseSvgDimensions(svg);
  const dataUrl = await svgToPngDataUrl(svg, width, height);
  return saveDataUrl(dataUrl, filename, [{ name: "PNG Image", extensions: ["png"] }]);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);

  if (header.includes(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

async function saveDataUrl(
  dataUrl: string,
  suggestedName: string,
  filters: { name: string; extensions: string[] }[]
): Promise<boolean> {
  if (isTauriEnv()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return false;
    await writeFile(path, dataUrlToBytes(dataUrl));
    return true;
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

async function saveTextFile(
  text: string,
  suggestedName: string,
  filters: { name: string; extensions: string[] }[],
  mimeType: string
): Promise<boolean> {
  if (isTauriEnv()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }

  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}
