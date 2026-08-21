import type { AnalysisResults } from "@/types/fta";
import { formatScientific, formatPercent } from "@/lib/utils";
import { isTauriEnv } from "@/lib/scram/runner";

export async function exportReportXml(results: AnalysisResults, modelName: string): Promise<boolean> {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<fta-report model="${escapeXml(modelName)}" algorithm="${results.algorithm}" run-at="${results.runAt}">`);
  lines.push(`  <top-event probability="${results.topEventProbability ?? ""}"/>`);
  lines.push("  <minimal-cut-sets>");
  for (const cs of results.cutSets) {
    lines.push(
      `    <cut-set order="${cs.order}" probability="${cs.probability ?? ""}" contribution="${cs.contribution ?? ""}">`
    );
    for (const ev of cs.events) lines.push(`      <event identifier="${escapeXml(ev)}"/>`);
    lines.push("    </cut-set>");
  }
  lines.push("  </minimal-cut-sets>");
  lines.push("  <importance>");
  for (const row of results.importance) {
    lines.push(
      `    <basic-event identifier="${escapeXml(row.identifier)}" occurrences="${row.occurrences}" birnbaum="${row.birnbaum}" criticality="${row.criticality}" fussell-vesely="${row.fusselVesely}" raw="${row.raw}" rrw="${row.rrw}"/>`
    );
  }
  lines.push("  </importance>");
  lines.push("</fta-report>");

  return saveText(lines.join("\n"), `${modelName || "fta-report"}.xml`, [
    { name: "XML Report", extensions: ["xml"] },
  ]);
}

export async function exportReportPdf(results: AnalysisResults, modelName: string): Promise<boolean> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const marginX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text(`Fault Tree Analysis Report`, marginX, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Model: ${modelName || "Untitled"}`, marginX, y);
  y += 5;
  doc.text(`Algorithm: ${results.algorithm.toUpperCase()}  •  Run at: ${new Date(results.runAt).toLocaleString()}`, marginX, y);
  y += 10;

  doc.setTextColor(20);
  doc.setFontSize(12);
  doc.text("Top Event Probability", marginX, y);
  y += 7;
  doc.setFontSize(18);
  doc.text(formatScientific(results.topEventProbability, 4), marginX, y);
  y += 10;

  doc.setFontSize(12);
  doc.text(`Minimal Cut Sets (${results.cutSets.length})`, marginX, y);
  y += 6;
  doc.setFontSize(9);
  for (const cs of results.cutSets.slice(0, 40)) {
    if (y > 280) {
      doc.addPage();
      y = 18;
    }
    const line = `[${cs.order}] {${cs.events.join(", ")}}  q=${formatScientific(cs.probability, 3)}  (${formatPercent(cs.contribution, 1)})`;
    doc.text(line, marginX, y, { maxWidth: 180 });
    y += 5.5;
  }

  if (results.importance.length > 0) {
    y += 6;
    if (y > 270) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(12);
    doc.text("Importance Measures (Top 20 by Birnbaum)", marginX, y);
    y += 6;
    doc.setFontSize(9);
    const top = [...results.importance].sort((a, b) => b.birnbaum - a.birnbaum).slice(0, 20);
    for (const row of top) {
      if (y > 280) {
        doc.addPage();
        y = 18;
      }
      doc.text(
        `${row.identifier}  Birnbaum=${row.birnbaum.toExponential(2)}  RAW=${row.raw.toFixed(2)}  RRW=${row.rrw.toFixed(2)}`,
        marginX,
        y
      );
      y += 5.5;
    }
  }

  if (results.warnings.length > 0) {
    y += 6;
    doc.setFontSize(12);
    doc.setTextColor(180, 100, 0);
    doc.text("Warnings", marginX, y);
    y += 6;
    doc.setFontSize(9);
    for (const w of results.warnings) {
      doc.text(`• ${w}`, marginX, y, { maxWidth: 180 });
      y += 6;
    }
  }

  const filename = `${modelName || "fta-report"}.pdf`;
  if (isTauriEnv()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: filename, filters: [{ name: "PDF Report", extensions: ["pdf"] }] });
    if (!path) return false;
    const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
    await writeFile(path, bytes);
    return true;
  }
  doc.save(filename);
  return true;
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function saveText(text: string, suggestedName: string, filters: { name: string; extensions: string[] }[]): Promise<boolean> {
  if (isTauriEnv()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }

  const blob = new Blob([text], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
