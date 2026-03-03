import fs from "fs";
import path from "path";

const NAV_ICON_SVG = {
  home: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.25 10.75L12 4.75L19.75 10.75V18.5C19.75 19.19 19.19 19.75 18.5 19.75H14.25V14.25H9.75V19.75H5.5C4.81 19.75 4.25 19.19 4.25 18.5V10.75Z" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round"></path></svg>',
  minister:
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="8.3" cy="8.7" r="2.2" stroke="currentColor" stroke-width="1.8"></circle><circle cx="15.7" cy="8.7" r="2.2" stroke="currentColor" stroke-width="1.8"></circle><path d="M4.9 18.9C5.4 16.55 6.95 15.1 8.3 15.1C9.65 15.1 11.2 16.55 11.7 18.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M12.3 18.9C12.8 16.55 14.35 15.1 15.7 15.1C17.05 15.1 18.6 16.55 19.1 18.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>',
  registry:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M5.6 4.8C5.6 4.25 6.05 3.8 6.6 3.8H17.25C17.8 3.8 18.25 4.25 18.25 4.8V19.2C18.25 19.75 17.8 20.2 17.25 20.2H6.6C6.05 20.2 5.6 19.75 5.6 19.2V4.8Z" stroke="currentColor" stroke-width="1.8"></path><path d="M8.1 8.35H15.6M8.1 12H15.6M8.1 15.65H12.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>',
  admin:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.1L18.25 6.65V11.35C18.25 15.45 15.95 18.55 12 19.8C8.05 18.55 5.75 15.45 5.75 11.35V6.65L12 4.1Z" stroke="currentColor" stroke-width="1.85"></path><path d="M9.2 12.05L11.05 13.9L14.8 10.15" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  petitions:
    '<svg viewBox="0 0 24 24" fill="none"><rect x="4.9" y="4.5" width="13.7" height="14.9" rx="2" stroke="currentColor" stroke-width="1.8"></rect><path d="M8 8.5H15M8 12H15M8 15.5H12.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M15.3 16.7L18.8 20.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>',
};

function extractTagValue(source, tagName) {
  const match = source.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function navIconKeyByHref(href) {
  const normalized = String(href || "").trim();

  if (normalized === "/" || normalized.startsWith("/?")) {
    return "home";
  }

  if (normalized.startsWith("/minister")) {
    return "minister";
  }

  if (normalized.startsWith("/registry")) {
    return "registry";
  }

  if (normalized.startsWith("/admin")) {
    return "admin";
  }

  if (normalized.startsWith("/#petitions") || normalized.includes("#petitions")) {
    return "petitions";
  }

  return "home";
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function enhanceNavLinks(bodyHtml) {
  return bodyHtml.replace(
    /<a([^>]*class=["'][^"']*\bnav-link\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi,
    (fullMatch, attributes, content) => {
      if (/class=["'][^"']*\bnav-icon\b[^"']*["']/i.test(content) || /data-icon-ready=["']1["']/i.test(attributes)) {
        return fullMatch;
      }

      const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);
      const href = hrefMatch ? hrefMatch[1] : "/";
      const label = stripTags(content);
      const iconKey = navIconKeyByHref(href);
      const iconSvg = NAV_ICON_SVG[iconKey] || NAV_ICON_SVG.home;

      let nextAttributes = attributes;

      if (!/data-icon-ready=/i.test(nextAttributes)) {
        nextAttributes += ' data-icon-ready="1"';
      }

      if (!/data-nav-label=/i.test(nextAttributes)) {
        nextAttributes += ` data-nav-label="${label}"`;
      }

      if (!/title=/i.test(nextAttributes)) {
        nextAttributes += ` title="${label}"`;
      }

      return `<a${nextAttributes}><span class="nav-icon" aria-hidden="true">${iconSvg}</span><span class="nav-label">${label}</span></a>`;
    }
  );
}

function extractBody(source) {
  const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error("Template file does not contain a <body> tag");
  }

  // Scripts are injected by Next.js via <Script />.
  const rawBody = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "").trim();
  return enhanceNavLinks(rawBody);
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

