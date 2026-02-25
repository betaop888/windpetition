import fs from "fs";
import path from "path";

function extractTagValue(source, tagName) {
  const match = source.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function extractBody(source) {
  const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error("Template file does not contain a <body> tag");
  }

  // Scripts are injected by Next.js via <Script />.
  return bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "").trim();
}

function extractPageId(source, fallbackPageId) {
  const pageIdMatch = source.match(/<body[^>]*data-page=["']([^"']+)["']/i);
  return pageIdMatch ? pageIdMatch[1] : fallbackPageId;
}

export function loadHtmlTemplate(fileName, fallbackPageId) {
  const fullPath = path.join(process.cwd(), "templates", fileName);
  const source = fs.readFileSync(fullPath, "utf8");

  return {
    title: extractTagValue(source, "title") || "Wind Petition",
    pageId: extractPageId(source, fallbackPageId),
    bodyHtml: extractBody(source),
  };
}
