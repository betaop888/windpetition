const ROLE_ADMIN = "admin";
const ROLE_CHAMBER = "chamber";
const ROLE_MINISTER = "minister";
const ROLE_CITIZEN = "citizen";

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const MOSCOW_UTC_OFFSET_MINUTES = 180;

const state = {
  currentUser: null,
  notifications: [],
  unreadNotifications: 0,
  notificationsLoaded: false,
  notificationsOpen: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDisplayText(value, options = {}) {
  const multiline = options.multiline !== false;
  const source = String(value ?? "").replace(/\r\n?/g, "\n").trim();

  if (!source) {
    return "";
  }

  if (!multiline) {
    return source.replace(/\s+/g, " ");
  }

  const lines = source.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  const normalizedLines = [];
  let consecutiveEmptyLines = 0;

  for (const line of lines) {
    if (!line.trim()) {
      if (consecutiveEmptyLines >= 1) {
        continue;
      }
      normalizedLines.push("");
      consecutiveEmptyLines += 1;
      continue;
    }

    consecutiveEmptyLines = 0;
    normalizedLines.push(line);
  }

  return normalizedLines.join("\n");
}

function shortenSingleLineText(value, maxLength = 120) {
  const text = normalizeDisplayText(value, { multiline: false });
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function proposalSkeletonTemplate(count = 4) {
  return Array.from({ length: count })
    .map(() => {
      return `
        <article class="petition-card skeleton-card" aria-hidden="true">
          <div class="skeleton-line skeleton-line-avatar"></div>
          <div class="skeleton-line skeleton-line-badge"></div>
          <div class="skeleton-line skeleton-line-title"></div>
          <div class="skeleton-line skeleton-line-text"></div>
          <div class="skeleton-line skeleton-line-text short"></div>
        </article>
      `;
    })
    .join("");
}

function isAdmin(user = state.currentUser) {
  return Boolean(user && user.role === ROLE_ADMIN);
}

function isMinister(user = state.currentUser) {
  return Boolean(user && (user.role === ROLE_MINISTER || user.role === ROLE_ADMIN));
}

function isChamberMember(user = state.currentUser) {
  return Boolean(
    user &&
      (user.role === ROLE_CHAMBER || user.role === ROLE_MINISTER || user.role === ROLE_ADMIN)
  );
}

function roleLabel(role) {
  if (role === ROLE_ADMIN) {
    return "администратор";
  }

  if (role === ROLE_MINISTER) {
    return "министр";
  }

  if (role === ROLE_CHAMBER) {
    return "член палаты";
  }

  return "гражданин";
}

function roleTitle(role) {
  const label = roleLabel(role);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rolesForUser(user) {
  const role = user?.role;

  if (role === ROLE_ADMIN) {
    return [ROLE_CITIZEN, ROLE_CHAMBER, ROLE_MINISTER, ROLE_ADMIN];
  }

  if (role === ROLE_MINISTER) {
    return [ROLE_CITIZEN, ROLE_CHAMBER, ROLE_MINISTER];
  }

  if (role === ROLE_CHAMBER) {
    return [ROLE_CITIZEN, ROLE_CHAMBER];
  }

  return [ROLE_CITIZEN];
}

function roleIconSvg(role) {
  if (role === ROLE_ADMIN) {
    return '<svg viewBox="0 0 20 20" fill="none"><path d="M10 2.5L15.5 4.8V8.9C15.5 12.45 13.55 15.08 10 16.15C6.45 15.08 4.5 12.45 4.5 8.9V4.8L10 2.5Z" stroke="currentColor" stroke-width="1.6"></path><path d="M10 6.2L10.6 7.45L12 7.65L11 8.65L11.25 10.05L10 9.4L8.75 10.05L9 8.65L8 7.65L9.4 7.45L10 6.2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path></svg>';
  }

  if (role === ROLE_MINISTER) {
    return '<svg viewBox="0 0 20 20" fill="none"><circle cx="7" cy="7.6" r="2" stroke="currentColor" stroke-width="1.6"></circle><circle cx="13" cy="7.6" r="2" stroke="currentColor" stroke-width="1.6"></circle><path d="M3.9 15.5C4.3 13.35 5.6 12 7 12C8.4 12 9.7 13.35 10.1 15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path><path d="M9.9 15.5C10.3 13.35 11.6 12 13 12C14.4 12 15.7 13.35 16.1 15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
  }

  if (role === ROLE_CHAMBER) {
    return '<svg viewBox="0 0 20 20" fill="none"><path d="M4.4 4.4H15.6V15.6H4.4V4.4Z" stroke="currentColor" stroke-width="1.6"></path><path d="M7 7.2H13M7 10H13M7 12.8H11.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
  }

  return '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6.8" r="2.35" stroke="currentColor" stroke-width="1.6"></circle><path d="M5 15.4C5.45 12.85 7.15 11.3 10 11.3C12.85 11.3 14.55 12.85 15 15.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
}

function roleBadgeTemplate(role) {
  return `
    <span class="role-chip role-${role}">
      <span class="role-chip-icon" aria-hidden="true">${roleIconSvg(role)}</span>
      <span>${escapeHtml(roleTitle(role))}</span>
    </span>
  `;
}

function proposalKindLabel(kind) {
  return kind === "law" ? "Законопроект" : "Петиция";
}

function voteLabel(value) {
  if (value === "for") {
    return "За";
  }

  if (value === "against") {
    return "Против";
  }

  if (value === "abstain") {
    return "Воздержался";
  }

  return "-";
}

function safeAvatar(url, size = 40) {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    return url;
  }

  return `/placeholder.svg?height=${size}&width=${size}`;
}

function moscowParts(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MOSCOW_TIME_ZONE,
  }).format(date);
}

function toMoscowDateTimeValue(date) {
  const parts = moscowParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseMoscowDateTimeInput(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, y, m, d, h, min] = match;
  const year = Number.parseInt(y, 10);
  const month = Number.parseInt(m, 10);
  const day = Number.parseInt(d, 10);
  const hour = Number.parseInt(h, 10);
  const minute = Number.parseInt(min, 10);

  const utcMs = Date.UTC(year, month - 1, day, hour - MOSCOW_UTC_OFFSET_MINUTES / 60, minute);
  const result = new Date(utcMs);

  if (Number.isNaN(result.getTime())) {
    return null;
  }

  return result;
}

function getStatusMeta(proposal) {
  if (proposal.status === "sent_review") {
    return {
      text: "Отправлено на рассмотрение",
      indicatorClass: "approved",
      statusClass: "approved",
    };
  }

  if (proposal.status === "rejected") {
    return {
      text: "Отклонено",
      indicatorClass: "expired",
      statusClass: "expired",
    };
  }

  return {
    text: `До ${formatDateTime(proposal.deadlineAt)}`,
    indicatorClass: "",
    statusClass: "",
  };
}

function percentage(part, total) {
  if (!total) {
    return 0;
  }

  return Math.round((part / total) * 100);
}

function asVoteNumber(value) {
  if (Number.isInteger(value)) {
    return value;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function canSeeVoteTotals(proposal, user = state.currentUser) {
  if (!proposal) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  return !proposal.voteTotalsHidden;
}

function readCache(key) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeCache(key, value) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // ignore cache errors
  }
}

function formatProposalId(proposal) {
  const rawPublicId = String(proposal?.publicId || "").trim();
  if (/^\d{4,}$/.test(rawPublicId)) {
    return rawPublicId;
  }

  const numeric = Number.parseInt(String(proposal?.id || ""), 10);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return "0000";
  }

  return String(numeric).padStart(4, "0");
}

function navIconSvg(key) {
  if (key === "home") {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M4.25 10.75L12 4.75L19.75 10.75V18.5C19.75 19.19 19.19 19.75 18.5 19.75H14.25V14.25H9.75V19.75H5.5C4.81 19.75 4.25 19.19 4.25 18.5V10.75Z" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round"></path></svg>';
  }

  if (key === "minister") {
    return '<svg viewBox="0 0 24 24" fill="none"><circle cx="8.3" cy="8.7" r="2.2" stroke="currentColor" stroke-width="1.8"></circle><circle cx="15.7" cy="8.7" r="2.2" stroke="currentColor" stroke-width="1.8"></circle><path d="M4.9 18.9C5.4 16.55 6.95 15.1 8.3 15.1C9.65 15.1 11.2 16.55 11.7 18.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M12.3 18.9C12.8 16.55 14.35 15.1 15.7 15.1C17.05 15.1 18.6 16.55 19.1 18.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
  }

  if (key === "registry") {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M5.6 4.8C5.6 4.25 6.05 3.8 6.6 3.8H17.25C17.8 3.8 18.25 4.25 18.25 4.8V19.2C18.25 19.75 17.8 20.2 17.25 20.2H6.6C6.05 20.2 5.6 19.75 5.6 19.2V4.8Z" stroke="currentColor" stroke-width="1.8"></path><path d="M8.1 8.35H15.6M8.1 12H15.6M8.1 15.65H12.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
  }

  if (key === "admin") {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.1L18.25 6.65V11.35C18.25 15.45 15.95 18.55 12 19.8C8.05 18.55 5.75 15.45 5.75 11.35V6.65L12 4.1Z" stroke="currentColor" stroke-width="1.85"></path><path d="M9.2 12.05L11.05 13.9L14.8 10.15" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  }

  if (key === "petitions") {
    return '<svg viewBox="0 0 24 24" fill="none"><rect x="4.9" y="4.5" width="13.7" height="14.9" rx="2" stroke="currentColor" stroke-width="1.8"></rect><path d="M8 8.5H15M8 12H15M8 15.5H12.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M15.3 16.7L18.8 20.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
  }

  return '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"></circle></svg>';
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

function enhanceSidebarNavigation() {
  const body = document.body;
  if (!body) {
    return;
  }

  body.classList.add("with-sidebar-layout");

  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.iconReady === "1") {
      return;
    }

    const label = link.textContent.trim();
    const iconKey = navIconKeyByHref(link.getAttribute("href"));
    link.dataset.iconReady = "1";
    link.dataset.navLabel = label;
    link.setAttribute("title", label);
    link.innerHTML = `
      <span class="nav-icon" aria-hidden="true">${navIconSvg(iconKey)}</span>
      <span class="nav-label">${escapeHtml(label)}</span>
    `;
  });
}

function ensureNotificationsUI() {
  const button = document.querySelector(".notification-btn");
  const navUser = document.querySelector(".nav-user");

  if (!button || !navUser) {
    return null;
  }

  if (!button.querySelector(".notification-count")) {
    const badge = document.createElement("span");
    badge.className = "notification-count";
    badge.style.display = "none";
    button.appendChild(badge);
  }

  let popover = document.getElementById("notificationsPopover");
  if (!popover) {
    popover = document.createElement("div");
    popover.id = "notificationsPopover";
    popover.className = "notifications-popover";
    popover.innerHTML = `
      <div class="notifications-header">
        <h3>Уведомления</h3>
        <div class="notifications-header-actions">
          <button class="notifications-open-page" type="button" id="notificationsOpenPage">Открыть страницу</button>
          <button class="notifications-mark-all" type="button" id="notificationsMarkAll">Прочитать все</button>
        </div>
      </div>
      <div class="notifications-list" id="notificationsList">
        <p class="empty-message compact-empty">Нет уведомлений</p>
      </div>
    `;
    navUser.appendChild(popover);
  }

  return {
    button,
    badge: button.querySelector(".notification-count"),
    popover,
    list: popover.querySelector("#notificationsList"),
    markAllButton: popover.querySelector("#notificationsMarkAll"),
    openPageButton: popover.querySelector("#notificationsOpenPage"),
  };
}

function renderNotifications() {
  const ui = ensureNotificationsUI();
  if (!ui) {
    return;
  }

  const unread = Number(state.unreadNotifications || 0);
  if (ui.badge) {
    if (unread > 0) {
      ui.badge.style.display = "inline-flex";
      ui.badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      ui.badge.style.display = "none";
      ui.badge.textContent = "";
    }
  }

  if (!ui.list) {
    return;
  }

  if (!state.currentUser) {
    ui.list.innerHTML = '<p class="empty-message compact-empty">Войдите через Discord, чтобы видеть уведомления.</p>';
    return;
  }

  if (!state.notificationsLoaded) {
    ui.list.innerHTML = '<p class="empty-message compact-empty">Загрузка...</p>';
    return;
  }

  if (!state.notifications.length) {
    ui.list.innerHTML = '<p class="empty-message compact-empty">Нет уведомлений</p>';
    return;
  }

  ui.list.innerHTML = state.notifications
    .map((item) => {
      const href = typeof item.href === "string" && item.href.startsWith("/") ? item.href : "";
      const title = shortenSingleLineText(item.title, 64);
      const message = shortenSingleLineText(item.message, 96);
      return `
        <button class="notification-item ${item.isRead ? "" : "unread"}" type="button" data-id="${item.id}" data-href="${escapeHtml(href)}">
          <div class="notification-item-title" title="${escapeHtml(item.title)}">${escapeHtml(title)}</div>
          <div class="notification-item-message" title="${escapeHtml(item.message)}">${escapeHtml(message)}</div>
          <div class="notification-item-time">${formatDateTime(item.createdAt)} МСК</div>
        </button>
      `;
    })
    .join("");
}

async function loadNotifications(force = false) {
  if (!state.currentUser) {
    state.notifications = [];
    state.unreadNotifications = 0;
    state.notificationsLoaded = true;
    renderNotifications();
    return;
  }

  if (state.notificationsLoaded && !force) {
    renderNotifications();
    return;
  }

  try {
    const data = await api("/api/notifications/list?limit=40");
    state.notifications = data.notifications || [];
    state.unreadNotifications = Number(data.unreadCount || 0);
    state.notificationsLoaded = true;
    renderNotifications();
  } catch (error) {
    console.error("Failed to load notifications", error);
    state.notifications = [];
    state.unreadNotifications = 0;
    state.notificationsLoaded = true;
    renderNotifications();
  }
}

async function markNotificationRead(notificationId) {
  const parsedId = Number.parseInt(String(notificationId || ""), 10);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return;
  }

  try {
    const data = await api("/api/notifications/read", {
      method: "POST",
      body: { id: parsedId },
    });
    state.unreadNotifications = Number(data.unreadCount || 0);
    state.notifications = state.notifications.map((item) => {
      if (item.id !== parsedId) {
        return item;
      }

      return {
        ...item,
        isRead: true,
      };
    });
    renderNotifications();
  } catch (error) {
    console.error("Failed to mark notification as read", error);
  }
}

async function markAllNotificationsRead() {
  if (!state.currentUser) {
    return;
  }

  try {
    const data = await api("/api/notifications/read", {
      method: "POST",
      body: { all: true },
    });
    state.unreadNotifications = Number(data.unreadCount || 0);
    state.notifications = state.notifications.map((item) => ({
      ...item,
      isRead: true,
    }));
    renderNotifications();
  } catch (error) {
    console.error("Failed to mark all notifications as read", error);
  }
}

function bindNotifications() {
  const ui = ensureNotificationsUI();
  if (!ui || ui.button.dataset.bound === "1") {
    renderNotifications();
    return;
  }

  ui.button.dataset.bound = "1";

  ui.button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!state.currentUser) {
      showAuthRequired("Для уведомлений войдите через Discord.");
      return;
    }

    state.notificationsOpen = !state.notificationsOpen;
    ui.popover.classList.toggle("active", state.notificationsOpen);

    if (state.notificationsOpen) {
      await loadNotifications(true);
    }
  });

  ui.openPageButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.location.href = "/notifications";
  });

  ui.markAllButton?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await markAllNotificationsRead();
  });

  ui.list?.addEventListener("click", async (event) => {
    const button = event.target.closest(".notification-item");
    if (!button) {
      return;
    }

    const id = Number.parseInt(button.dataset.id || "", 10);
    const href = String(button.dataset.href || "").trim();
    await markNotificationRead(id);

    if (href) {
      window.location.href = href;
      return;
    }
  });

  document.addEventListener("click", (event) => {
    if (!ui.popover.classList.contains("active")) {
      return;
    }

    if (ui.popover.contains(event.target) || ui.button.contains(event.target)) {
      return;
    }

    state.notificationsOpen = false;
    ui.popover.classList.remove("active");
  });

  renderNotifications();
}

async function api(path, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {},
  };

  if (options.body !== undefined) {
    requestOptions.headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, requestOptions);
  const contentType = response.headers.get("content-type") || "";
  let payload = {};

  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function openDiscordAuth() {
  window.location.href = "/api/auth/discord";
}

function showAuthRequired(message) {
  const modal = document.getElementById("authModal");
  const text = document.getElementById("authRequiredText");

  if (text) {
    text.textContent = message || "Для работы с сайтом войдите через Discord.";
  }

  if (modal) {
    modal.classList.add("active");
  }
}

function hideAuthRequired() {
  const modal = document.getElementById("authModal");
  if (modal) {
    modal.classList.remove("active");
  }
}

function ensureConfirmModal() {
  let modal = document.getElementById("confirmModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "confirmModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content confirm-modal-content">
        <h2 class="modal-title" id="confirmModalTitle">Подтвердите действие</h2>
        <p class="modal-text" id="confirmModalText">Это действие требует подтверждения.</p>
        <div class="form-actions confirm-modal-actions">
          <button class="btn btn-secondary" type="button" id="confirmModalCancel">Отмена</button>
          <button class="btn btn-primary" type="button" id="confirmModalSubmit">Подтвердить</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  return {
    modal,
    title: modal.querySelector("#confirmModalTitle"),
    text: modal.querySelector("#confirmModalText"),
    submit: modal.querySelector("#confirmModalSubmit"),
    cancel: modal.querySelector("#confirmModalCancel"),
  };
}

function showConfirmModal(options = {}) {
  const ui = ensureConfirmModal();
  const modalTitle = String(options.title || "Подтвердите действие");
  const modalText = String(options.text || "Это действие требует подтверждения.");
  const confirmText = String(options.confirmText || "Подтвердить");
  const cancelText = String(options.cancelText || "Отмена");
  const danger = Boolean(options.danger);

  ui.title.textContent = modalTitle;
  ui.text.textContent = modalText;
  ui.submit.textContent = confirmText;
  ui.cancel.textContent = cancelText;

  ui.submit.classList.remove("btn-primary", "btn-danger");
  ui.submit.classList.add(danger ? "btn-danger" : "btn-primary");

  ui.modal.classList.add("active");

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      ui.submit.removeEventListener("click", onConfirm);
      ui.cancel.removeEventListener("click", onCancel);
      ui.modal.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onEscape);
    };

    const finish = (value) => {
      if (resolved) {
        return;
      }

      resolved = true;
      ui.modal.classList.remove("active");
      cleanup();
      resolve(value);
    };

    const onConfirm = (event) => {
      event.preventDefault();
      finish(true);
    };

    const onCancel = (event) => {
      event.preventDefault();
      finish(false);
    };

    const onBackdropClick = (event) => {
      if (event.target === ui.modal) {
        finish(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === "Escape") {
        finish(false);
      }
    };

    ui.submit.addEventListener("click", onConfirm);
    ui.cancel.addEventListener("click", onCancel);
    ui.modal.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onEscape);
    ui.submit.focus();
  });
}

function ensureNoticeModal() {
  let modal = document.getElementById("noticeModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "noticeModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content confirm-modal-content notice-modal-content">
        <h2 class="modal-title" id="noticeModalTitle">Сообщение</h2>
        <p class="modal-text" id="noticeModalText">Операция выполнена.</p>
        <div class="form-actions confirm-modal-actions notice-modal-actions">
          <button class="btn btn-primary" type="button" id="noticeModalSubmit">Понятно</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  return {
    modal,
    title: modal.querySelector("#noticeModalTitle"),
    text: modal.querySelector("#noticeModalText"),
    submit: modal.querySelector("#noticeModalSubmit"),
  };
}

function showNoticeModal(options = {}) {
  const ui = ensureNoticeModal();
  const modalTitle = String(options.title || "Сообщение");
  const modalText = String(options.text || "Операция выполнена.");
  const buttonText = String(options.buttonText || "Понятно");

  ui.title.textContent = modalTitle;
  ui.text.textContent = modalText;
  ui.submit.textContent = buttonText;
  ui.modal.classList.add("active");

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      ui.submit.removeEventListener("click", onClose);
      ui.modal.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onEscape);
    };

    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      ui.modal.classList.remove("active");
      cleanup();
      resolve(true);
    };

    const onClose = (event) => {
      event.preventDefault();
      finish();
    };

    const onBackdropClick = (event) => {
      if (event.target === ui.modal) {
        finish();
      }
    };

    const onEscape = (event) => {
      if (event.key === "Escape") {
        finish();
      }
    };

    ui.submit.addEventListener("click", onClose);
    ui.modal.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onEscape);
    ui.submit.focus();
  });
}

function appAlert(message, title = "Сообщение") {
  void showNoticeModal({
    title,
    text: String(message || ""),
    buttonText: "Понятно",
  });
}

function showVoteConfirmModal(voteText) {
  return showConfirmModal({
    title: "Подтвердите голос",
    text: `Вы выбрали: «${voteText}». После отправки изменить голос нельзя.`,
    confirmText: "Подтвердить",
    cancelText: "Отмена",
  });
}

function bindDiscordButtons() {
  const buttons = document.querySelectorAll(".discord-login-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", openDiscordAuth);
  });
}

function bindLogoutButton() {
  const logoutButton = document.getElementById("logoutBtn");
  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      appAlert(error.message);
    }

    window.location.href = "/";
  });
}

function bindUserMenu() {
  const userMenu = document.querySelector(".user-menu");
  const userAvatar = document.getElementById("userAvatar");
  const userDropdown = document.getElementById("userDropdown");

  if (!userMenu || !userAvatar || userAvatar.dataset.bound === "1") {
    return;
  }

  userAvatar.dataset.bound = "1";

  userAvatar.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    userMenu.classList.toggle("open");
  });

  userDropdown?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", (event) => {
    if (!userMenu.contains(event.target)) {
      userMenu.classList.remove("open");
    }
  });
}

function bindHeroButtons() {
  const heroProfileButton = document.getElementById("heroProfileBtn");
  if (!heroProfileButton) {
    return;
  }

  heroProfileButton.addEventListener("click", () => {
    if (!state.currentUser) {
      showAuthRequired("Сначала войдите через Discord.");
      return;
    }

    window.location.href = "/profile";
  });
}

function updateCommonUserUI() {
  const user = state.currentUser;

  const userAvatar = document.getElementById("userAvatar");
  const dropdownAvatar = document.getElementById("dropdownAvatar");
  const dropdownUsername = document.getElementById("dropdownUsername");
  const dropdownUserInfo = document.getElementById("dropdownUserInfo");
  const logoutButton = document.getElementById("logoutBtn");
  const discordButton = document.getElementById("discordLoginBtnDropdown");

  if (user) {
    const avatarUrl = safeAvatar(user.avatarUrl, 80);

    if (userAvatar) {
      userAvatar.src = avatarUrl;
    }

    if (dropdownAvatar) {
      dropdownAvatar.src = avatarUrl;
    }

    if (dropdownUsername) {
      dropdownUsername.textContent = user.username;
    }

    if (dropdownUserInfo) {
      dropdownUserInfo.style.display = "flex";
    }

    if (logoutButton) {
      logoutButton.style.display = "block";
    }

    if (discordButton) {
      discordButton.style.display = "none";
    }
  } else {
    if (dropdownUserInfo) {
      dropdownUserInfo.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "none";
    }

    if (discordButton) {
      discordButton.style.display = "block";
    }
  }

  const ministerNavLink = document.getElementById("ministerNavLink");
  if (ministerNavLink) {
    ministerNavLink.style.display = isMinister(user) ? "flex" : "none";
  }

  const adminNavLink = document.getElementById("adminNavLink");
  if (adminNavLink) {
    adminNavLink.style.display = isAdmin(user) ? "flex" : "none";
  }

  renderNotifications();
}

function proposalCardTemplate(proposal) {
  const statusMeta = getStatusMeta(proposal);
  const showVotes = canSeeVoteTotals(proposal);
  const proposalCode = formatProposalId(proposal);
  const safeTitle = normalizeDisplayText(proposal.title, { multiline: false });
  const safeDescription = normalizeDisplayText(proposal.description);

  return `
    <a href="/petition-detail?id=${proposal.id}" class="petition-card">
      <div class="petition-card-header">
        <img src="${safeAvatar(proposal.author.avatarUrl, 48)}" alt="${escapeHtml(proposal.author.username)}" class="petition-card-icon">
        <div class="petition-card-owner">${escapeHtml(proposal.author.username)}</div>
      </div>
      <div class="card-badges">
        <span class="mini-badge mini-badge-id">#${proposalCode}</span>
        <span class="mini-badge">${proposalKindLabel(proposal.kind)}</span>
        <span class="mini-badge">${proposal.scope === "minister" ? "Министры" : "Публично"}</span>
      </div>
      <h3 class="petition-card-title">${escapeHtml(safeTitle)}</h3>
      <p class="petition-card-description">${escapeHtml(safeDescription)}</p>
      <div class="petition-card-meta">
        <div class="petition-card-status">
          <span class="status-indicator ${statusMeta.indicatorClass}"></span>
          <span>${statusMeta.text}</span>
        </div>
        <div class="petition-card-stats three-vote-stats">
          ${
            showVotes
              ? `
                <span>За: ${asVoteNumber(proposal.votes.for)}</span>
                <span>Против: ${asVoteNumber(proposal.votes.against)}</span>
                <span>Воздерж.: ${asVoteNumber(proposal.votes.abstain)}</span>
              `
              : '<span class="results-hidden-label">Результаты скрыты до завершения голосования</span>'
          }
        </div>
      </div>
    </a>
  `;
}

async function initProposalBoard(scope, options) {
  const grid = document.getElementById("petitionsGrid");
  const count = document.getElementById("petitionsCount");
  const searchInput = document.getElementById("searchInput");
  const tabs = document.querySelectorAll(".tab");
  const createButton = document.getElementById(options.createButtonId);

  if (!grid) {
    return;
  }

  if (scope === "minister" && !isMinister()) {
    grid.innerHTML = '<p class="empty-message">Раздел недоступен для вашей роли.</p>';
    if (createButton) {
      createButton.style.display = "none";
    }
    return;
  }

  if (createButton) {
    if (options.canCreate && !options.canCreate(state.currentUser)) {
      createButton.style.display = "none";
    } else {
      createButton.addEventListener("click", () => {
        window.location.href = options.createUrl;
      });
    }
  }

  let currentFilter = "all";
  let proposals = [];

  const render = () => {
    const query = (searchInput?.value || "").trim().toLowerCase();

    let filtered = proposals;

    if (currentFilter === "my") {
      filtered = filtered.filter((proposal) => proposal.author.id === state.currentUser.id);
    }

    if (query) {
      filtered = filtered.filter((proposal) => {
        return (
          proposal.title.toLowerCase().includes(query) ||
          proposal.description.toLowerCase().includes(query)
        );
      });
    }

    if (count) {
      count.textContent = String(filtered.length);
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="empty-message">Голосования не найдены</p>';
      return;
    }

    grid.innerHTML = filtered.map(proposalCardTemplate).join("");
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter || "all";
      render();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", render);
  }

  try {
    const cacheKey = `wp:proposals:${scope}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached)) {
      proposals = cached;
      render();
    } else {
      grid.innerHTML = proposalSkeletonTemplate(4);
    }

    const data = await api(`/api/proposals/list?scope=${scope}`);
    proposals = data.proposals || [];
    writeCache(cacheKey, proposals);
    render();
  } catch (error) {
    if (error.status === 401) {
      showAuthRequired("Для просмотра голосований нужно войти через Discord.");
      return;
    }

    grid.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
  }
}

async function loadHomeStats() {
  const usersCountEl = document.getElementById("heroUsersCount");
  const proposalsCountEl = document.getElementById("heroProposalsCount");
  if (!usersCountEl || !proposalsCountEl) {
    return;
  }

  try {
    const stats = await api("/api/stats/public");
    const usersCount = Number(stats.usersCount || 0);
    const proposalsCount = Number(stats.proposalsCount || 0);
    usersCountEl.textContent = `${usersCount}+`;
    proposalsCountEl.textContent = String(proposalsCount);
  } catch (error) {
    usersCountEl.textContent = "0+";
    proposalsCountEl.textContent = "0";
  }
}

async function initHomePage() {
  await Promise.all([
    initProposalBoard("public", {
      createButtonId: "createPetitionBtn",
      createUrl: "/create-petition?scope=public",
      canCreate: (user) => Boolean(user),
    }),
    loadHomeStats(),
  ]);
}
async function initMinisterPage() {
  await initProposalBoard("minister", {
    createButtonId: "createMinisterProposalBtn",
    createUrl: "/create-petition?scope=minister",
    canCreate: (user) => isMinister(user),
  });
}

function renderVoteList(listElementId, users) {
  const container = document.getElementById(listElementId);
  if (!container) {
    return;
  }

  if (!users || users.length === 0) {
    container.innerHTML = '<p class="empty-message compact-empty">Нет голосов</p>';
    return;
  }

  container.innerHTML = users
    .map((user) => {
      return `
        <div class="user-item">
          <img src="${safeAvatar(user.avatarUrl, 32)}" alt="${escapeHtml(user.username)}" class="user-item-avatar">
          <span class="user-item-name">${escapeHtml(user.username)}</span>
        </div>
      `;
    })
    .join("");
}

function updateVoteNumbers(proposal) {
  const showVotes = canSeeVoteTotals(proposal);
  const forVotes = asVoteNumber(proposal.votes.for);
  const againstVotes = asVoteNumber(proposal.votes.against);
  const abstainVotes = asVoteNumber(proposal.votes.abstain);
  const total = asVoteNumber(proposal.votes.total);
  const forPercent = percentage(forVotes, total);
  const againstPercent = percentage(againstVotes, total);
  const abstainPercent = percentage(abstainVotes, total);

  const forCount = document.getElementById("forCount");
  const againstCount = document.getElementById("againstCount");
  const abstainCount = document.getElementById("abstainCount");
  const voteCountBlock = document.getElementById("voteCountBlock");
  const resultsHiddenNotice = document.getElementById("resultsHiddenNotice");

  if (showVotes) {
    if (forCount) {
      forCount.textContent = String(forVotes);
    }

    if (againstCount) {
      againstCount.textContent = String(againstVotes);
    }

    if (abstainCount) {
      abstainCount.textContent = String(abstainVotes);
    }

    if (voteCountBlock) {
      voteCountBlock.style.display = "flex";
    }

    if (resultsHiddenNotice) {
      resultsHiddenNotice.style.display = "none";
    }
  } else {
    if (voteCountBlock) {
      voteCountBlock.style.display = "none";
    }

    if (resultsHiddenNotice) {
      resultsHiddenNotice.style.display = "block";
    }
  }

  const statBarFor = document.getElementById("statBarFor");
  const statBarAgainst = document.getElementById("statBarAgainst");
  const statBarAbstain = document.getElementById("statBarAbstain");

  if (statBarFor) {
    statBarFor.style.width = showVotes ? `${forPercent}%` : "33.34%";
  }

  if (statBarAgainst) {
    statBarAgainst.style.width = showVotes ? `${againstPercent}%` : "33.33%";
  }

  if (statBarAbstain) {
    statBarAbstain.style.width = showVotes ? `${abstainPercent}%` : "33.33%";
  }
}

function updateVotingBlock(proposal) {
  const voteMessage = document.getElementById("voteMessage");
  const votingButtons = document.querySelectorAll("#votingButtons .vote-btn");
  const isOpen = proposal.status === "open" && new Date(proposal.deadlineAt) > new Date();

  votingButtons.forEach((button) => {
    button.classList.remove("voted");
    button.disabled = true;
  });

  if (!isOpen) {
    if (voteMessage) {
      voteMessage.textContent = "Голосование завершено.";
      voteMessage.classList.add("active");
    }
    return;
  }

  if (proposal.myVote) {
    const selectedButton = document.querySelector(`#votingButtons .vote-btn[data-vote="${proposal.myVote}"]`);
    if (selectedButton) {
      selectedButton.classList.add("voted");
    }

    if (voteMessage) {
      voteMessage.textContent = `Ваш голос: ${voteLabel(proposal.myVote)}`;
      voteMessage.classList.add("active");
    }

    return;
  }

  votingButtons.forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", async () => {
      const voteValue = button.dataset.vote;
      if (!voteValue) {
        return;
      }

      const voteText = voteLabel(voteValue);
      const isConfirmed = await showVoteConfirmModal(voteText);
      if (!isConfirmed) {
        return;
      }

      votingButtons.forEach((item) => {
        item.disabled = true;
      });

      try {
        await api("/api/proposals/vote", {
          method: "POST",
          body: {
            proposalId: proposal.id,
            value: voteValue,
          },
        });

        window.location.reload();
      } catch (error) {
        votingButtons.forEach((item) => {
          item.disabled = false;
        });
        appAlert(error.message);
      }
    });
  });

  if (voteMessage) {
    voteMessage.classList.remove("active");
    voteMessage.textContent = "";
  }
}

async function initDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const proposalId = Number.parseInt(params.get("id"), 10);

  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    window.location.href = "/";
    return;
  }

  try {
    const data = await api(`/api/proposals/get?id=${proposalId}`);
    const proposal = data.proposal;
    const statusMeta = getStatusMeta(proposal);

    const titleElement = document.getElementById("petitionTitle");
    const breadcrumbTitle = document.getElementById("breadcrumbTitle");
    const description = document.getElementById("petitionDescription");
    const petitionDate = document.getElementById("petitionDate");
    const petitionStatus = document.getElementById("petitionStatus");
    const petitionCode = document.getElementById("petitionCode");
    const petitionOwner = document.getElementById("petitionOwner");
    const petitionOwnerAvatar = document.getElementById("petitionOwnerAvatar");
    const petitionKind = document.getElementById("petitionKind");

    if (titleElement) {
      titleElement.textContent = normalizeDisplayText(proposal.title, { multiline: false });
    }

    if (breadcrumbTitle) {
      breadcrumbTitle.textContent = normalizeDisplayText(proposal.title, { multiline: false });
    }

    if (description) {
      description.textContent = normalizeDisplayText(proposal.description);
    }

    if (petitionDate) {
      petitionDate.textContent = `Создано ${formatDateTime(proposal.createdAt)}`;
    }

    if (petitionStatus) {
      petitionStatus.textContent = statusMeta.text;
      petitionStatus.classList.remove("expired", "approved");
      if (statusMeta.statusClass) {
        petitionStatus.classList.add(statusMeta.statusClass);
      }
    }

    if (petitionCode) {
      petitionCode.textContent = `ID: ${formatProposalId(proposal)}`;
    }

    if (petitionOwner) {
      petitionOwner.textContent = proposal.author.username;
    }

    if (petitionOwnerAvatar) {
      petitionOwnerAvatar.src = safeAvatar(proposal.author.avatarUrl, 40);
    }

    if (petitionKind) {
      petitionKind.textContent = proposalKindLabel(proposal.kind);
    }

    updateVotingBlock(proposal);
    updateVoteNumbers(proposal);

    const votersForCount = document.getElementById("votersForCount");
    const votersAgainstCount = document.getElementById("votersAgainstCount");
    const votersAbstainCount = document.getElementById("votersAbstainCount");

    if (votersForCount) {
      votersForCount.textContent = String(asVoteNumber(proposal.votes.for));
    }

    if (votersAgainstCount) {
      votersAgainstCount.textContent = String(asVoteNumber(proposal.votes.against));
    }

    if (votersAbstainCount) {
      votersAbstainCount.textContent = String(asVoteNumber(proposal.votes.abstain));
    }

    const adminSection = document.getElementById("adminVotersSection");
    const anonymousSection = document.getElementById("anonymousNoticeSection");
    const adminActionsSection = document.getElementById("adminActionsSection");
    const deleteProposalButton = document.getElementById("deleteProposalBtn");

    if (data.canSeeVoters) {
      if (adminSection) {
        adminSection.style.display = "block";
      }

      if (anonymousSection) {
        anonymousSection.style.display = "none";
      }

      renderVoteList("votersForList", data.voters.for);
      renderVoteList("votersAgainstList", data.voters.against);
      renderVoteList("votersAbstainList", data.voters.abstain);
    } else {
      if (adminSection) {
        adminSection.style.display = "none";
      }

      if (anonymousSection) {
        anonymousSection.style.display = "block";
      }
    }

    if (isAdmin()) {
      if (adminActionsSection) {
        adminActionsSection.style.display = "block";
      }

      if (deleteProposalButton) {
        deleteProposalButton.addEventListener("click", async () => {
          const ok = await showConfirmModal({
            title: "Удалить голосование?",
            text: `Голосование #${formatProposalId(proposal)} будет удалено без возможности восстановления.`,
            confirmText: "Удалить",
            cancelText: "Отмена",
            danger: true,
          });
          if (!ok) {
            return;
          }

          deleteProposalButton.disabled = true;
          try {
            await api("/api/proposals/delete", {
              method: "POST",
              body: { proposalId: proposal.id },
            });
            await showNoticeModal({
              title: "Голосование удалено",
              text: "Голосование успешно удалено.",
              buttonText: "Понятно",
            });
            window.location.href = proposal.scope === "minister" ? "/minister" : "/";
          } catch (error) {
            appAlert(error.message);
            deleteProposalButton.disabled = false;
          }
        });
      }
    } else if (adminActionsSection) {
      adminActionsSection.style.display = "none";
    }
  } catch (error) {
    appAlert(error.message);
    window.location.href = "/";
  }
}

async function initCreatePage() {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get("scope") === "minister" ? "minister" : "public";

  if (scope === "minister" && !isMinister()) {
    appAlert("Недостаточно прав для этого раздела.");
    window.location.href = "/";
    return;
  }

  const createPageTitle = document.getElementById("createPageTitle");
  const createPageSubtitle = document.getElementById("createPageSubtitle");
  const scopeLabel = document.getElementById("proposalScopeLabel");
  const form = document.getElementById("createProposalForm");
  const cancelButton = document.getElementById("cancelCreateBtn");
  const submitButton = document.getElementById("submitCreateBtn");
  const deadlineInput = document.getElementById("proposalDeadline");
  const proposalTypeSelect = document.getElementById("proposalType");
  const resultRuleText = document.getElementById("resultRuleText");
  const creationLimitText = document.getElementById("creationLimitText");
  const creationLimitTitle = document.getElementById("creationLimitTitle");

  const scopeText = scope === "minister" ? "Голосования министров" : "Публичные голосования";

  if (createPageTitle) {
    createPageTitle.textContent = `Создать: ${scopeText}`;
  }

  if (createPageSubtitle) {
    createPageSubtitle.textContent = "Публикация сразу становится доступна всем пользователям в выбранном разделе.";
  }

  if (scopeLabel) {
    scopeLabel.value = scopeText;
  }

  if (resultRuleText) {
    resultRuleText.textContent = "После дедлайна: если голосов «За» больше 50%, статус станет «Отправлено на рассмотрение», иначе «Отклонено».";
  }

  if (creationLimitTitle) {
    creationLimitTitle.textContent = scope === "minister" ? "Правило раздела" : "Ограничение";
  }

  if (creationLimitText) {
    creationLimitText.textContent =
      scope === "minister"
        ? "Раздел предназначен для министерских инициатив. Голосование проводится среди министров."
        : isChamberMember()
          ? "С одного аккаунта можно создать до 2 публичных голосований за 24 часа. Вы можете публиковать петиции и законопроекты."
          : "С одного аккаунта можно создать до 2 публичных голосований за 24 часа. Для законопроектов нужна роль «член палаты».";
  }

  if (proposalTypeSelect && scope === "public") {
    const lawOption = proposalTypeSelect.querySelector('option[value=\"law\"]');
    if (lawOption) {
      lawOption.disabled = !isChamberMember();
      if (!isChamberMember()) {
        lawOption.textContent = "Законопроект (нужна роль члена палаты)";
      } else {
        lawOption.textContent = "Законопроект";
      }
    }

    if (!isChamberMember() && proposalTypeSelect.value === "law") {
      proposalTypeSelect.value = "petition";
    }
  }

  if (deadlineInput) {
    const minDate = new Date(Date.now() + 5 * 60 * 1000);
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    deadlineInput.min = toMoscowDateTimeValue(minDate);
    deadlineInput.value = toMoscowDateTimeValue(defaultDate);
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      window.location.href = scope === "minister" ? "/minister" : "/";
    });
  }

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const kind = document.getElementById("proposalType")?.value || "petition";
    const title = document.getElementById("proposalTitle")?.value || "";
    const description = document.getElementById("proposalDescription")?.value || "";
    const deadlineRaw = document.getElementById("proposalDeadline")?.value || "";

    if (scope === "public" && kind === "law" && !isChamberMember()) {
      appAlert("Для создания законопроекта нужна роль «член палаты».");
      return;
    }

    if (!deadlineRaw) {
      appAlert("Укажите дедлайн голосования.");
      return;
    }

    const deadlineAt = parseMoscowDateTimeInput(deadlineRaw);
    if (!(deadlineAt instanceof Date) || Number.isNaN(deadlineAt.getTime())) {
      appAlert("Некорректная дата дедлайна.");
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const result = await api("/api/proposals/create", {
        method: "POST",
        body: {
          scope,
          kind,
          title,
          description,
          deadlineAt: deadlineAt.toISOString(),
        },
      });

      window.location.href = `/petition-detail?id=${result.proposalId}`;
    } catch (error) {
      appAlert(error.message);
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

async function initProfilePage() {
  const profileUsername = document.getElementById("profileUsername");
  const breadcrumbUsername = document.getElementById("breadcrumbUsername");
  const profileAvatar = document.getElementById("profileAvatar");
  const profileRoleLabel = document.getElementById("profileRoleLabel");
  const profileRolesList = document.getElementById("profileRolesList");
  const userPetitionsCount = document.getElementById("userPetitionsCount");
  const userPetitionsList = document.getElementById("userPetitionsList");
  const profileTab = document.querySelector(".profile-tab");

  const params = new URLSearchParams(window.location.search);
  const requestedUserId = Number.parseInt(params.get("userId") || "", 10);

  let profileUser = state.currentUser;
  let isForeignProfile = false;

  if (
    Number.isInteger(requestedUserId) &&
    requestedUserId > 0 &&
    requestedUserId !== state.currentUser.id &&
    isAdmin()
  ) {
    try {
      const usersData = await api("/api/admin/users");
      const foundUser = (usersData.users || []).find((user) => user.id === requestedUserId);
      if (foundUser) {
        profileUser = foundUser;
        isForeignProfile = true;
      } else {
        appAlert("Пользователь не найден.");
      }
    } catch (error) {
      appAlert(error.message);
    }
  }

  if (profileUsername) {
    profileUsername.textContent = profileUser.username;
  }

  if (breadcrumbUsername) {
    breadcrumbUsername.textContent = profileUser.username;
  }

  if (profileAvatar) {
    profileAvatar.src = safeAvatar(profileUser.avatarUrl, 300);
  }

  const profileRoles = rolesForUser(profileUser);

  if (profileRoleLabel) {
    profileRoleLabel.textContent = profileRoles.length > 1 ? "Роли пользователя" : "Роль пользователя";
  }

  if (profileRolesList) {
    profileRolesList.innerHTML = profileRoles.map(roleBadgeTemplate).join("");
  }

  if (profileTab) {
    profileTab.textContent = isForeignProfile ? "Голосования пользователя" : "Мои голосования";
  }

  try {
    const publicData = await api("/api/proposals/list?scope=public");
    let mine = (publicData.proposals || []).filter((proposal) => proposal.author.id === profileUser.id);

    if (isMinister()) {
      const ministerData = await api("/api/proposals/list?scope=minister");
      const ministerMine = (ministerData.proposals || []).filter((proposal) => proposal.author.id === profileUser.id);
      mine = mine.concat(ministerMine);
    }

    mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (userPetitionsCount) {
      userPetitionsCount.textContent = String(mine.length);
    }

    if (!userPetitionsList) {
      return;
    }

    if (mine.length === 0) {
      userPetitionsList.innerHTML = isForeignProfile
        ? '<p class="empty-message">У пользователя пока нет созданных голосований.</p>'
        : '<p class="empty-message">У вас пока нет созданных голосований.</p>';
      return;
    }

    userPetitionsList.innerHTML = mine.map(proposalCardTemplate).join("");
  } catch (error) {
    if (userPetitionsList) {
      userPetitionsList.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    }
  }
}

function registryCardTemplate(entry) {
  const safeTitle = normalizeDisplayText(entry.title, { multiline: false });
  const safeBody = normalizeDisplayText(entry.body);
  const safeReason = normalizeDisplayText(entry.reason, { multiline: false });

  return `
    <a class="petition-card registry-card" href="/registry-detail?id=${entry.id}" aria-label="Открыть запись «${escapeHtml(safeTitle)}»">
      <div class="petition-card-header">
        <img src="${safeAvatar(entry.author.avatarUrl, 48)}" alt="${escapeHtml(entry.author.username)}" class="petition-card-icon">
        <div class="petition-card-owner">${escapeHtml(entry.author.username)}</div>
      </div>
      <div class="card-badges">
        <span class="mini-badge ${entry.decision === "accepted" ? "badge-success" : "badge-danger"}">
          ${entry.decision === "accepted" ? "Принято" : "Отклонено"}
        </span>
      </div>
      <h3 class="petition-card-title">${escapeHtml(safeTitle)}</h3>
      <p class="petition-card-description">${escapeHtml(safeBody)}</p>
      ${safeReason ? `<p class="registry-reason"><strong>Комментарий:</strong> ${escapeHtml(safeReason)}</p>` : ""}
      <div class="petition-card-meta">
        <span>${formatDateTime(entry.createdAt)} МСК</span>
        <span class="registry-open-hint">Открыть полностью</span>
      </div>
    </a>
  `;
}

async function initRegistryPage() {
  const form = document.getElementById("registryForm");
  const list = document.getElementById("registryList");
  const canCreate = isAdmin() || isMinister();

  if (form) {
    form.style.display = canCreate ? "block" : "none";
  }

  const loadEntries = async () => {
    if (!list) {
      return;
    }

    try {
      const cached = readCache("wp:registry:entries");
      if (Array.isArray(cached) && cached.length > 0) {
        list.innerHTML = cached.map(registryCardTemplate).join("");
      } else {
        list.innerHTML = proposalSkeletonTemplate(3);
      }

      const data = await api("/api/registry/list");
      const entries = data.entries || [];

      if (entries.length === 0) {
        writeCache("wp:registry:entries", []);
        list.innerHTML = '<p class="empty-message">В реестре пока нет записей.</p>';
        return;
      }

      writeCache("wp:registry:entries", entries);
      list.innerHTML = entries.map(registryCardTemplate).join("");
    } catch (error) {
      list.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    }
  };

  await loadEntries();

  if (!form || !canCreate) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("registryTitle")?.value || "";
    const body = document.getElementById("registryBody")?.value || "";
    const decision = document.getElementById("registryDecision")?.value || "accepted";
    const reason = document.getElementById("registryReason")?.value || "";

    try {
      await api("/api/registry/create", {
        method: "POST",
        body: {
          title,
          body,
          decision,
          reason,
        },
      });

      form.reset();
      await loadEntries();
    } catch (error) {
      appAlert(error.message);
    }
  });
}

async function initRegistryDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const entryId = Number.parseInt(params.get("id"), 10);

  if (!Number.isInteger(entryId) || entryId <= 0) {
    window.location.href = "/registry";
    return;
  }

  try {
    const data = await api(`/api/registry/get?id=${entryId}`);
    const entry = data.entry;

    const titleEl = document.getElementById("registryDetailTitle");
    const breadcrumbEl = document.getElementById("registryDetailBreadcrumb");
    const decisionEl = document.getElementById("registryDetailDecision");
    const codeEl = document.getElementById("registryDetailCode");
    const dateEl = document.getElementById("registryDetailDate");
    const bodyEl = document.getElementById("registryDetailBody");
    const reasonSectionEl = document.getElementById("registryDetailReasonSection");
    const reasonEl = document.getElementById("registryDetailReason");
    const authorEl = document.getElementById("registryDetailAuthor");
    const authorAvatarEl = document.getElementById("registryDetailAuthorAvatar");
    const adminActionsEl = document.getElementById("registryDetailAdminActions");
    const deleteButtonEl = document.getElementById("registryDetailDeleteBtn");

    const safeTitle = normalizeDisplayText(entry.title, { multiline: false });

    if (titleEl) {
      titleEl.textContent = safeTitle;
    }

    if (breadcrumbEl) {
      breadcrumbEl.textContent = safeTitle;
    }

    if (decisionEl) {
      decisionEl.textContent = entry.decision === "accepted" ? "Принято" : "Отклонено";
      decisionEl.classList.remove("expired", "approved");
      decisionEl.classList.add(entry.decision === "accepted" ? "approved" : "expired");
    }

    if (codeEl) {
      codeEl.textContent = `ID: ${String(entry.id).padStart(4, "0")}`;
    }

    if (dateEl) {
      dateEl.textContent = `Создано ${formatDateTime(entry.createdAt)} МСК`;
    }

    if (bodyEl) {
      bodyEl.textContent = normalizeDisplayText(entry.body);
    }

    if (reasonSectionEl) {
      reasonSectionEl.style.display = entry.reason ? "block" : "none";
    }

    if (reasonEl) {
      reasonEl.textContent = normalizeDisplayText(entry.reason || "", { multiline: false });
    }

    if (authorEl) {
      authorEl.textContent = entry.author.username;
    }

    if (authorAvatarEl) {
      authorAvatarEl.src = safeAvatar(entry.author.avatarUrl, 40);
    }

    if (adminActionsEl) {
      adminActionsEl.style.display = data.canDelete ? "block" : "none";
    }

    if (deleteButtonEl && data.canDelete) {
      deleteButtonEl.addEventListener("click", async () => {
        const ok = await showConfirmModal({
          title: "Удалить запись реестра?",
          text: `Запись «${safeTitle}» будет удалена без возможности восстановления.`,
          confirmText: "Удалить",
          cancelText: "Отмена",
          danger: true,
        });

        if (!ok) {
          return;
        }

        deleteButtonEl.disabled = true;
        try {
          await api("/api/registry/delete", {
            method: "POST",
            body: { entryId: entry.id },
          });
          await showNoticeModal({
            title: "Запись удалена",
            text: "Запись реестра успешно удалена.",
            buttonText: "Понятно",
          });
          window.location.href = "/registry";
        } catch (error) {
          appAlert(error.message);
          deleteButtonEl.disabled = false;
        }
      });
    }
  } catch (error) {
    appAlert(error.message);
    window.location.href = "/registry";
  }
}

function notificationsPageItemTemplate(item) {
  const href = typeof item.href === "string" && item.href.startsWith("/") ? item.href : "";
  const title = shortenSingleLineText(item.title, 88);
  const message = shortenSingleLineText(item.message, 170);

  return `
    <button class="notification-item notification-page-item ${item.isRead ? "" : "unread"}" type="button" data-id="${item.id}" data-href="${escapeHtml(href)}">
      <div class="notification-item-title" title="${escapeHtml(item.title)}">${escapeHtml(title)}</div>
      <div class="notification-item-message" title="${escapeHtml(item.message)}">${escapeHtml(message)}</div>
      <div class="notification-item-time">${formatDateTime(item.createdAt)} МСК</div>
    </button>
  `;
}

async function initNotificationsPage() {
  const recentList = document.getElementById("notificationsRecentList");
  const archiveList = document.getElementById("notificationsArchiveList");
  const markAllButton = document.getElementById("notificationsPageMarkAll");
  if (!recentList || !archiveList) {
    return;
  }

  const bindListClicks = (container) => {
    container.addEventListener("click", async (event) => {
      const button = event.target.closest(".notification-page-item");
      if (!button) {
        return;
      }

      const id = Number.parseInt(button.dataset.id || "", 10);
      const href = String(button.dataset.href || "").trim();
      await markNotificationRead(id);

      if (href) {
        window.location.href = href;
      }
    });
  };

  bindListClicks(recentList);
  bindListClicks(archiveList);

  markAllButton?.addEventListener("click", async () => {
    await markAllNotificationsRead();
    await loadPageNotifications();
  });

  const loadPageNotifications = async () => {
    try {
      const data = await api("/api/notifications/list?limit=300&all=1");
      const notifications = data.notifications || [];
      const now = Date.now();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

      const recent = notifications.filter((item) => {
        const createdAtMs = new Date(item.createdAt).getTime();
        return Number.isFinite(createdAtMs) && now - createdAtMs <= threeDaysMs;
      });
      const archive = notifications.filter((item) => {
        const createdAtMs = new Date(item.createdAt).getTime();
        return Number.isFinite(createdAtMs) && now - createdAtMs > threeDaysMs;
      });

      recentList.innerHTML = recent.length
        ? recent.map(notificationsPageItemTemplate).join("")
        : '<p class="empty-message compact-empty">За последние 3 дня уведомлений нет.</p>';

      archiveList.innerHTML = archive.length
        ? archive.map(notificationsPageItemTemplate).join("")
        : '<p class="empty-message compact-empty">Архив уведомлений пока пуст.</p>';
    } catch (error) {
      const message = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
      recentList.innerHTML = message;
      archiveList.innerHTML = "";
    }
  };

  await loadPageNotifications();
}

function adminRolePriority(role) {
  if (role === ROLE_ADMIN) {
    return 0;
  }

  if (role === ROLE_MINISTER) {
    return 1;
  }

  if (role === ROLE_CHAMBER) {
    return 2;
  }

  return 3;
}

function adminRoleClass(role) {
  if (role === ROLE_ADMIN) {
    return "role-admin";
  }

  if (role === ROLE_MINISTER) {
    return "role-minister";
  }

  if (role === ROLE_CHAMBER) {
    return "role-chamber";
  }

  return "role-citizen";
}

function adminRoleOptionsTemplate(currentRole, fixedAdmin = false) {
  if (fixedAdmin) {
    return '<option value="admin" selected>Администратор</option>';
  }

  return `
    <option value="citizen" ${currentRole === "citizen" ? "selected" : ""}>Гражданин</option>
    <option value="chamber" ${currentRole === "chamber" ? "selected" : ""}>Член палаты</option>
    <option value="minister" ${currentRole === "minister" ? "selected" : ""}>Министр</option>
    <option value="admin" ${currentRole === "admin" ? "selected" : ""}>Администратор</option>
  `;
}

function adminUserListItemTemplate(user, selectedUserId) {
  const selectedClass = user.id === selectedUserId ? "active" : "";
  const roleClass = adminRoleClass(user.role);

  return `
    <button class="admin-member-item ${selectedClass}" type="button" data-user-id="${user.id}">
      <img src="${safeAvatar(user.avatarUrl, 48)}" alt="${escapeHtml(user.username)}" class="admin-member-avatar">
      <div class="admin-member-main">
        <div class="admin-member-top">
          <span class="admin-member-name">${escapeHtml(user.username)}</span>
          <span class="admin-member-role ${roleClass}">${escapeHtml(roleTitle(user.role))}</span>
        </div>
        <div class="admin-member-meta">
          <span class="admin-member-id">ID ${user.id}</span>
          <span>•</span>
          <span>${formatDateTime(user.createdAt)} МСК</span>
        </div>
      </div>
    </button>
  `;
}

function adminRoleStatTemplate(label, count, roleClass) {
  return `
    <div class="admin-role-stat ${roleClass}">
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
    </div>
  `;
}

function adminUserDetailTemplate(user) {
  const fixedAdmin = user.username.toLowerCase() === "nertin0";
  const options = adminRoleOptionsTemplate(user.role, fixedAdmin);
  const roleClass = adminRoleClass(user.role);

  return `
    <div class="admin-detail-head">
      <img src="${safeAvatar(user.avatarUrl, 72)}" alt="${escapeHtml(user.username)}" class="admin-detail-avatar">
      <div>
        <h3 class="admin-detail-username">${escapeHtml(user.username)}</h3>
        <p class="admin-detail-subline">ID: ${user.id}</p>
        <p class="admin-detail-subline">Текущая роль: <span class="admin-member-role ${roleClass}">${escapeHtml(roleTitle(user.role))}</span></p>
      </div>
    </div>

    <div class="admin-detail-roles">
      ${rolesForUser(user).map(roleBadgeTemplate).join("")}
    </div>

    <div class="admin-detail-grid">
      <div class="admin-detail-field">
        <span>Регистрация</span>
        <strong>${formatDateTime(user.createdAt)} МСК</strong>
      </div>
      <div class="admin-detail-field">
        <span>Профиль</span>
        <strong>@${escapeHtml(user.username)}</strong>
      </div>
    </div>

    <div class="admin-detail-controls">
      <select class="admin-filter-select admin-detail-select" id="adminDetailRoleSelect" ${fixedAdmin ? "disabled" : ""}>
        ${options}
      </select>
      <button class="btn btn-primary" type="button" id="adminDetailSaveBtn" ${fixedAdmin ? "disabled" : ""}>Сохранить роль</button>
      ${fixedAdmin ? "" : '<button class="btn btn-secondary" type="button" id="adminDetailResetBtn">Сделать гражданином</button>'}
    </div>

    <div class="admin-quick-roles" id="adminQuickRoles">
      <button class="admin-quick-role-btn ${user.role === "citizen" ? "active" : ""}" type="button" data-role="citizen" ${fixedAdmin ? "disabled" : ""}>Гражданин</button>
      <button class="admin-quick-role-btn ${user.role === "chamber" ? "active" : ""}" type="button" data-role="chamber" ${fixedAdmin ? "disabled" : ""}>Член палаты</button>
      <button class="admin-quick-role-btn ${user.role === "minister" ? "active" : ""}" type="button" data-role="minister" ${fixedAdmin ? "disabled" : ""}>Министр</button>
      <button class="admin-quick-role-btn ${user.role === "admin" ? "active" : ""}" type="button" data-role="admin" ${fixedAdmin ? "disabled" : ""}>Администратор</button>
    </div>

    <div class="admin-detail-actions">
      <a href="/profile?userId=${user.id}" class="btn btn-secondary view-profile-btn">Открыть профиль</a>
    </div>

    ${fixedAdmin ? '<p class="admin-fixed-note">Пользователь nertin0 всегда администратор.</p>' : ""}
  `;
}

async function initAdminPage() {
  if (!isAdmin()) {
    appAlert("Недостаточно прав для доступа к админ-панели.");
    window.location.href = "/";
    return;
  }

  const list = document.getElementById("adminUsersList");
  const detail = document.getElementById("adminUserDetail");
  const searchInput = document.getElementById("adminUserSearch");
  const roleFilter = document.getElementById("adminRoleFilter");
  const sortSelect = document.getElementById("adminSortSelect");
  const usersCount = document.getElementById("adminUsersCount");
  const roleStats = document.getElementById("adminRoleStats");

  if (!list || !detail) {
    return;
  }

  let allUsers = [];
  let selectedUserId = null;

  const updateRoleStats = () => {
    if (!roleStats) {
      return;
    }

    const counts = {
      admin: 0,
      minister: 0,
      chamber: 0,
      citizen: 0,
    };

    allUsers.forEach((user) => {
      if (counts[user.role] !== undefined) {
        counts[user.role] += 1;
      } else {
        counts.citizen += 1;
      }
    });

    roleStats.innerHTML = [
      adminRoleStatTemplate("Администраторы", counts.admin, "role-admin"),
      adminRoleStatTemplate("Министры", counts.minister, "role-minister"),
      adminRoleStatTemplate("Члены палаты", counts.chamber, "role-chamber"),
      adminRoleStatTemplate("Граждане", counts.citizen, "role-citizen"),
    ].join("");
  };

  const getFilteredUsers = () => {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const roleValue = String(roleFilter?.value || "all");
    const sortValue = String(sortSelect?.value || "role_name");

    const filtered = allUsers.filter((user) => {
      if (roleValue !== "all" && user.role !== roleValue) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        user.username.toLowerCase().includes(query) ||
        roleLabel(user.role).toLowerCase().includes(query) ||
        String(user.id).includes(query)
      );
    });

    filtered.sort((a, b) => {
      if (sortValue === "name_asc") {
        return a.username.localeCompare(b.username, "ru", { sensitivity: "base" });
      }

      if (sortValue === "newest") {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }

      if (sortValue === "oldest") {
        return new Date(a.createdAt) - new Date(b.createdAt);
      }

      const roleDiff = adminRolePriority(a.role) - adminRolePriority(b.role);
      if (roleDiff !== 0) {
        return roleDiff;
      }

      return a.username.localeCompare(b.username, "ru", { sensitivity: "base" });
    });

    return filtered;
  };

  const findSelectedUser = () => {
    return allUsers.find((user) => user.id === selectedUserId) || null;
  };

  const setRoleForUser = async (user, targetRole) => {
    const fixedAdmin = user.username.toLowerCase() === "nertin0";
    const roleToSave = fixedAdmin ? "admin" : targetRole;

    if (roleToSave === user.role) {
      return;
    }

    const ok = await showConfirmModal({
      title: "Изменить роль пользователя?",
      text: `Для ${user.username} будет установлена роль «${roleTitle(roleToSave)}».`,
      confirmText: "Сохранить",
      cancelText: "Отмена",
    });

    if (!ok) {
      return;
    }

    try {
      const result = await api("/api/admin/role", {
        method: "POST",
        body: {
          userId: user.id,
          role: roleToSave,
        },
      });

      allUsers = allUsers.map((item) => (item.id === user.id ? result.user : item));
      if (state.currentUser?.id === user.id) {
        state.currentUser = {
          ...state.currentUser,
          role: result.user.role,
        };
        updateCommonUserUI();
      }

      await showNoticeModal({
        title: "Роль обновлена",
        text: `Пользователю ${result.user.username} назначена роль «${roleTitle(result.user.role)}».`,
        buttonText: "Понятно",
      });

      render();
    } catch (error) {
      appAlert(error.message);
    }
  };

  const bindDetailActions = (user) => {
    const fixedAdmin = user.username.toLowerCase() === "nertin0";
    const roleSelect = document.getElementById("adminDetailRoleSelect");
    const saveButton = document.getElementById("adminDetailSaveBtn");
    const resetButton = document.getElementById("adminDetailResetBtn");

    if (saveButton && roleSelect && !fixedAdmin) {
      saveButton.addEventListener("click", async () => {
        await setRoleForUser(user, roleSelect.value);
      });
    }

    if (resetButton && !fixedAdmin) {
      resetButton.addEventListener("click", async () => {
        const ok = await showConfirmModal({
          title: "Сделать гражданином?",
          text: "Назначенная роль будет снята, останется только «гражданин».",
          confirmText: "Снять роль",
          cancelText: "Отмена",
          danger: true,
        });

        if (!ok) {
          return;
        }

        await setRoleForUser(user, "citizen");
      });
    }

    if (!fixedAdmin) {
      detail.querySelectorAll(".admin-quick-role-btn").forEach((button) => {
        button.addEventListener("click", async () => {
          const role = String(button.dataset.role || "");
          if (!role) {
            return;
          }
          await setRoleForUser(user, role);
        });
      });
    }
  };

  const renderDetail = () => {
    const selectedUser = findSelectedUser();

    if (!selectedUser) {
      detail.innerHTML = '<div class="admin-detail-empty">Выберите пользователя в списке, чтобы открыть управление ролями.</div>';
      return;
    }

    detail.innerHTML = adminUserDetailTemplate(selectedUser);
    bindDetailActions(selectedUser);
  };

  const renderList = () => {
    const filteredUsers = getFilteredUsers();

    if (usersCount) {
      usersCount.textContent = String(filteredUsers.length);
    }

    if (filteredUsers.length === 0) {
      selectedUserId = null;
      list.innerHTML = '<p class="empty-message">Пользователи не найдены.</p>';
      renderDetail();
      return;
    }

    if (!filteredUsers.some((user) => user.id === selectedUserId)) {
      selectedUserId = filteredUsers[0].id;
    }

    list.innerHTML = filteredUsers.map((user) => adminUserListItemTemplate(user, selectedUserId)).join("");
    renderDetail();
  };

  const render = () => {
    updateRoleStats();
    renderList();
  };

  list.addEventListener("click", (event) => {
    const item = event.target.closest(".admin-member-item");
    if (!item) {
      return;
    }

    const userId = Number.parseInt(item.dataset.userId || "", 10);
    if (!Number.isInteger(userId)) {
      return;
    }

    if (selectedUserId === userId) {
      return;
    }

    selectedUserId = userId;
    renderList();
  });

  searchInput?.addEventListener("input", renderList);
  roleFilter?.addEventListener("change", renderList);
  sortSelect?.addEventListener("change", renderList);

  try {
    const data = await api("/api/admin/users");
    allUsers = data.users || [];
    selectedUserId = allUsers[0]?.id || null;
    render();
  } catch (error) {
    list.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    detail.innerHTML = '<div class="admin-detail-empty">Не удалось загрузить пользователей.</div>';
  }
}

async function bootstrap() {
  enhanceSidebarNavigation();
  bindDiscordButtons();
  bindUserMenu();
  bindNotifications();
  bindLogoutButton();
  bindHeroButtons();

  try {
    const authState = await api("/api/auth/me");
    state.currentUser = authState.user;
  } catch (error) {
    state.currentUser = null;
  }

  updateCommonUserUI();

  const authFailed = new URLSearchParams(window.location.search).get("auth") === "failed";
  if (authFailed) {
    appAlert("Не удалось выполнить вход через Discord. Попробуйте снова.");
  }

  const startNotificationsLoad = () => {
    const run = () => {
      loadNotifications(true).catch((error) => {
        console.error("Failed to load notifications", error);
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1200 });
      return;
    }

    setTimeout(run, 0);
  };

  if (!state.currentUser) {
    showAuthRequired("Вход и регистрация через Discord.");
    startNotificationsLoad();
    return;
  }

  hideAuthRequired();
  startNotificationsLoad();

  const metaPage = document.querySelector('meta[name="page-id"]')?.getAttribute("content") || "";
  const page = document.body.dataset.page || metaPage;

  if (page === "home") {
    await initHomePage();
    return;
  }

  if (page === "minister") {
    await initMinisterPage();
    return;
  }

  if (page === "detail") {
    await initDetailPage();
    return;
  }

  if (page === "create") {
    await initCreatePage();
    return;
  }

  if (page === "profile") {
    await initProfilePage();
    return;
  }

  if (page === "registry") {
    await initRegistryPage();
    return;
  }

  if (page === "registry-detail") {
    await initRegistryDetailPage();
    return;
  }

  if (page === "notifications") {
    await initNotificationsPage();
    return;
  }

  if (page === "admin") {
    await initAdminPage();
  }
}

function startBootstrap() {
  bootstrap().catch((error) => {
    console.error("Bootstrap failed", error);
    appAlert("Ошибка загрузки приложения.");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBootstrap);
} else {
  startBootstrap();
}

