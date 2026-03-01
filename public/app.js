const ROLE_ADMIN = "admin";
const ROLE_MINISTER = "minister";
const ROLE_CITIZEN = "citizen";

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

function roleLabel(role) {
  if (role === ROLE_ADMIN) {
    return "администратор";
  }

  if (role === ROLE_MINISTER) {
    return "министр";
  }

  return "гражданин";
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
  }).format(date);
}

function toLocalDateTimeValue(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M3.75 10.5L12 4L20.25 10.5V19.25C20.25 19.8 19.8 20.25 19.25 20.25H14.5V14H9.5V20.25H4.75C4.2 20.25 3.75 19.8 3.75 19.25V10.5Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path></svg>';
  }

  if (key === "minister") {
    return '<svg viewBox="0 0 24 24" fill="none"><circle cx="8.5" cy="9" r="2.25" stroke="currentColor" stroke-width="1.9"></circle><circle cx="15.5" cy="9" r="2.25" stroke="currentColor" stroke-width="1.9"></circle><path d="M4.5 18.75C4.9 16.3 6.45 14.75 8.5 14.75C10.55 14.75 12.1 16.3 12.5 18.75" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path><path d="M11.5 18.75C11.9 16.3 13.45 14.75 15.5 14.75C17.55 14.75 19.1 16.3 19.5 18.75" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg>';
  }

  if (key === "registry") {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M5 4.75C5 4.2 5.45 3.75 6 3.75H17.25C17.8 3.75 18.25 4.2 18.25 4.75V19.25C18.25 19.8 17.8 20.25 17.25 20.25H6C5.45 20.25 5 19.8 5 19.25V4.75Z" stroke="currentColor" stroke-width="1.9"></path><path d="M8.25 8.25H15M8.25 12H15M8.25 15.75H13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg>';
  }

  if (key === "admin") {
    return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.75L18.75 6.5V11.5C18.75 15.85 16.35 19.05 12 20.25C7.65 19.05 5.25 15.85 5.25 11.5V6.5L12 3.75Z" stroke="currentColor" stroke-width="1.9"></path><path d="M12 8.2L12.9 10.05L14.95 10.35L13.45 11.8L13.8 13.85L12 12.9L10.2 13.85L10.55 11.8L9.05 10.35L11.1 10.05L12 8.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path></svg>';
  }

  if (key === "petitions") {
    return '<svg viewBox="0 0 24 24" fill="none"><rect x="4.75" y="4.75" width="14.5" height="14.5" rx="1.8" stroke="currentColor" stroke-width="1.9"></rect><path d="M8 9.25H15.8M8 12.25H15.8M8 15.25H12.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path><path d="M16.85 17.6L19.75 20.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg>';
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
        <button class="notifications-mark-all" type="button" id="notificationsMarkAll">Прочитать все</button>
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
      return `
        <button class="notification-item ${item.isRead ? "" : "unread"}" type="button" data-id="${item.id}" data-href="${escapeHtml(href)}">
          <div class="notification-item-title">${escapeHtml(item.title)}</div>
          <div class="notification-item-message">${escapeHtml(item.message)}</div>
          <div class="notification-item-time">${formatDateTime(item.createdAt)}</div>
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
      alert(error.message);
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

async function initHomePage() {
  await initProposalBoard("public", {
    createButtonId: "createPetitionBtn",
    createUrl: "/create-petition?scope=public",
    canCreate: (user) => Boolean(user),
  });
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
      const isConfirmed = window.confirm(
        `Подтвердите выбор: «${voteText}». После отправки изменить голос нельзя.`
      );
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
        alert(error.message);
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
          const ok = window.confirm(
            `Удалить голосование #${formatProposalId(proposal)}? Это действие необратимо.`
          );
          if (!ok) {
            return;
          }

          deleteProposalButton.disabled = true;
          try {
            await api("/api/proposals/delete", {
              method: "POST",
              body: { proposalId: proposal.id },
            });
            alert("Голосование удалено.");
            window.location.href = proposal.scope === "minister" ? "/minister" : "/";
          } catch (error) {
            alert(error.message);
            deleteProposalButton.disabled = false;
          }
        });
      }
    } else if (adminActionsSection) {
      adminActionsSection.style.display = "none";
    }
  } catch (error) {
    alert(error.message);
    window.location.href = "/";
  }
}

async function initCreatePage() {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get("scope") === "minister" ? "minister" : "public";

  if (scope === "minister" && !isMinister()) {
    alert("Недостаточно прав для этого раздела.");
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
        : "С одного аккаунта можно создать до 2 публичных голосований за 24 часа.";
  }

  if (deadlineInput) {
    const minDate = new Date(Date.now() + 5 * 60 * 1000);
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    deadlineInput.min = toLocalDateTimeValue(minDate);
    deadlineInput.value = toLocalDateTimeValue(defaultDate);
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

    if (!deadlineRaw) {
      alert("Укажите дедлайн голосования.");
      return;
    }

    const deadlineAt = new Date(deadlineRaw);
    if (Number.isNaN(deadlineAt.getTime())) {
      alert("Некорректная дата дедлайна.");
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
      alert(error.message);
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
        alert("Пользователь не найден.");
      }
    } catch (error) {
      alert(error.message);
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

  if (profileRoleLabel) {
    profileRoleLabel.textContent = `Роль: ${roleLabel(profileUser.role)}`;
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
    <article class="petition-card registry-card" data-entry-id="${entry.id}" tabindex="0" role="button" aria-label="Открыть запись «${escapeHtml(safeTitle)}»">
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
        <span>${formatDateTime(entry.createdAt)}</span>
        <span class="registry-open-hint">Открыть полностью</span>
      </div>
    </article>
  `;
}

async function initRegistryPage() {
  const form = document.getElementById("registryForm");
  const list = document.getElementById("registryList");
  const modal = document.getElementById("registryEntryModal");
  const modalClose = document.getElementById("registryModalClose");
  const modalTitle = document.getElementById("registryModalTitle");
  const modalDecision = document.getElementById("registryModalDecision");
  const modalAuthor = document.getElementById("registryModalAuthor");
  const modalDate = document.getElementById("registryModalDate");
  const modalBody = document.getElementById("registryModalBody");
  const modalReason = document.getElementById("registryModalReason");
  const modalReasonRow = document.getElementById("registryModalReasonRow");
  const modalActions = document.getElementById("registryModalActions");
  const modalDeleteButton = document.getElementById("registryDeleteBtn");
  const canCreate = isAdmin() || isMinister();
  const canDelete = isAdmin();
  let entriesById = new Map();
  let activeEntryId = null;

  if (form) {
    form.style.display = canCreate ? "block" : "none";
  }

  const closeModal = () => {
    if (modal) {
      modal.classList.remove("active");
    }
    activeEntryId = null;
  };

  const openEntry = (entryId) => {
    const entry = entriesById.get(entryId);
    if (!entry || !modal) {
      return;
    }
    activeEntryId = entryId;

    if (modalTitle) {
      modalTitle.textContent = normalizeDisplayText(entry.title, { multiline: false });
    }

    if (modalDecision) {
      modalDecision.textContent = entry.decision === "accepted" ? "Принято" : "Отклонено";
      modalDecision.classList.remove("badge-success", "badge-danger");
      modalDecision.classList.add(entry.decision === "accepted" ? "badge-success" : "badge-danger");
    }

    if (modalAuthor) {
      modalAuthor.textContent = entry.author.username;
    }

    if (modalDate) {
      modalDate.textContent = formatDateTime(entry.createdAt);
    }

    if (modalBody) {
      modalBody.textContent = normalizeDisplayText(entry.body);
    }

    if (modalReasonRow) {
      modalReasonRow.style.display = entry.reason ? "block" : "none";
    }

    if (modalReason) {
      modalReason.textContent = normalizeDisplayText(entry.reason || "", { multiline: false });
    }

    if (modalActions) {
      modalActions.style.display = canDelete ? "flex" : "none";
    }

    modal.classList.add("active");
  };

  if (list) {
    list.addEventListener("click", (event) => {
      const card = event.target.closest(".registry-card");
      if (!card) {
        return;
      }

      const entryId = Number.parseInt(card.dataset.entryId || "", 10);
      if (Number.isInteger(entryId)) {
        openEntry(entryId);
      }
    });

    list.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const card = event.target.closest(".registry-card");
      if (!card) {
        return;
      }

      event.preventDefault();
      const entryId = Number.parseInt(card.dataset.entryId || "", 10);
      if (Number.isInteger(entryId)) {
        openEntry(entryId);
      }
    });
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });

  if (modalDeleteButton && canDelete) {
    modalDeleteButton.addEventListener("click", async () => {
      if (!Number.isInteger(activeEntryId) || activeEntryId <= 0) {
        return;
      }

      const entry = entriesById.get(activeEntryId);
      const title = entry ? entry.title : `#${activeEntryId}`;
      const ok = window.confirm(`Удалить запись реестра "${title}"? Это действие необратимо.`);
      if (!ok) {
        return;
      }

      modalDeleteButton.disabled = true;
      try {
        await api("/api/registry/delete", {
          method: "POST",
          body: { entryId: activeEntryId },
        });
        closeModal();
        await loadEntries();
      } catch (error) {
        alert(error.message);
      } finally {
        modalDeleteButton.disabled = false;
      }
    });
  }

  const loadEntries = async () => {
    if (!list) {
      return;
    }

    try {
      const cached = readCache("wp:registry:entries");
      if (Array.isArray(cached) && cached.length > 0) {
        entriesById = new Map(cached.map((entry) => [entry.id, entry]));
        list.innerHTML = cached.map(registryCardTemplate).join("");
      } else {
        list.innerHTML = proposalSkeletonTemplate(3);
      }

      const data = await api("/api/registry/list");
      const entries = data.entries || [];

      if (entries.length === 0) {
        entriesById = new Map();
        writeCache("wp:registry:entries", []);
        list.innerHTML = '<p class="empty-message">В реестре пока нет записей.</p>';
        return;
      }

      entriesById = new Map(entries.map((entry) => [entry.id, entry]));
      writeCache("wp:registry:entries", entries);
      list.innerHTML = entries.map(registryCardTemplate).join("");
    } catch (error) {
      entriesById = new Map();
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
      alert(error.message);
    }
  });
}

function adminUserCardTemplate(user) {
  const fixedAdmin = user.username.toLowerCase() === "nertin0";
  const options = fixedAdmin
    ? '<option value="admin" selected>Администратор</option>'
    : `
        <option value="citizen" ${user.role === "citizen" ? "selected" : ""}>Гражданин</option>
        <option value="minister" ${user.role === "minister" ? "selected" : ""}>Министр</option>
        <option value="admin" ${user.role === "admin" ? "selected" : ""}>Администратор</option>
      `;

  return `
    <article class="petition-card admin-user-card" data-user-id="${user.id}">
      <div class="petition-card-header">
        <img src="${safeAvatar(user.avatarUrl, 48)}" alt="${escapeHtml(user.username)}" class="petition-card-icon">
        <div>
          <div class="petition-card-title admin-card-title">${escapeHtml(user.username)}</div>
          <div class="petition-card-owner">Текущая роль: ${roleLabel(user.role)}</div>
        </div>
      </div>
      <div class="admin-role-controls">
        <select class="role-select" ${fixedAdmin ? "disabled" : ""}>
          ${options}
        </select>
        <a href="/profile?userId=${user.id}" class="btn btn-secondary view-profile-btn">Профиль</a>
        <button class="btn btn-primary save-role-btn" type="button" ${fixedAdmin ? "disabled" : ""}>Сохранить</button>
      </div>
      ${fixedAdmin ? '<p class="page-subtitle">Пользователь `nertin0` всегда администратор.</p>' : ""}
    </article>
  `;
}

async function initAdminPage() {
  if (!isAdmin()) {
    alert("Недостаточно прав для доступа к админ-панели.");
    window.location.href = "/";
    return;
  }

  const list = document.getElementById("adminUsersList");
  const searchInput = document.getElementById("adminUserSearch");
  const usersCount = document.getElementById("adminUsersCount");
  if (!list) {
    return;
  }

  let allUsers = [];

  const bindUserCardActions = () => {
    list.querySelectorAll(".admin-user-card").forEach((card) => {
      const userId = Number.parseInt(card.dataset.userId || "", 10);
      const select = card.querySelector(".role-select");
      const button = card.querySelector(".save-role-btn");

      if (!select || !button || !Number.isInteger(userId) || button.disabled) {
        return;
      }

      button.addEventListener("click", async () => {
        const selectedRole = select.value;
        button.disabled = true;

        try {
          await api("/api/admin/role", {
            method: "POST",
            body: {
              userId,
              role: selectedRole,
            },
          });

          await loadUsers();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
        }
      });
    });
  };

  const renderUsers = () => {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const filteredUsers = allUsers.filter((user) => {
      if (!query) {
        return true;
      }

      return (
        user.username.toLowerCase().includes(query) ||
        roleLabel(user.role).toLowerCase().includes(query)
      );
    });

    if (usersCount) {
      usersCount.textContent = String(filteredUsers.length);
    }

    if (filteredUsers.length === 0) {
      list.innerHTML = '<p class="empty-message">Пользователи не найдены.</p>';
      return;
    }

    list.innerHTML = filteredUsers.map(adminUserCardTemplate).join("");
    bindUserCardActions();
  };

  const loadUsers = async () => {
    try {
      const data = await api("/api/admin/users");
      allUsers = data.users || [];
      renderUsers();
    } catch (error) {
      list.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", renderUsers);
  }

  await loadUsers();
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
    alert("Не удалось выполнить вход через Discord. Попробуйте снова.");
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

  if (page === "admin") {
    await initAdminPage();
  }
}

function startBootstrap() {
  bootstrap().catch((error) => {
    console.error("Bootstrap failed", error);
    alert("Ошибка загрузки приложения.");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startBootstrap);
} else {
  startBootstrap();
}
