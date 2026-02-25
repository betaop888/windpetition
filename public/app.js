const ROLE_ADMIN = "admin";
const ROLE_MINISTER = "minister";
const ROLE_CITIZEN = "citizen";

const state = {
  currentUser: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    ministerNavLink.style.display = isMinister(user) ? "inline" : "none";
  }

  const adminNavLink = document.getElementById("adminNavLink");
  if (adminNavLink) {
    adminNavLink.style.display = isAdmin(user) ? "inline" : "none";
  }
}

function proposalCardTemplate(proposal) {
  const total = proposal.votes.total;
  const forPercent = percentage(proposal.votes.for, total);
  const againstPercent = percentage(proposal.votes.against, total);
  const abstainPercent = percentage(proposal.votes.abstain, total);
  const statusMeta = getStatusMeta(proposal);

  return `
    <a href="/petition-detail?id=${proposal.id}" class="petition-card">
      <div class="petition-card-header">
        <img src="${safeAvatar(proposal.author.avatarUrl, 48)}" alt="${escapeHtml(proposal.author.username)}" class="petition-card-icon">
        <div class="petition-card-owner">${escapeHtml(proposal.author.username)}</div>
      </div>
      <div class="card-badges">
        <span class="mini-badge">${proposalKindLabel(proposal.kind)}</span>
        <span class="mini-badge">${proposal.scope === "minister" ? "Министры" : "Публично"}</span>
      </div>
      <h3 class="petition-card-title">${escapeHtml(proposal.title)}</h3>
      <p class="petition-card-description">${escapeHtml(proposal.description)}</p>
      <div class="petition-card-meta">
        <div class="petition-card-status">
          <span class="status-indicator ${statusMeta.indicatorClass}"></span>
          <span>${statusMeta.text}</span>
        </div>
        <div class="petition-card-stats three-vote-stats">
          <span>За: ${proposal.votes.for} (${forPercent}%)</span>
          <span>Против: ${proposal.votes.against} (${againstPercent}%)</span>
          <span>Воздерж.: ${proposal.votes.abstain} (${abstainPercent}%)</span>
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
    grid.innerHTML = '<p class="empty-message">Раздел доступен только министрам.</p>';
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
    const data = await api(`/api/proposals/list?scope=${scope}`);
    proposals = data.proposals || [];
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
    canCreate: (user) => isAdmin(user),
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
  const total = proposal.votes.total;
  const forPercent = percentage(proposal.votes.for, total);
  const againstPercent = percentage(proposal.votes.against, total);
  const abstainPercent = percentage(proposal.votes.abstain, total);

  const forCount = document.getElementById("forCount");
  const againstCount = document.getElementById("againstCount");
  const abstainCount = document.getElementById("abstainCount");
  const forPercentage = document.getElementById("forPercentage");
  const againstPercentage = document.getElementById("againstPercentage");
  const abstainPercentage = document.getElementById("abstainPercentage");

  if (forCount) {
    forCount.textContent = String(proposal.votes.for);
  }

  if (againstCount) {
    againstCount.textContent = String(proposal.votes.against);
  }

  if (abstainCount) {
    abstainCount.textContent = String(proposal.votes.abstain);
  }

  if (forPercentage) {
    forPercentage.textContent = String(forPercent);
  }

  if (againstPercentage) {
    againstPercentage.textContent = String(againstPercent);
  }

  if (abstainPercentage) {
    abstainPercentage.textContent = String(abstainPercent);
  }

  const statBarFor = document.getElementById("statBarFor");
  const statBarAgainst = document.getElementById("statBarAgainst");
  const statBarAbstain = document.getElementById("statBarAbstain");

  if (statBarFor) {
    statBarFor.style.width = `${forPercent}%`;
  }

  if (statBarAgainst) {
    statBarAgainst.style.width = `${againstPercent}%`;
  }

  if (statBarAbstain) {
    statBarAbstain.style.width = `${abstainPercent}%`;
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
    const petitionOwner = document.getElementById("petitionOwner");
    const petitionOwnerAvatar = document.getElementById("petitionOwnerAvatar");
    const petitionKind = document.getElementById("petitionKind");

    if (titleElement) {
      titleElement.textContent = proposal.title;
    }

    if (breadcrumbTitle) {
      breadcrumbTitle.textContent = proposal.title;
    }

    if (description) {
      description.textContent = proposal.description;
    }

    if (petitionDate) {
      petitionDate.textContent = `Создано ${formatDateTime(proposal.createdAt)} • До ${formatDateTime(proposal.deadlineAt)}`;
    }

    if (petitionStatus) {
      petitionStatus.textContent = statusMeta.text;
      petitionStatus.classList.remove("expired", "approved");
      if (statusMeta.statusClass) {
        petitionStatus.classList.add(statusMeta.statusClass);
      }
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
      votersForCount.textContent = String(proposal.votes.for);
    }

    if (votersAgainstCount) {
      votersAgainstCount.textContent = String(proposal.votes.against);
    }

    if (votersAbstainCount) {
      votersAbstainCount.textContent = String(proposal.votes.abstain);
    }

    const adminSection = document.getElementById("adminVotersSection");
    const anonymousSection = document.getElementById("anonymousNoticeSection");

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
  } catch (error) {
    alert(error.message);
    window.location.href = "/";
  }
}

async function initCreatePage() {
  const params = new URLSearchParams(window.location.search);
  const scope = params.get("scope") === "minister" ? "minister" : "public";

  if (scope === "public" && !isAdmin()) {
    alert("Создание публичных голосований доступно только администратору.");
    window.location.href = "/";
    return;
  }

  if (scope === "minister" && !isMinister()) {
    alert("Создание голосований министров доступно только министру.");
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

  const scopeText = scope === "minister" ? "Голосования министров" : "Публичные голосования";

  if (createPageTitle) {
    createPageTitle.textContent = `Создать: ${scopeText}`;
  }

  if (createPageSubtitle) {
    createPageSubtitle.textContent = "После дедлайна статус изменится автоматически: >50% За — отправлено на рассмотрение, иначе — отклонено.";
  }

  if (scopeLabel) {
    scopeLabel.value = scopeText;
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

  if (profileUsername) {
    profileUsername.textContent = state.currentUser.username;
  }

  if (breadcrumbUsername) {
    breadcrumbUsername.textContent = state.currentUser.username;
  }

  if (profileAvatar) {
    profileAvatar.src = safeAvatar(state.currentUser.avatarUrl, 300);
  }

  if (profileRoleLabel) {
    profileRoleLabel.textContent = `Роль: ${roleLabel(state.currentUser.role)}`;
  }

  try {
    const publicData = await api("/api/proposals/list?scope=public");
    let mine = (publicData.proposals || []).filter((proposal) => proposal.author.id === state.currentUser.id);

    if (isMinister()) {
      const ministerData = await api("/api/proposals/list?scope=minister");
      const ministerMine = (ministerData.proposals || []).filter((proposal) => proposal.author.id === state.currentUser.id);
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
      userPetitionsList.innerHTML = '<p class="empty-message">У вас пока нет созданных голосований.</p>';
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
  return `
    <article class="petition-card">
      <div class="petition-card-header">
        <img src="${safeAvatar(entry.author.avatarUrl, 48)}" alt="${escapeHtml(entry.author.username)}" class="petition-card-icon">
        <div class="petition-card-owner">${escapeHtml(entry.author.username)}</div>
      </div>
      <div class="card-badges">
        <span class="mini-badge ${entry.decision === "accepted" ? "badge-success" : "badge-danger"}">
          ${entry.decision === "accepted" ? "Принято" : "Отклонено"}
        </span>
      </div>
      <h3 class="petition-card-title">${escapeHtml(entry.title)}</h3>
      <p class="petition-card-description">${escapeHtml(entry.body)}</p>
      ${entry.reason ? `<p class="registry-reason"><strong>Комментарий:</strong> ${escapeHtml(entry.reason)}</p>` : ""}
      <div class="petition-card-meta">
        <span>${formatDateTime(entry.createdAt)}</span>
      </div>
    </article>
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
      const data = await api("/api/registry/list");
      const entries = data.entries || [];

      if (entries.length === 0) {
        list.innerHTML = '<p class="empty-message">В реестре пока нет записей.</p>';
        return;
      }

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
        <button class="btn btn-primary save-role-btn" type="button" ${fixedAdmin ? "disabled" : ""}>Сохранить</button>
      </div>
      ${fixedAdmin ? '<p class="page-subtitle">Пользователь `nertin0` всегда администратор.</p>' : ""}
    </article>
  `;
}

async function initAdminPage() {
  if (!isAdmin()) {
    alert("Раздел администрирования доступен только администратору.");
    window.location.href = "/";
    return;
  }

  const list = document.getElementById("adminUsersList");
  if (!list) {
    return;
  }

  const loadUsers = async () => {
    try {
      const data = await api("/api/admin/users");
      const users = data.users || [];

      if (users.length === 0) {
        list.innerHTML = '<p class="empty-message">Пользователи не найдены.</p>';
        return;
      }

      list.innerHTML = users.map(adminUserCardTemplate).join("");

      list.querySelectorAll(".admin-user-card").forEach((card) => {
        const userId = Number.parseInt(card.dataset.userId || "", 10);
        const select = card.querySelector(".role-select");
        const button = card.querySelector(".save-role-btn");

        if (!select || !button || !Number.isInteger(userId) || button.disabled) {
          return;
        }

        button.addEventListener("click", async () => {
          const selectedRole = select.value;
          if (selectedRole === "admin") {
            alert("Назначение роли администратора недоступно. Можно назначать только министра.");
            return;
          }

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
    } catch (error) {
      list.innerHTML = `<p class="empty-message">${escapeHtml(error.message)}</p>`;
    }
  };

  await loadUsers();
}

async function bootstrap() {
  bindDiscordButtons();
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

  if (!state.currentUser) {
    showAuthRequired("Вход и регистрация доступны только через Discord.");
    return;
  }

  hideAuthRequired();

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
