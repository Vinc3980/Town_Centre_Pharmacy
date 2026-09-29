import ExcelJS from "exceljs";
import { Response } from "express";
import PDFDocument from "pdfkit";

export interface ReportMeta {
  pharmacyName: string;
  pharmacyInfo?: string;
  generatedAt: string;
}

function escapeCsvField(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function sendCsv(res: Response, filename: string, headers: string[], rows: unknown[][], meta?: ReportMeta) {
  const bom = "\uFEFF";
  const metaRows: string[][] = [];
  if (meta) {
    metaRows.push([meta.pharmacyName]);
    if (meta.pharmacyInfo) metaRows.push([meta.pharmacyInfo]);
    metaRows.push([`Generated: ${meta.generatedAt}`]);
    metaRows.push([]);
  }
  const csv = bom + [
    ...metaRows.map((r) => r.map(escapeCsvField).join(",")),
    headers.map(escapeCsvField).join(","),
    ...rows.map((r) => r.map(escapeCsvField).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function sendExcel(res: Response, filename: string, sheetName: string, headers: string[], rows: unknown[][], meta?: ReportMeta) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);

  let startRow = 1;
  if (meta) {
    sheet.mergeCells(startRow, 1, startRow, headers.length);
    const titleCell = sheet.getCell(startRow, 1);
    titleCell.value = meta.pharmacyName;
    titleCell.font = { bold: true, size: 14 };
    startRow++;
    if (meta.pharmacyInfo) {
      sheet.mergeCells(startRow, 1, startRow, headers.length);
      sheet.getCell(startRow, 1).value = meta.pharmacyInfo;
      sheet.getCell(startRow, 1).font = { size: 10, color: { argb: "FF555555" } };
      startRow++;
    }
    sheet.mergeCells(startRow, 1, startRow, headers.length);
    sheet.getCell(startRow, 1).value = `Generated: ${meta.generatedAt}`;
    sheet.getCell(startRow, 1).font = { size: 10, color: { argb: "FF555555" } };
    startRow++;
    startRow++; // blank row
  }

  headers.forEach((h, i) => {
    sheet.getCell(startRow, i + 1).value = h;
  });
  const headerRow = sheet.getRow(startRow);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF137056" } };

  for (const row of rows) {
    sheet.addRow(row);
  }

  // auto-width from headers
  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = Math.max(h.length + 4, 14);
  });

  sheet.views = [{ state: "frozen", ySplit: startRow }];

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function sendPdf(res: Response, filename: string, title: string, headers: string[], rows: unknown[][], meta?: ReportMeta) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.pipe(res);

  if (meta) {
    doc.fontSize(11).fillColor("#134FCB").text(meta.pharmacyName, { align: "center" });
    if (meta.pharmacyInfo) {
      doc.fontSize(8).fillColor("#666666").text(meta.pharmacyInfo, { align: "center" });
    }
    doc.moveDown(0.2);
  }
  doc.fontSize(18).fillColor("#000000").text(title, { align: "center" });
  doc.moveDown(0.2);
  const generated = meta?.generatedAt ?? new Date().toLocaleString("en-GB");
  doc.fontSize(9).fillColor("#666666").text(`Generated: ${generated}`, { align: "center" });
  doc.moveDown(0.8);

  const usableWidth = doc.page.width - 80;
  const colWidth = usableWidth / headers.length;
  const startX = 40;
  let y = doc.y;

  doc.fontSize(8).fillColor("#FFFFFF");
  doc.rect(startX, y, usableWidth, 18).fill("#137056");
  headers.forEach((h, i) => {
    doc.fillColor("#FFFFFF").text(h, startX + i * colWidth + 4, y + 4, { width: colWidth - 8, align: "left" });
  });
  y += 18;

  doc.fillColor("#333333");
  for (const row of rows) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    const bg = rows.indexOf(row) % 2 === 0 ? "#F9F8F5" : "#FFFFFF";
    doc.rect(startX, y, usableWidth, 16).fill(bg);
    doc.fontSize(7).fillColor("#333333");
    row.forEach((cell, i) => {
      const text = String(cell ?? "");
      doc.text(text, startX + i * colWidth + 4, y + 3, { width: colWidth - 8, align: "left", lineBreak: false });
    });
    y += 16;
  }

  doc.end();
}
