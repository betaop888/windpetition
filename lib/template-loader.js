import fs from "fs";
import path from "path";

const NAV_ICON_SVG = {
  home: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.75 10.5L12 4L20.25 10.5V19.25C20.25 19.8 19.8 20.25 19.25 20.25H14.5V14H9.5V20.25H4.75C4.2 20.25 3.75 19.8 3.75 19.25V10.5Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path></svg>',
  minister:
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="8.5" cy="9" r="2.25" stroke="currentColor" stroke-width="1.9"></circle><circle cx="15.5" cy="9" r="2.25" stroke="currentColor" stroke-width="1.9"></circle><path d="M4.5 18.75C4.9 16.3 6.45 14.75 8.5 14.75C10.55 14.75 12.1 16.3 12.5 18.75" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path><path d="M11.5 18.75C11.9 16.3 13.45 14.75 15.5 14.75C17.55 14.75 19.1 16.3 19.5 18.75" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg>',
  registry:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4.75C5 4.2 5.45 3.75 6 3.75H17.25C17.8 3.75 18.25 4.2 18.25 4.75V19.25C18.25 19.8 17.8 20.25 17.25 20.25H6C5.45 20.25 5 19.8 5 19.25V4.75Z" stroke="currentColor" stroke-width="1.9"></path><path d="M8.25 8.25H15M8.25 12H15M8.25 15.75H13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg>',
  admin:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.75L18.75 6.5V11.5C18.75 15.85 16.35 19.05 12 20.25C7.65 19.05 5.25 15.85 5.25 11.5V6.5L12 3.75Z" stroke="currentColor" stroke-width="1.9"></path><path d="M12 8.2L12.9 10.05L14.95 10.35L13.45 11.8L13.8 13.85L12 12.9L10.2 13.85L10.55 11.8L9.05 10.35L11.1 10.05L12 8.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path></svg>',
  petitions:
    '<svg viewBox="0 0 24 24" fill="none"><rect x="4.75" y="4.75" width="14.5" height="14.5" rx="1.8" stroke="currentColor" stroke-width="1.9"></rect><path d="M8 9.25H15.8M8 12.25H15.8M8 15.25H12.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path><path d="M16.85 17.6L19.75 20.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg>',
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
