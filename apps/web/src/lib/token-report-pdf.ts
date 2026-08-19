"use client";

import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export async function downloadElementAsPdf(element: HTMLElement, filename: string) {
  const bg = getComputedStyle(element).backgroundColor || getComputedStyle(document.body).backgroundColor;
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#ffffff",
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const img = canvas.toDataURL("image/png");

  let heightLeft = imgHeight;
  let y = 0;
  pdf.addImage(img, "PNG", 0, y, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0.5) {
    y -= pageHeight;
    pdf.addPage();
    pdf.addImage(img, "PNG", 0, y, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(filename);
}
