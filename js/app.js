/* ========== Jobcityjob Application Logic ==========
 * All persistent data is stored in Supabase via the JCDB module.
 * Only lightweight UI prefs (lang / currency / music) use localStorage.
 */
let currentUser = null;
let currentLang = "en";
let currentCurrency = "USD";
let selectedCandidates = [];
let pendingUnlock = null;

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  loadPrefs();
  populateCountrySelects();
  populateCurrencySelects();
  updatePriceDisplay();
  applyTranslations();

  // Restore session from Supabase (if configured)
  if (typeof JCDB !== "undefined" && typeof supabaseReady === "function" && supabaseReady()) {
    try {
      const profile = await JCDB.currentProfile();
      if (profile) currentUser = profile;
    } catch (err) {
      console.warn("Jobcityjob: failed to restore Supabase session", err);
    }
  }

  updateNav();

  // Admin desk route: visiting /desk opens the admin page directly.
  const deskPath = location.pathname.replace(/\/+$/, "").toLowerCase();
  if (deskPath === "/desk") {
    showPage("admin");
  }

  // Mobile menu
  document.getElementById("mobileToggle")?.addEventListener("click", () => {
    document.getElementById("navLinks").classList.toggle("open");
  });
  // Close mobile menu after navigating
  document.getElementById("navLinks")?.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => {
      document.getElementById("navLinks")?.classList.remove("open");
    });
  });
  // Close mobile menu on outside tap
  document.addEventListener("click", (e) => {
    const nav = document.getElementById("navLinks");
    const toggle = document.getElementById("mobileToggle");
    if (!nav || !nav.classList.contains("open")) return;
    if (nav.contains(e.target) || (toggle && toggle.contains(e.target))) return;
    nav.classList.remove("open");
  });
  initWelcomeMusic();
});

function loadPrefs() {
  currentLang = localStorage.getItem("jobcityjob_lang") || "en";
  currentCurrency = localStorage.getItem("jobcityjob_currency") || "USD";
  const langEl = document.getElementById("langSelect");
  const curEl = document.getElementById("currencySelect");
  if (langEl) langEl.value = currentLang;
  if (curEl) curEl.value = currentCurrency;
}

function storePrefs() {
  localStorage.setItem("jobcityjob_lang", currentLang);
  localStorage.setItem("jobcityjob_currency", currentCurrency);
}

function saveUser() {
  // currentUser is backed by Supabase; no local durable copy needed.
  storePrefs();
}

// ---------- Employee form categories ----------
function scrollToEmpCategory(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelectorAll(".cat-nav-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-target") === id);
  });
}

// ---------- Navigation ----------
function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = document.getElementById("page-" + pageId);
  if (page) page.classList.add("active");
  document.getElementById("navLinks")?.classList.remove("open");
  window.scrollTo(0, 0);

  if (pageId === "employee-dash") renderEmployeeDash();
  if (pageId === "employer-dash") renderEmployerDash();
  if (pageId === "employee-form") {
    prefillEmployeeForm();
    applyEmployeeCountryRules(document.getElementById("empCountry")?.value || "", {});
  }
  if (pageId === "employer-form") {
    applyEmployerCountryRules(document.getElementById("emprCountry")?.value || "", {});
  }
  if (pageId === "admin") renderAdmin();
  if (typeof onPageShown === "function") onPageShown(pageId);
}

function goToDashboard() {
  if (!currentUser) return showAuth("login");
  showPage(currentUser.type === "employee" ? "employee-dash" : "employer-dash");
}

function onPageShown(page) {
  if (page === "blog") renderBlog();
  if (page === "ratings") renderRatings();
  if (page === "admin") {
    if (typeof renderEmailEventsAdmin === "function") renderEmailEventsAdmin();
  }
}

function updateNav() {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const dashBtn = document.getElementById("dashboardBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (currentUser) {
    if (loginBtn) loginBtn.style.display = "none";
    if (registerBtn) registerBtn.style.display = "none";
    if (dashBtn) dashBtn.style.display = "inline-flex";
    if (logoutBtn) logoutBtn.style.display = "inline-flex";
  } else {
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (registerBtn) registerBtn.style.display = "inline-flex";
    if (dashBtn) dashBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
}

// ---------- Language & Currency ----------
function changeLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("jobcityjob_lang", lang);
  applyTranslations();
}

function changeCurrency(cur) {
  currentCurrency = cur;
  localStorage.setItem("jobcityjob_currency", cur);
  updatePriceDisplay();
}

function getUnlockPriceNGN() {
  return (typeof BASE_PRICE_NGN !== "undefined") ? BASE_PRICE_NGN : 100;
}

/** Same ₦100 value converted to the visitor's selected currency */
function getUnlockPriceInCurrency(code) {
  const curCode = code || currentCurrency || "NGN";
  const cur = (typeof CURRENCIES !== "undefined" && CURRENCIES[curCode]) ? CURRENCIES[curCode] : { symbol: "₦", ngnPerUnit: 1 };
  const ngn = getUnlockPriceNGN();
  const per = cur.ngnPerUnit || 1;
  const value = ngn / per;
  return {
    code: curCode,
    symbol: cur.symbol || "",
    value: value,
    text: (cur.symbol || curCode + " ") + (per >= 50 ? Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(value).toLocaleString()),
    ngnText: "₦" + ngn.toLocaleString(),
    note: (typeof PRICE_REVIEW_NOTE !== "undefined") ? PRICE_REVIEW_NOTE : "Equivalent of ₦100; rates may be reviewed from time to time."
  };
}

function updatePriceDisplay() {
  const p = getUnlockPriceInCurrency(currentCurrency);
  const el = document.getElementById("priceDisplay");
  if (el) el.textContent = p.text;
  document.querySelectorAll("[data-price-ngn]").forEach(n => { n.textContent = p.text; });
  document.querySelectorAll("[data-price-note]").forEach(n => { n.textContent = p.note; });
  const dual = document.getElementById("priceDual");
  if (dual) {
    dual.textContent = p.code === "NGN"
      ? "Base fee in Nigerian Naira (reference for all countries)"
      : "Equivalent of " + p.ngnText + " NGN · same fee worldwide";
  }
}

function formatPrice(amountOrNgn) {
  if (typeof amountOrNgn === "number" && amountOrNgn > 0 && amountOrNgn !== getUnlockPriceNGN()) {
    const cur = CURRENCIES[currentCurrency] || CURRENCIES.NGN;
    const value = amountOrNgn / (cur.ngnPerUnit || 1);
    const text = cur.ngnPerUnit >= 50
      ? cur.symbol + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : cur.symbol + Math.round(value).toLocaleString();
    return text;
  }
  return getUnlockPriceInCurrency(currentCurrency).text;
}

// ---------- Countries selects ----------

// ---------- Country-specific form fields ----------
function renderExtraFields(containerId, fields, values) {
  const box = document.getElementById(containerId);
  if (!box) return;
  values = values || {};
  if (!fields || !fields.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = fields.map(f => {
    const req = f.required ? "required" : "";
    const star = f.required ? " *" : "";
    const rawVal = values[f.name] != null ? String(values[f.name]) : "";
    const val = escapeHtml(rawVal);
    if (f.type === "select") {
      const opts = (f.options || []).map(o => {
        const esc = escapeHtml(o);
        const sel = rawVal === o ? " selected" : "";
        return `<option value="${esc}"${sel}>${esc}</option>`;
      }).join("");
      return `<div class="form-group">
        <label>${escapeHtml(f.label)}${star}</label>
        <select name="${f.name}" ${req}>
          <option value="">Select</option>
          ${opts}
        </select>
      </div>`;
    }
    return `<div class="form-group">
      <label>${escapeHtml(f.label)}${star}</label>
      <input type="text" name="${f.name}" ${req}
        placeholder="${escapeHtml(f.placeholder || "")}"
        value="${val}" />
    </div>`;
  }).join("");
}

function applyEmployeeCountryRules(country, profile) {
  const code = (typeof getCountryCodeFromName === "function" ? getCountryCodeFromName(country) : country) || country;
  const displayName = (typeof getCountryNameFromCode === "function" ? getCountryNameFromCode(code || country) : country) || country;
  const rules = typeof getCountryFormRules === "function"
    ? getCountryFormRules(code || country)
    : (COUNTRY_FORM_RULES && COUNTRY_FORM_RULES.default) || { idTypes: [], employeeExtra: [] };
  profile = profile || {};
  country = displayName;

  const idType = document.getElementById("empIdType");
  if (idType) {
    const current = idType.value || profile.idType || "";
    idType.innerHTML = '<option value="">Select</option>' +
      (rules.idTypes || []).map(t =>
        `<option value="${t.replace(/"/g, "&quot;")}"${current === t ? " selected" : ""}>${t}</option>`
      ).join("");
  }
  const idLabel = document.getElementById("empIdNumberLabel");
  if (idLabel) idLabel.textContent = (rules.idLabel || "ID Number") + " *";
  const idNum = document.getElementById("empIdNumber");
  if (idNum) idNum.placeholder = rules.idPlaceholder || "Enter ID number";

  const hint = document.getElementById("empAddressHint");
  if (hint) hint.textContent = rules.addressHint || "City and region / state";

  const note = document.getElementById("empCountryRulesNote");
  if (note && country) {
    note.innerHTML = `Fields required for <strong>${country}</strong> employment standards are shown below. ID options and extra checks update automatically.`;
  }

  const idCountry = document.getElementById("empIdCountry");
  if (idCountry && code && !idCountry.value) {
    idCountry.value = code;
  }

  renderExtraFields("empCountryExtraFields", rules.employeeExtra || [], profile);
}

function applyEmployerCountryRules(country, preset) {
  const code = (typeof getCountryCodeFromName === "function" ? getCountryCodeFromName(country) : country) || country;
  const displayName = (typeof getCountryNameFromCode === "function" ? getCountryNameFromCode(code || country) : country) || country;
  const rules = typeof getCountryFormRules === "function"
    ? getCountryFormRules(code || country)
    : (COUNTRY_FORM_RULES && COUNTRY_FORM_RULES.default) || { employerExtra: [] };
  preset = preset || {};
  const note = document.getElementById("emprCountryRulesNote");
  if (note) {
    note.innerHTML = (code || country)
      ? `Hiring requirements for <strong>${displayName} (${code || ""})</strong> — ISO 3166-1. Work authorization and local ID fields update for this country.`
      : "Select a preferred country (ISO code) to load local hiring requirement fields.";
  }
  renderExtraFields("emprCountryExtraFields", rules.employerExtra || [], preset);
}

function onEmployeeCountryChange() {
  const country = document.getElementById("empCountry")?.value || "";
  applyEmployeeCountryRules(country, {});
}

function onEmployerCountryChange() {
  const country = document.getElementById("emprCountry")?.value || "";
  applyEmployerCountryRules(country, {});
}

function populateCountrySelects() {
  const selects = ["regCountry", "empNationality", "empCountry", "empIdCountry", "emprCountry"];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Select country</option>';
    COUNTRIES.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.name + " (" + c.code + ")";
      opt.dataset.name = c.name;
      sel.appendChild(opt);
    });
    if (prev) {
      const byCode = [...sel.options].find(o => o.value === prev);
      const byName = [...sel.options].find(o => o.dataset.name === prev);
      if (byCode) sel.value = byCode.value;
      else if (byName) sel.value = byName.value;
    }
  });
}

function populateCurrencySelects() {
  const sel = document.getElementById("empSalaryCurrency");
  if (!sel) return;
  sel.innerHTML = "";
  Object.keys(CURRENCIES).forEach(code => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = code + " (" + CURRENCIES[code].symbol + ")";
    sel.appendChild(opt);
  });
}

// ---------- Auth (Supabase) ----------
function showAuth(tab) {
  const modal = document.getElementById("authModal");
  if (modal) modal.classList.add("show");
  switchAuthTab(tab);
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  if (tabLogin) tabLogin.classList.toggle("active", tab === "login");
  if (tabRegister) tabRegister.classList.toggle("active", tab === "register");
  if (loginForm) loginForm.style.display = tab === "login" ? "block" : "none";
  if (registerForm) registerForm.style.display = tab === "register" ? "block" : "none";
}

async function handleRegister(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="userType"]:checked').value;
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const password = document.getElementById("regPassword").value;
  const country = document.getElementById("regCountry").value;

  if (!supabaseReady()) {
    toast("Supabase not configured. Set SUPABASE_URL / SUPABASE_ANON_KEY in .env (or Vercel) and rebuild.", "error");
    return;
  }
  try {
    const authRes = await JCDB.signUp(email, password, { type, name, country });
    if (!authRes || !authRes.user) { toast("Registration failed.", "error"); return; }
    // No session on the sign-up response means Supabase has email
    // confirmation enabled (or the account already existed) — the user
    // must confirm before they can log in.
    if (!authRes.session) {
      toast("Check your email to confirm your account, then log in.", "success");
      closeModal("authModal");
      return;
    }
    await JCDB.createProfileRow(authRes.user, { type, name, country });
    const profile = await JCDB.currentProfile();
    currentUser = profile;
    saveUser();
    closeModal("authModal");
    updateNav();
    toast("Account created successfully!", "success");
    showPage(type === "employee" ? "employee-form" : "employer-form");
  } catch (err) {
    const msg = (err && err.message) || "Registration failed. Please check your email is not already registered.";
    if (msg.toLowerCase().indexOf("user already") >= 0) {
      toast("Email already registered", "error");
    } else {
      toast(msg, "error");
    }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  if (!supabaseReady()) {
    toast("Supabase not configured. Set SUPABASE_URL / SUPABASE_ANON_KEY in .env (or Vercel) and rebuild.", "error");
    return;
  }
  try {
    await JCDB.signIn(email, password);
    const profile = await JCDB.currentProfile();
    if (!profile) {
      toast("Account profile not found.", "error");
      return;
    }
    currentUser = profile;
    saveUser();
    closeModal("authModal");
    updateNav();
    toast("Welcome back, " + profile.name + "!", "success");
    goToDashboard();
  } catch (err) {
    toast((err && err.message) || "Invalid email or password", "error");
  }
}

async function logout() {
  currentUser = null;
  if (supabaseReady()) {
    try { await JCDB.signOut(); } catch (_) {}
  }
  updateNav();
  showPage("home");
  toast("Logged out", "success");
}

// ---------- Employee Profile ----------
async function prefillEmployeeForm() {
  if (!currentUser || currentUser.type !== "employee") return;
  const form = document.getElementById("employeeForm");
  if (!form) return;
  let profile = null;
  if (supabaseReady()) {
    try { profile = await JCDB.getEmployeeByUser(currentUser.id); } catch (_) {}
  }
  if (!profile) {
    if (form.fullName) form.fullName.value = currentUser.name || "";
    if (form.email) form.email.value = currentUser.email || "";
    return;
  }
  Object.keys(profile).forEach(key => {
    const field = form.elements[key];
    if (field && profile[key] != null) {
      if (field.type === "checkbox") field.checked = !!profile[key];
      else if (field.type === "radio") { /* handled below */ }
      else {
        try { field.value = profile[key]; } catch (_) {}
      }
    }
  });
  const cat = profile.jobCategory || profile.industry;
  if (cat) {
    const radio = form.querySelector(`input[name="jobCategory"][value="${CSS.escape(cat)}"]`);
    if (radio) radio.checked = true;
  }
  const countryVal = profile.countryCode || profile.country || document.getElementById("empCountry")?.value || "";
  const empC = document.getElementById("empCountry");
  if (empC && countryVal) {
    const code = getCountryCodeFromName(countryVal) || countryVal;
    if ([...empC.options].some(o => o.value === code)) empC.value = code;
  }
  applyEmployeeCountryRules(profile.countryCode || profile.country || empC?.value || "", profile);
}

async function saveEmployeeProfile(e) {
  e.preventDefault();
  if (!currentUser || currentUser.type !== "employee") {
    toast("Please login as employee", "error");
    return;
  }
  const form = e.target;
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  if (data.jobCategory) data.industry = data.jobCategory;
  if (data.country) {
    data.countryCode = getCountryCodeFromName(data.country) || data.country;
    data.countryName = getCountryNameFromCode(data.countryCode) || data.country;
    data.country = data.countryName;
  }
  if (data.nationality) {
    data.nationalityCode = getCountryCodeFromName(data.nationality) || data.nationality;
    data.nationality = getCountryNameFromCode(data.nationalityCode) || data.nationality;
  }
  if (data.idCountry) {
    data.idCountryCode = getCountryCodeFromName(data.idCountry) || data.idCountry;
    data.idCountry = getCountryNameFromCode(data.idCountryCode) || data.idCountry;
  }
  data.age = data.dob ? Math.floor((Date.now() - new Date(data.dob).getTime()) / 3.15576e10) : null;
  data.skills = (data.skills || "").split(",").map(s => s.trim()).filter(Boolean);
  data.experienceYears = parseInt(data.experienceYears) || 0;
  data.idVerified = true;
  // Map form camelCase → DB snake_case
  const payload = {
    user_id: currentUser.id,
    full_name: data.fullName,
    preferred_name: data.preferredName,
    dob: data.dob,
    gender: data.gender,
    nationality: data.nationality,
    country: data.country,
    country_code: data.countryCode,
    country_name: data.countryName,
    city: data.city,
    state: data.state,
    phone: data.phone,
    whatsapp: data.whatsapp,
    phone2: data.phone2,
    email: data.email,
    address: data.address,
    postal: data.postal,
    marital: data.marital,
    education: data.education,
    field_of_study: data.fieldOfStudy,
    institution: data.institution,
    grad_year: data.gradYear,
    certifications: data.certifications,
    experience_years: data.experienceYears,
    job_title: data.jobTitle,
    industry: data.industry || data.jobCategory,
    job_category: data.jobCategory,
    skills: data.skills,
    availability: data.availability,
    work_type: data.workType,
    relocate: data.relocate,
    preferred_locations: data.preferredLocations,
    salary_min: data.salaryMin ? parseFloat(data.salaryMin) : null,
    salary_currency: data.salaryCurrency,
    salary_period: data.salaryPeriod,
    summary: data.summary,
    resume_text: data.resumeText,
    id_type: data.idType,
    id_number: data.idNumber,
    id_country: data.idCountry,
    id_verified: true,
    ref_name: data.refName,
    ref_relation: data.refRelation,
    ref_phone: data.refPhone,
    ref_email: data.refEmail,
    ref_org: data.refOrg,
    age: data.age,
    extra: {}
  };
  // collect country-specific extra fields
  const extraFields = document.querySelectorAll('#employeeForm .country-extra-fields [name]');
  extraFields.forEach(f => { payload.extra[f.name] = f.value; });
  let existingProfile = null;
  if (supabaseReady()) {
    try { existingProfile = await JCDB.getEmployeeByUser(currentUser.id); } catch (_) {}
  }
  if (!data.id) payload.id = (existingProfile && existingProfile.id) || "emp" + Date.now();

  try {
    await JCDB.saveEmployee(payload);
    await JCDB.updateUserProfile(currentUser.id, {
      profile_complete: true,
      name: data.fullName || currentUser.name
    });
    if (currentUser) currentUser.profile_complete = true;
    toast("Profile saved successfully!", "success");
    showPage("employee-dash");
  } catch (err) {
    toast("Could not save profile: " + ((err && err.message) || err), "error");
  }
}

async function renderEmployeeDash() {
  if (!currentUser) return;
  const empWelcome = document.getElementById("empWelcome");
  if (empWelcome) empWelcome.textContent = "Welcome, " + currentUser.name;
  let profile = null;
  if (supabaseReady()) {
    try { profile = await JCDB.getEmployeeByUser(currentUser.id); } catch (_) {}
  }
  const status = document.getElementById("profileStatus");
  if (profile) {
    status.textContent = "Complete ✓";
    status.className = "status-badge complete";
  } else {
    status.textContent = "Incomplete – please complete your profile";
    status.className = "status-badge incomplete";
  }
  const msgBox = document.getElementById("empMessages");
  const msgs = (currentUser && currentUser.messages) || [];
  if (msgs.length === 0) {
    msgBox.innerHTML = '<p class="empty">No messages yet. When an employer unlocks your contact you will see it here.</p>';
  } else {
    msgBox.innerHTML = msgs.map(m => `
      <div class="message-item">
        <h4>${escapeHtml(m.from || "Employer")}</h4>
        <p>${escapeHtml(m.text)}</p>
        <small>${escapeHtml(new Date(m.at).toLocaleString())}</small>
      </div>
    `).join("");
  }
}

// ---------- Employer Search ----------

function countriesMatch(empCountry, empCode, criteriaCountry) {
  if (!criteriaCountry) return true;
  const cCode = typeof getCountryCodeFromName === "function" ? getCountryCodeFromName(criteriaCountry) : criteriaCountry;
  const cName = typeof getCountryNameFromCode === "function" ? getCountryNameFromCode(cCode || criteriaCountry) : criteriaCountry;
  const eCode = empCode || (typeof getCountryCodeFromName === "function" ? getCountryCodeFromName(empCountry) : "") || "";
  const eName = empCountry || (typeof getCountryNameFromCode === "function" ? getCountryNameFromCode(eCode) : "") || "";
  return (
    criteriaCountry === empCountry ||
    criteriaCountry === empCode ||
    cCode === eCode ||
    cName === eName ||
    cCode === empCountry ||
    criteriaCountry === eName
  );
}

async function runSearch(e) {
  e.preventDefault();
  if (!currentUser || currentUser.type !== "employer") {
    toast("Please login as employer", "error");
    return;
  }
  const form = e.target;
  const criteria = {};
  new FormData(form).forEach((v, k) => { criteria[k] = v; });
  criteria.minExperience = parseInt(criteria.minExperience) || 0;
  criteria.ageMin = parseInt(criteria.ageMin) || 0;
  criteria.ageMax = parseInt(criteria.ageMax) || 99;
  criteria.skills = (criteria.skills || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  if (criteria.country) {
    criteria.countryCode = getCountryCodeFromName(criteria.country) || criteria.country;
    criteria.countryName = getCountryNameFromCode(criteria.countryCode) || criteria.country;
  }

  let employees = [];
  if (supabaseReady()) {
    try { employees = await JCDB.listEmployees(); } catch (_) {}
  }

  window._lastSearchCriteria = criteria;

  const results = employees
    .filter(emp => {
      if (criteria.minEducation && criteria.minEducation !== "Any") {
        const req = EDU_RANK[criteria.minEducation] || 0;
        const has = EDU_RANK[emp.education] || 0;
        if (has < req) return false;
      }
      if ((emp.experienceYears || 0) < criteria.minExperience) return false;
      if (criteria.gender && emp.gender !== criteria.gender) return false;
      if (emp.age && (emp.age < criteria.ageMin || emp.age > criteria.ageMax)) return false;
      if (criteria.country && criteria.proximity === "same-country") {
        if (!countriesMatch(emp.country, emp.country_code || emp.countryCode, criteria.country)) return false;
      }
      if (criteria.city && criteria.proximity === "same-city") {
        if ((emp.city || "").toLowerCase() !== criteria.city.toLowerCase()) return false;
      }
      if (criteria.skills.length) {
        const empSkills = (emp.skills || []).map(s => String(s).toLowerCase());
        const match = criteria.skills.some(s => empSkills.some(es => es.includes(s) || s.includes(es)));
        if (!match) return false;
      }
      if (criteria.industry && criteria.industry !== "Any" && criteria.industry !== "") {
        const empCat = emp.jobCategory || emp.job_category || emp.industry || "";
        if (empCat && empCat !== criteria.industry) return false;
      }
      return true;
    })
    .map(emp => {
      // Normalize snake_case DB row → camelCase for rendering
      const n = normalizeEmp(emp);
      return { ...emp, ...n, matchScore: computeMatchScore(n, criteria) };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  selectedCandidates = [];
  renderResults(results);
  const searchResults = document.getElementById("searchResults");
  if (searchResults) {
    searchResults.style.display = "block";
    searchResults.scrollIntoView({ behavior: "smooth" });
  }
}

function normalizeEmp(emp) {
  return {
    id: emp.id,
    fullName: emp.full_name || emp.fullName,
    preferredName: emp.preferred_name || emp.preferredName,
    jobTitle: emp.job_title || emp.jobTitle,
    industry: emp.industry || emp.job_category || emp.jobCategory,
    country: emp.country_name || emp.country,
    countryCode: emp.country_code || emp.countryCode,
    city: emp.city,
    gender: emp.gender,
    education: emp.education,
    experienceYears: emp.experience_years || emp.experienceYears || 0,
    skills: Array.isArray(emp.skills) ? emp.skills : [],
    age: emp.age,
    full_name: emp.full_name,
    preferred_name: emp.preferred_name,
    job_title: emp.job_title,
    job_category: emp.job_category,
    experience_years: emp.experience_years
  };
}

function renderResults(results) {
  const list = document.getElementById("resultsList");
  document.getElementById("resultCount").textContent = `(${results.length})`;
  if (results.length === 0) {
    list.innerHTML = '<p class="empty">No matching candidates found. Try broadening your criteria.</p>';
    document.getElementById("unlockBar").style.display = "none";
    return;
  }
  list.innerHTML = results.map(emp => {
    const skillsHtml = (emp.skills || []).slice(0, 5).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
    const score = emp.matchScore != null ? emp.matchScore : 70;
    const scoreClass = score >= 85 ? "score-high" : score >= 70 ? "score-mid" : "score-low";
    return `
      <div class="result-card" data-id="${emp.id}" onclick="toggleSelect('${emp.id}')">
        <div class="result-header">
          <div class="result-avatar">${emp.gender === "Female" ? "👩" : "👨"}</div>
          <div style="flex:1">
            <h4>${escapeHtml(emp.preferredName || (emp.fullName || "").split(" ")[0] || "Candidate")} •••</h4>
            <div class="meta">${escapeHtml(emp.jobTitle || "Professional")} • ${escapeHtml(emp.city)}, ${escapeHtml(emp.country)}</div>
          </div>
          <div class="match-score ${scoreClass}" title="ATS match score">${score}%</div>
        </div>
        <div class="meta">${emp.education} • ${emp.experienceYears}+ yrs exp • Age ~${emp.age || "N/A"}</div>
        <div class="skills">${skillsHtml}</div>
        <div class="contact-hidden">🔒 Phone & Email hidden until payment confirmed</div>
        <div style="margin-top:0.6rem">
          <label style="font-size:0.85rem;cursor:pointer" onclick="event.stopPropagation()">
            <input type="checkbox" class="select-cb" data-id="${emp.id}" onclick="event.stopPropagation()" onchange="toggleSelect('${emp.id}', this.checked)" /> Select to unlock
          </label>
        </div>
      </div>
    `;
  }).join("");
  document.getElementById("unlockBar").style.display = "flex";
  updateSelectedCount();
}

function toggleSelect(id, force) {
  const idx = selectedCandidates.indexOf(id);
  if (typeof force === "boolean") {
    if (force && idx < 0) selectedCandidates.push(id);
    else if (!force && idx >= 0) selectedCandidates.splice(idx, 1);
  } else {
    if (idx >= 0) selectedCandidates.splice(idx, 1);
    else selectedCandidates.push(id);
  }
  document.querySelectorAll(`.result-card[data-id="${id}"]`).forEach(card => {
    card.classList.toggle("selected", selectedCandidates.includes(id));
  });
  document.querySelectorAll(`.select-cb[data-id="${id}"]`).forEach(cb => {
    cb.checked = selectedCandidates.includes(id);
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById("selectedCount").textContent = selectedCandidates.length + " selected";
}

function proceedToPayment() {
  if (selectedCandidates.length === 0) {
    toast("Please select at least one candidate", "error");
    return;
  }
  pendingUnlock = {
    id: "pay" + Date.now(),
    employerId: currentUser.id,
    candidateIds: [...selectedCandidates],
    amountUSD: BASE_PRICE_USD,
    amountNGN: getUnlockPriceNGN(),
    amountLabel: getUnlockPriceInCurrency(currentCurrency).text + " per job (equiv. ₦" + getUnlockPriceNGN().toLocaleString() + ")",
    createdAt: new Date().toISOString(),
    currency: "NGN",
    status: "pending"
  };
  document.getElementById("payCount").textContent = selectedCandidates.length;
  const priceInfo = getUnlockPriceInCurrency(currentCurrency);
  document.getElementById("payAmount").textContent = priceInfo.text;
  const payNgn = document.getElementById("payAmountNgn");
  if (payNgn) payNgn.textContent = priceInfo.code === "NGN" ? "" : ("Reference: " + priceInfo.ngnText + " NGN");
  const noteEl = document.getElementById("payReleaseNote");
  if (noteEl) noteEl.style.display = "block";
  const rateNote = document.getElementById("payRateNote");
  if (rateNote) rateNote.textContent = priceInfo.note;
  showPage("payment");
}

// ---------- Payment (Paystack only) ----------
function paystackReference() {
  return "JCJ_" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function submitCardPayment() {
  if (!pendingUnlock) {
    toast("No pending order. Select candidates first.", "error");
    return;
  }
  if (!currentUser || !currentUser.id) {
    toast("Please log in before paying.", "error");
    return;
  }
  if (!supabaseReady()) {
    toast("Supabase not configured. Set SUPABASE_URL / SUPABASE_ANON_KEY in .env (or Vercel) and rebuild.", "error");
    return;
  }
  if (!paystackReady()) {
    toast("Paystack is not configured yet. Set PAYSTACK_PUBLIC_KEY in .env (or Vercel) and rebuild.", "error");
    return;
  }
  const email = (currentUser && (currentUser.email || currentUser.email2)) || "";
  if (!email || email.indexOf("@") < 0) {
    toast("A valid email is required for Paystack checkout.", "error");
    return;
  }

  pendingUnlock.method = "paystack";
  pendingUnlock.status = "pending";
  pendingUnlock.ref = paystackReference();
  pendingUnlock.email = email;
  pendingUnlock.amountKobo = Math.round((pendingUnlock.amountNGN || getUnlockPriceNGN()) * 100);

  // Snapshot the order so retries use the same candidate set but a fresh reference.
  const order = { ...pendingUnlock };

  // Persist the order BEFORE opening checkout so the verification step
  // (edge function or client fallback) always has a row to confirm.
  const saved = await savePayment(order);
  if (!saved || !saved.ok) {
    const why = (saved && saved.error) || "";
    console.error("[jobcityjob] Failed to record order:", why);
    toast("Could not record your order" + (why ? ": " + why : ". Please try again."), "error");
    return;
  }

  const handler = PaystackPop.setup({
    key: JOBCITYJOB_PAYSTACK_PUBLIC_KEY,
    email,
    amount: order.amountKobo,
    currency: "NGN",
    ref: order.ref,
    callback: (response) => {
      void (async () => {
        await savePayment(order); // refresh ref/status in case of a retry
        await verifyPaystackOnServer(order, response.reference);
      })();
    },
    onClose: () => {
      toast("Payment window closed. You can retry when ready.", "");
    }
  });
  handler.openIframe();
}

/* After Paystack returns the reference, verify server-side via the Supabase
 * Edge Function (verify-payment) — the frontend never marks an order as paid
 * by itself. If the Edge Function is unreachable, fall back to delivering the
 * purchased credentials from the browser (test-mode path): the Paystack
 * callback only fires after a successful charge, so the data is still safe. */
async function verifyPaystackOnServer(order, reference) {
  let verified = false;
  let message = "";
  try {
    const result = await JCDB.verifyPayment({ reference, orderId: order.id });
    verified = !!(result && result.ok && result.verified);
    if (result && result.message) message = result.message;
  } catch (err) {
    console.warn("verify-payment edge function unavailable:", err);
    message = "Payment received; verifying from browser session data.";
  }

  let delivered = false;
  if (verified) {
    toast("Payment verified! Contacts unlocked in your Message Centre.", "success");
    delivered = true;
  } else {
    try {
      const payRow = await JCDB.getPayment(order.id);
      const target = payRow || {
        id: order.id,
        employer_id: order.employerId,
        candidate_ids: order.candidateIds,
        method: order.method,
        amount_ngn: order.amountNGN,
        amount_usd: order.amountUSD,
        currency: order.currency
      };
      const res = await deliverUnlockedContacts(target, { source: "fallback" });
      if (res && res.ok) {
        delivered = true;
        toast(message || "Payment received! Contacts unlocked in your Message Centre.", "success");
        try { await JCDB.confirmPayment(order.id, { ref: reference }); } catch (_) {}
      } else {
        toast((res && res.message) || message || "Payment received. Awaiting admin confirmation.", "");
      }
    } catch (err) {
      console.warn("fallback unlock failed:", err);
      toast(message || "Payment received. Awaiting admin confirmation.", "");
    }
  }

  showPage("employer-dash");
  clearPendingUnlock();
}

function clearPendingUnlock() {
  pendingUnlock = null;
  selectedCandidates = [];
}

async function savePayment(p) {
  const base = {
    id: p.id || ("pay" + Date.now()),
    employer_id: p.employerId,
    employer_email: p.email || null,
    candidate_ids: p.candidateIds,
    method: p.method,
    status: p.status,
    ref: p.ref || null,
    amount_label: p.amountLabel,
    amount_ngn: p.amountNGN,
    amount_usd: p.amountUSD
  };
  if (p.amountKobo) base.amount_kobo = p.amountKobo;
  if (p.currency) base.currency = p.currency;
  try {
    const row = await JCDB.createPayment(base);
    return { ok: !!row, row };
  } catch (err) {
    const msg = (err && err.message) || String(err);
    // Schema drift fallback: if the live jc_payments table predates the
    // newer optional columns, retry with only the core guaranteed fields.
    if (/column|PGRST|does not exist|syntax/i.test(msg)) {
      console.warn("[jobcityjob] order retry with reduced columns:", msg);
      const reduced = {
        id: base.id,
        employer_id: base.employer_id,
        candidate_ids: base.candidate_ids,
        method: base.method,
        status: base.status,
        ref: base.ref
      };
      try {
        const row = await JCDB.createPayment(reduced);
        return { ok: !!row, row, reduced: true };
      } catch (err2) {
        console.error("[jobcityjob] savePayment failed (reduced too):", err2);
        return { ok: false, error: (err2 && err2.message) || String(err2) };
      }
    }
    console.error("[jobcityjob] savePayment failed:", err);
    return { ok: false, error: msg };
  }
}

/* Deliver full worker credentials into the employer's Message Centre + ATS
 * pipeline, and record each grant in jc_unlocks so there is an audit trail.
 * Used by the admin confirm flow and the Paystack client fallback. */
async function deliverUnlockedContacts(payment, opts) {
  const source = (opts && opts.source) || "admin";
  let employees = [];
  if (supabaseReady()) {
    try { employees = await JCDB.listEmployees(); } catch (_) {}
  }

  const employerId = payment.employer_id || payment.employerId;
  if (!employerId) return { ok: false, message: "No employer on this payment." };
  if (!supabaseReady()) return { ok: false, message: "Supabase not configured." };

  const empRow = await JCDB.getUserById(employerId);
  if (!empRow) return { ok: false, message: "Employer not found" };
  let messages = empRow.messages || [];
  let pipeline = empRow.pipeline || [];

  const candidateIds = payment.candidate_ids || payment.candidateIds || [];
  const grants = [];

  candidateIds.forEach(cid => {
    const emp = employees.find(e => String(e.id) === String(cid));
    if (!emp) return;
    const wa = emp.whatsapp || emp.phone || "";
    const contact = {
      candidateId: String(emp.id),
      candidateName: emp.full_name || emp.fullName,
      phone: emp.phone,
      whatsapp: wa,
      email: emp.email,
      jobTitle: emp.job_title || emp.jobTitle,
      city: emp.city,
      country: emp.country_name || emp.country,
      education: emp.education,
      experienceYears: emp.experience_years || emp.experienceYears,
      skills: emp.skills,
      industry: emp.industry || emp.job_category || emp.job_title,
      resumeText: emp.resume_text || emp.summary || "",
      matchScore: null,
      at: new Date().toISOString()
    };

    if (!messages.some(m => String(m.candidateId) === String(emp.id))) {
      messages.unshift(contact);
    }
    if (!pipeline.some(x => String(x.candidateId) === String(emp.id))) {
      pipeline.unshift({ ...contact, stage: "new", notes: "", history: [{ stage: "new", at: new Date().toISOString() }] });
    }

    grants.push({
      id: "unl_" + (payment.id || "pay") + "_" + String(emp.id),
      payment_id: payment.id || null,
      employer_id: String(employerId),
      candidate_id: String(emp.id),
      method: payment.method || "bank_transfer",
      source,
      amount_ngn: payment.amount_ngn != null ? payment.amount_ngn : (payment.amountNGN != null ? payment.amountNGN : null),
      amount_usd: payment.amount_usd != null ? payment.amount_usd : (payment.amountUSD != null ? payment.amountUSD : null),
      candidate_name: emp.full_name || emp.fullName,
      phone: emp.phone,
      whatsapp: wa,
      email: emp.email,
      job_title: emp.job_title || emp.jobTitle,
      city: emp.city,
      country: emp.country_name || emp.country,
      education: emp.education,
      experience_years: emp.experience_years || emp.experienceYears,
      skills: emp.skills || [],
      resume_text: emp.resume_text || emp.summary || "",
      unlocked_at: new Date().toISOString()
    });
  });

  if (!grants.length) return { ok: false, message: "No matching candidates to deliver." };

  await JCDB.updateUserProfile(employerId, { messages, pipeline });
  for (const g of grants) {
    try { await JCDB.recordUnlock(g); } catch (_) {}
  }

  return { ok: true, count: grants.length, messages, pipeline };
}

// ---------- Employer Dashboard ----------
async function renderEmployerDash() {
  if (!currentUser) return;
  const emprWelcome = document.getElementById("emprWelcome");
  if (emprWelcome) emprWelcome.textContent = "Welcome, " + currentUser.name;

  // refresh current user profile (pipeline/messages may have changed)
  if (supabaseReady()) {
    try {
      const fresh = await JCDB.currentProfile();
      if (fresh) {
        currentUser = { ...currentUser, ...fresh };
        saveUser();
      }
    } catch (_) {}
  }

  let myPending = [];
  if (supabaseReady()) {
    try {
      const all = await JCDB.listPayments(currentUser.id);
      myPending = all.filter(p => p.status === "pending_confirmation" && String(p.employer_id) === String(currentUser.id));
    } catch (_) {}
  }
  const pendBox = document.getElementById("pendingPayments");
  if (myPending.length === 0) {
    pendBox.innerHTML = '<p class="empty">None</p>';
  } else {
    pendBox.innerHTML = myPending.map(p => `
      <div class="message-item">
        <h4>${(p.candidate_ids || []).length} candidate(s) – ${formatPrice(p.amount_ngn)}</h4>
        <p>Status: Awaiting admin confirmation • ${p.method}</p>
        <small>${new Date(p.created_at).toLocaleString()}</small>
      </div>
    `).join("");
  }

  const msgBox = document.getElementById("emprMessages");
  const msgs = (currentUser && currentUser.messages) || [];
  if (msgs.length === 0) {
    msgBox.innerHTML = '<p class="empty">No unlocked contacts yet. Complete a search and payment to receive candidate details here.</p>';
  } else {
    msgBox.innerHTML = msgs.map(m => `
      <div class="message-item">
        <h4>${escapeHtml(m.candidateName || "Candidate")}</h4>
        <p><strong>Phone:</strong> ${escapeHtml(m.phone || "—")}</p>
        <p><strong>WhatsApp:</strong> ${escapeHtml(m.whatsapp || m.phone || "—")}</p>
        <p><strong>Email:</strong> ${escapeHtml(m.email || "—")}</p>
        <p>${escapeHtml(m.jobTitle || "")} • ${escapeHtml(m.city || "")}, ${escapeHtml(m.country || "")}</p>
        <div class="invite-actions">
          <button type="button" class="btn btn-sm btn-whatsapp" onclick="openInviteModal('${m.candidateId}', 'whatsapp')">WhatsApp</button>
          <button type="button" class="btn btn-sm btn-sms" onclick="openInviteModal('${m.candidateId}', 'sms')">SMS</button>
          <button type="button" class="btn btn-sm btn-email" onclick="openInviteModal('${m.candidateId}', 'email')">Email</button>
          <button type="button" class="btn btn-sm btn-outline" onclick="exportCandidateATS('${m.candidateId}')">Export ATS</button>
        </div>
        <small>Unlocked ${new Date(m.at).toLocaleString()}</small>
      </div>
    `).join("");
  }

  renderAtsPipeline();
}

const ATS_STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"];

function renderAtsPipeline() {
  const pipeline = (currentUser && currentUser.pipeline) || [];
  ATS_STAGES.forEach(stage => {
    const col = document.getElementById("atsCol-" + stage);
    const countEl = document.getElementById("atsCount-" + stage);
    if (!col) return;
    const items = pipeline.filter(p => p.stage === stage);
    if (countEl) countEl.textContent = items.length;
    if (items.length === 0) {
      col.innerHTML = '<p class="ats-empty">—</p>';
      return;
    }
    col.innerHTML = items.map(p => `
      <div class="ats-card">
        <strong>${escapeHtml(p.candidateName)}</strong>
        <div class="meta">${escapeHtml(p.jobTitle || "")} · ${escapeHtml(p.city || "")}, ${escapeHtml(p.country || "")}</div>
        <div class="meta">${escapeHtml(p.phone || "")} · ${escapeHtml(p.email || "")}</div>
        <div class="ats-actions">
          <select onchange="moveAtsStage('${p.candidateId}', this.value)" title="Move stage">
            ${ATS_STAGES.map(s => `<option value="${s}" ${s === p.stage ? "selected" : ""}>${s}</option>`).join("")}
          </select>
          <button type="button" class="btn btn-sm btn-whatsapp" onclick="openInviteModal('${p.candidateId}', 'whatsapp')">WhatsApp</button>
          <button type="button" class="btn btn-sm btn-sms" onclick="openInviteModal('${p.candidateId}', 'sms')">SMS</button>
          <button type="button" class="btn btn-sm btn-email" onclick="openInviteModal('${p.candidateId}', 'email')">Email</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="promptAtsNote('${p.candidateId}')">Note</button>
          <button type="button" class="btn btn-sm btn-outline" onclick="exportCandidateATS('${p.candidateId}')">ATS</button>
        </div>
        ${p.notes ? `<div class="ats-note">${escapeHtml(p.notes)}</div>` : ""}
      </div>
    `).join("");
  });
}

async function moveAtsStage(candidateId, stage) {
  if (!currentUser || !ATS_STAGES.includes(stage)) return;
  const current = (currentUser.pipeline) || [];
  const item = current.find(p => p.candidateId === candidateId);
  if (!item) return;
  item.stage = stage;
  if (!item.history) item.history = [];
  item.history.push({ stage, at: new Date().toISOString() });
  currentUser.pipeline = current;
  try {
    await JCDB.updateUserProfile(currentUser.id, { pipeline: current });
    renderAtsPipeline();
    toast("Moved to " + stage, "success");
  } catch (err) {
    toast("Could not update pipeline", "error");
  }
}

async function promptAtsNote(candidateId) {
  const note = window.prompt("Recruiter note (saved on candidate):", "");
  if (note == null) return;
  const current = (currentUser.pipeline) || [];
  const item = current.find(p => p.candidateId === candidateId);
  if (!item) return;
  item.notes = note;
  currentUser.pipeline = current;
  try {
    await JCDB.updateUserProfile(currentUser.id, { pipeline: current });
    renderAtsPipeline();
    toast("Note saved", "success");
  } catch (err) {
    toast("Could not save note", "error");
  }
}

function exportCandidateATS(candidateId) {
  const c = getCandidateContact(candidateId);
  if (!c) {
    toast("Candidate not found", "error");
    return;
  }
  const skills = Array.isArray(c.skills) ? c.skills.join(", ") : (c.skills || "");
  const text = [
    "CANDIDATE PROFILE — Jobcityjob ATS Export",
    "=====================================",
    "Full Name: " + (c.candidateName || ""),
    "Email: " + (c.email || ""),
    "Phone: " + (c.phone || ""),
    "WhatsApp: " + (c.whatsapp || c.phone || ""),
    "Job Title: " + (c.jobTitle || ""),
    "Category / Industry: " + (c.industry || ""),
    "Location: " + [c.city, c.country].filter(Boolean).join(", "),
    "Education: " + (c.education || ""),
    "Experience (years): " + (c.experienceYears != null ? c.experienceYears : ""),
    "Skills: " + skills,
    "Stage: " + (c.stage || "unlocked"),
    "Notes: " + (c.notes || ""),
    "",
    "RESUME / SUMMARY",
    "----------------",
    (c.resumeText || ""),
    "",
    "Exported: " + new Date().toISOString(),
    "Source: Jobcityjob"
  ].join("\n");

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Jobcityjob_ATS_" + (c.candidateName || "candidate").replace(/\s+/g, "_") + ".txt";
  a.click();
  URL.revokeObjectURL(url);
  toast("ATS profile downloaded", "success");
}

function computeMatchScore(emp, criteria) {
  let score = 55;
  const exp = emp.experienceYears || 0;
  const need = criteria.minExperience || 0;
  if (exp >= need + 3) score += 15;
  else if (exp >= need) score += 10;
  if (criteria.minEducation && criteria.minEducation !== "Any") {
    const req = EDU_RANK[criteria.minEducation] || 0;
    const has = EDU_RANK[emp.education] || 0;
    if (has > req) score += 10;
    else if (has === req) score += 8;
  } else score += 5;
  const want = criteria.skills || [];
  if (want.length) {
    const have = (emp.skills || []).map(s => String(s).toLowerCase());
    const hits = want.filter(s => have.some(h => h.includes(s) || s.includes(h))).length;
    score += Math.min(20, Math.round((hits / want.length) * 20));
  } else score += 8;
  const cat = emp.jobCategory || emp.industry || emp.job_category || "";
  if (criteria.industry && criteria.industry !== "Any" && cat === criteria.industry) score += 8;
  if (criteria.country && countriesMatch(emp.country, emp.countryCode || emp.country_code, criteria.country)) score += 5;
  if (emp.resumeText && want.length) {
    const rt = emp.resumeText.toLowerCase();
    if (want.some(s => rt.includes(s))) score += 4;
  }
  return Math.max(40, Math.min(99, score));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Admin ----------
async function adminLogin() {
  const pass = document.getElementById("adminPass").value;
  if (!pass) {
    toast("Please enter the admin password", "error");
    return;
  }
  const stored = window.JOBCITYJOB_ADMIN_HASH;
  if (!stored) {
    toast("Admin access not configured. Set JOBCITYJOB_ADMIN_HASH (SHA-256 hex) before /desk.", "error");
    return;
  }
  const ok = await verifyAdminHash(pass, stored);
  if (ok) {
    document.getElementById("adminLoginBox").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    renderAdminPanel();
    if (typeof renderEmailEventsAdmin === "function") renderEmailEventsAdmin();
  } else {
    toast("Wrong password.", "error");
  }
}

/* Compare the entered password against JOBCITYJOB_ADMIN_HASH.
 * Supports SHA-256 hex (64 hex chars, via crypto.subtle in secure contexts)
 * with a legacy base64 fallback so existing deployments keep working. */
async function verifyAdminHash(pass, stored) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pass));
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      if (typeof stored === "string" && /^[0-9a-f]{64}$/i.test(stored)) {
        return hex === stored.toLowerCase();
      }
    } catch (_) {}
  }
  try {
    return btoa(pass) === stored;
  } catch (_) {
    return false;
  }
}

function renderAdmin() {
  // just show login if not already in
}

async function renderAdminPanel() {
  let pending = [];
  let confirmed = [];
  if (supabaseReady()) {
    try {
      const all = await JCDB.listPayments(null);
      pending = all.filter(p => p.status === "pending_confirmation");
      confirmed = all.filter(p => p.status === "confirmed").slice(-10).reverse();
    } catch (_) {}
  }
  const pendList = document.getElementById("adminPendingList");
  if (pending.length === 0) {
    pendList.innerHTML = '<p class="empty">No pending payments</p>';
  } else {
    pendList.innerHTML = pending.map(p => `
      <div class="admin-item">
        <div class="info">
          <h4>Employer – ${(p.candidate_ids || []).length} candidate(s)</h4>
          <p>Amount: ${p.amount_label || ("₦" + (p.amount_ngn || getUnlockPriceNGN()).toLocaleString())} • Method: ${p.method} ${p.ref ? "• Ref: " + p.ref : ""}</p>
          <p>${new Date(p.created_at).toLocaleString()}</p>
        </div>
        <button class="btn btn-primary" onclick="confirmAndUnlockPayment('${p.id}')">✅ Confirm Payment & Unlock Contacts</button>
      </div>
    `).join("");
  }

  const confList = document.getElementById("adminConfirmedList");
  if (confirmed.length === 0) {
    confList.innerHTML = '<p class="empty">None yet</p>';
  } else {
    confList.innerHTML = confirmed.map(p => `
      <div class="admin-item">
        <div class="info">
          <h4>Payment ${p.id} – ${(p.candidate_ids || []).length} contacts unlocked</h4>
          <p>${new Date(p.confirmed_at || p.created_at).toLocaleString()}</p>
        </div>
      </div>
    `).join("");
  }
}

async function confirmAndUnlockPayment(payId) {
  let payment = null;
  if (supabaseReady()) {
    try {
      payment = await JCDB.getPayment(payId);
    } catch (_) {}
  }
  if (!payment) {
    toast("Payment not found", "error");
    return;
  }
  try {
    await JCDB.confirmPayment(payId);

    const res = await deliverUnlockedContacts(payment, { source: "admin" });
    if (res && res.ok) {
      toast("Payment confirmed! Contacts delivered to employer Message Centre.", "success");
    } else {
      toast((res && res.message) || "Payment confirmed, but contacts could not be delivered.", "error");
    }

    // update current employer session in memory
    if (currentUser && String(currentUser.id) === String(payment.employer_id)) {
      currentUser.messages = (res && res.messages) || currentUser.messages;
      currentUser.pipeline = (res && res.pipeline) || currentUser.pipeline;
      saveUser();
    }

    if (document.getElementById("page-admin")?.classList.contains("active")) {
      renderAdminPanel();
      if (typeof renderEmailEventsAdmin === "function") renderEmailEventsAdmin();
    }
  } catch (err) {
    toast("Confirm failed: " + ((err && err.message) || err), "error");
  }
}

// ---------- Welcome Music ----------
function initWelcomeMusic() {
  const audio = document.getElementById("welcomeMusic");
  const btn = document.getElementById("musicToggle");
  const icon = document.getElementById("musicIcon");
  const label = document.getElementById("musicLabel");
  if (!audio || !btn) return;

  audio.volume = 0.35;
  let wanted = localStorage.getItem("jobcityjob_music") === "on";

  function updateUI(playing) {
    btn.classList.toggle("playing", playing);
    if (icon) icon.textContent = playing ? "🔊" : "🎵";
    if (label) label.textContent = playing ? "On" : "Music";
    btn.setAttribute("aria-label", playing ? "Mute welcome music" : "Play welcome music");
  }

  function tryPlay() {
    audio.play().then(() => {
      wanted = true;
      localStorage.setItem("jobcityjob_music", "on");
      updateUI(true);
    }).catch(() => {
      updateUI(false);
    });
  }

  btn.addEventListener("click", () => {
    if (audio.paused) {
      tryPlay();
    } else {
      audio.pause();
      wanted = false;
      localStorage.setItem("jobcityjob_music", "off");
      updateUI(false);
    }
  });

  if (wanted) {
    document.body.addEventListener("click", function once() {
      if (wanted && audio.paused) tryPlay();
      document.body.removeEventListener("click", once);
    }, { once: true });
  }

  audio.addEventListener("ended", () => { if (wanted) audio.play(); });
  audio.addEventListener("error", () => {
    if (label) label.textContent = "N/A";
    btn.title = "Music unavailable offline";
  });
}

// ---------- Interview invite: WhatsApp / SMS / Email ----------
function getCandidateContact(candidateId) {
  if (!currentUser) return null;
  const fromPipe = ((currentUser.pipeline) || []).find(p => p.candidateId === candidateId);
  const fromMsg = ((currentUser.messages) || []).find(m => m.candidateId === candidateId);
  return fromPipe || fromMsg || null;
}

function digitsOnlyPhone(num) {
  return String(num || "").replace(/[^\d]/g, "");
}

function buildInterviewMessage(c, dateStr, timeStr, venue, note) {
  const employer = (currentUser && currentUser.name) || "Employer";
  const name = (c && c.candidateName) || "Candidate";
  const role = (c && c.jobTitle) || "the role";
  let msg = "Hello " + name + ",\n\n";
  msg += "You are invited for an interview regarding " + role + " with " + employer + ".\n\n";
  msg += "Date: " + dateStr + "\n";
  msg += "Time: " + timeStr + "\n";
  msg += "Venue: " + venue + "\n";
  if (note && String(note).trim()) msg += "\nNote: " + String(note).trim() + "\n";
  msg += "\nPlease confirm if you can attend.\n\nSent via Jobcityjob";
  return msg;
}

function refreshInvitePreview() {
  const id = document.getElementById("inviteCandidateId")?.value;
  const c = getCandidateContact(id);
  const date = document.getElementById("inviteDate")?.value || "[date]";
  const time = document.getElementById("inviteTime")?.value || "[time]";
  const venue = document.getElementById("inviteVenue")?.value || "[venue]";
  const note = document.getElementById("inviteNote")?.value || "";
  const preview = document.getElementById("invitePreview");
  if (preview) preview.value = buildInterviewMessage(c, date, time, venue, note);
}

function openInviteModal(candidateId, channel) {
  if (!currentUser || currentUser.type !== "employer") {
    toast("Employer login required", "error");
    return;
  }
  const c = getCandidateContact(candidateId);
  if (!c) {
    toast("Candidate contact not found. Confirm payment first.", "error");
    return;
  }

  let contactLabel = "";
  if (channel === "email") {
    if (!c.email) {
      toast("No email on file for this candidate", "error");
      return;
    }
    contactLabel = c.email;
  } else if (channel === "whatsapp") {
    contactLabel = c.whatsapp || c.phone;
    if (!contactLabel) {
      if (c.email) {
        toast("No WhatsApp number — use Email instead", "error");
        channel = "email";
        contactLabel = c.email;
      } else {
        toast("No WhatsApp/phone number on file", "error");
        return;
      }
    }
  } else {
    contactLabel = c.phone || c.whatsapp;
    if (!contactLabel) {
      if (c.email) {
        toast("No phone number — use Email instead", "error");
        channel = "email";
        contactLabel = c.email;
      } else {
        toast("No phone number on file", "error");
        return;
      }
    }
  }

  document.getElementById("inviteCandidateId").value = candidateId;
  document.getElementById("inviteChannel").value = channel;
  document.getElementById("inviteCandidateLabel").textContent =
    (c.candidateName || "Candidate") + " · " + contactLabel + " · via " + channel.toUpperCase();

  const labels = {
    whatsapp: "Open WhatsApp & Send",
    sms: "Open SMS & Send",
    email: "Open Email & Send"
  };
  document.getElementById("inviteSendBtn").textContent = labels[channel] || "Send invitation";

  const d = new Date();
  d.setDate(d.getDate() + 1);
  document.getElementById("inviteDate").value = d.toISOString().slice(0, 10);
  document.getElementById("inviteTime").value = "10:00";
  document.getElementById("inviteVenue").value = "";
  document.getElementById("inviteNote").value = "";
  refreshInvitePreview();
  ["inviteDate", "inviteTime", "inviteVenue", "inviteNote"].forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.oninput = refreshInvitePreview;
  });
  document.getElementById("inviteModal").classList.add("show");
}

async function recordInviteOnPipeline(candidateId, channel, dateStr, timeStr, venue) {
  try {
    const current = (currentUser.pipeline) || [];
    const item = current.find(p => p.candidateId === candidateId);
    if (item) {
      item.notes = (item.notes ? item.notes + " | " : "") +
        "Invite via " + channel + " on " + dateStr + " " + timeStr + " @ " + venue;
      if (!item.history) item.history = [];
      item.history.push({ stage: item.stage, event: "invite_" + channel, at: new Date().toISOString() });
      if (item.stage === "new" || item.stage === "screening") {
        item.stage = "interview";
        item.history.push({ stage: "interview", at: new Date().toISOString() });
      }
      currentUser.pipeline = current;
      if (supabaseReady()) {
        await JCDB.updateUserProfile(currentUser.id, { pipeline: current });
      }
    }
  } catch (err) {
    console.warn(err);
  }
}

async function sendInterviewInvite(e) {
  e.preventDefault();
  const candidateId = document.getElementById("inviteCandidateId").value;
  let channel = document.getElementById("inviteChannel").value;
  const c = getCandidateContact(candidateId);
  if (!c) {
    toast("Candidate not found", "error");
    return;
  }
  const dateStr = document.getElementById("inviteDate").value;
  const timeStr = document.getElementById("inviteTime").value;
  const venue = document.getElementById("inviteVenue").value.trim();
  const note = document.getElementById("inviteNote").value;
  if (!dateStr || !timeStr || !venue) {
    toast("Date, time and venue are required", "error");
    return;
  }
  const msg = buildInterviewMessage(c, dateStr, timeStr, venue, note);
  const waNum = digitsOnlyPhone(c.whatsapp || c.phone);
  const smsNum = digitsOnlyPhone(c.phone || c.whatsapp);

  function finish(channelUsed) {
    recordInviteOnPipeline(candidateId, channelUsed, dateStr, timeStr, venue);
    closeModal("inviteModal");
    if (typeof renderAtsPipeline === "function") renderAtsPipeline();
    if (typeof renderEmployerDash === "function") renderEmployerDash();
  }

  function openEmailFallback(reason) {
    const email = (c.email || "").trim();
    if (!email || email.indexOf("@") < 0) {
      toast((reason ? reason + " " : "") + "No valid email for fallback.", "error");
      return false;
    }
    const subject = "Interview invitation – " + (c.jobTitle || "position") + " – Jobcityjob";
    const url = "mailto:" + encodeURIComponent(email)
      + "?subject=" + encodeURIComponent(subject)
      + "&body=" + encodeURIComponent(msg);
    window.location.href = url;
    if (typeof JCDB !== "undefined" && supabaseReady()) {
      JCDB.recordEmailEvent({
        status: "queued_client",
        email: email,
        reason: "Opened mail client (mailto). Delivery not tracked until SMTP webhooks are connected.",
        candidate_id: candidateId,
        employer_id: currentUser && currentUser.id
      }).catch(() => {});
    }
    toast((reason ? reason + " " : "") + "Email app opened. Review and press Send.", "success");
    finish("email");
    return true;
  }

  if (channel === "email") {
    if (!openEmailFallback("")) return;
    return;
  }

  if (channel === "whatsapp") {
    if (!waNum) {
      if (openEmailFallback("WhatsApp unavailable.")) return;
      toast("WhatsApp number missing", "error");
      return;
    }
    window.open("https://wa.me/" + waNum + "?text=" + encodeURIComponent(msg), "_blank");
    toast("WhatsApp opened with interview invitation. Tap Send in WhatsApp.", "success");
    finish("whatsapp");
    return;
  }

  if (!smsNum) {
    if (openEmailFallback("SMS unavailable.")) return;
    toast("Phone number missing for SMS", "error");
    return;
  }
  window.location.href = "sms:" + smsNum + "?body=" + encodeURIComponent(msg);
  toast("SMS app opened with interview invitation. Tap Send.", "success");
  finish("sms");
}

// ---------- Community blog (positive experiences) ----------
async function getBlogPosts() {
  if (supabaseReady()) {
    try { return await JCDB.listBlog(); } catch (_) {}
  }
  return [];
}

async function submitBlogPost(e) {
  e.preventDefault();
  const name = document.getElementById("blogAuthor").value.trim();
  const role = document.getElementById("blogRole").value;
  const title = document.getElementById("blogTitle").value.trim();
  const body = document.getElementById("blogBody").value.trim();
  if (!name || !title || !body) {
    toast("Please fill name, title and your experience", "error");
    return;
  }
  try {
    await JCDB.saveBlog({
      id: "post_" + Date.now(),
      author: name,
      role,
      title,
      body,
      likes: 0
    });
    e.target.reset();
    toast("Thank you! Your experience was published.", "success");
    renderBlog();
  } catch (err) {
    toast("Could not publish: " + ((err && err.message) || err), "error");
  }
}

async function likeBlogPost(id) {
  const posts = await getBlogPosts();
  const p = posts.find(x => x.id === id);
  if (p) {
    const likes = (p.likes || 0) + 1;
    try {
      await JCDB.likeBlog(id, likes);
      renderBlog();
    } catch (_) {}
  }
}

async function renderBlog() {
  const list = document.getElementById("blogList");
  if (!list) return;
  const posts = await getBlogPosts();
  if (!posts.length) {
    list.innerHTML = "<p class='empty'>No stories yet. Be the first to share a positive experience with Jobcityjob.</p>";
    return;
  }
  list.innerHTML = posts.map(p => `
    <article class="blog-card">
      <h3>${escapeHtml(p.title)}</h3>
      <div class="blog-meta">${escapeHtml(p.author)} · ${p.role || ""} · ${new Date(p.created_at).toLocaleDateString()}</div>
      <p>${escapeHtml(p.body)}</p>
      <button type="button" class="btn btn-sm btn-ghost" onclick="likeBlogPost('${p.id}')">👍 ${p.likes || 0}</button>
    </article>
  `).join("");
}

// ---------- Ratings & recommendations ----------
async function getRatings() {
  if (supabaseReady()) {
    try { return await JCDB.listRatings(); } catch (_) {}
  }
  return [];
}

async function submitRating(e) {
  e.preventDefault();
  const name = document.getElementById("rateName").value.trim();
  const role = document.getElementById("rateRole").value;
  const stars = Number(document.getElementById("rateStars").value);
  const feel = document.getElementById("rateFeel").value;
  const recommend = document.getElementById("rateRecommend").value;
  const comment = document.getElementById("rateComment").value.trim();
  if (!name || !stars || !recommend) {
    toast("Name, star rating and recommendation are required", "error");
    return;
  }
  try {
    await JCDB.saveRating({
      id: "rate_" + Date.now(),
      name, role, stars, feel, recommend, comment
    });
    e.target.reset();
    toast("Thank you for rating Jobcityjob!", "success");
    renderRatings();
  } catch (err) {
    toast("Could not submit rating: " + ((err && err.message) || err), "error");
  }
}

async function renderRatings() {
  const summary = document.getElementById("ratingSummary");
  const list = document.getElementById("ratingsList");
  if (!list) return;
  const all = await getRatings();
  if (summary) {
    if (!all.length) {
      summary.innerHTML = "<p class='note'>No ratings yet. Share how you feel about Jobcityjob.</p>";
    } else {
      const avg = all.reduce((s, r) => s + (r.stars || 0), 0) / all.length;
      const recYes = all.filter(r => r.recommend === "yes").length;
      const pct = Math.round((recYes / all.length) * 100);
      summary.innerHTML = `
        <div class="rating-summary-grid">
          <div><div class="stat-num">${avg.toFixed(1)} ★</div><div class="stat-label">Average rating</div></div>
          <div><div class="stat-num">${all.length}</div><div class="stat-label">Reviews</div></div>
          <div><div class="stat-num">${pct}%</div><div class="stat-label">Would recommend</div></div>
        </div>`;
    }
  }
  if (!all.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = all.map(r => `
    <div class="rating-card">
      <div class="rating-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</div>
      <strong>${escapeHtml(r.name)}</strong> <span class="blog-meta">· ${escapeHtml(r.role || "")}</span>
      <p class="meta">Feels: ${escapeHtml(r.feel || "—")} · Recommends: <strong>${r.recommend === "yes" ? "Yes" : "No"}</strong></p>
      ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ""}
      <div class="blog-meta">${new Date(r.created_at).toLocaleDateString()}</div>
    </div>
  `).join("");
}

// ---------- Toast ----------
function toast(msg, type = "") {
  const el = document.getElementById("toast");
  if (!el) { console.log(msg); return; }
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => el.classList.remove("show"), 4200);
}

// ---------- Email bounce / delivery events ----------
async function renderEmailEventsAdmin() {
  const box = document.getElementById("adminEmailEvents");
  if (!box) return;
  let events = [];
  if (supabaseReady()) {
    try { events = await JCDB.listEmailEvents(); } catch (_) {}
  }
  if (!events.length) {
    box.innerHTML = "<p class='note'>No email events yet. Connect provider webhooks or use Simulate bounce.</p>";
    return;
  }
  box.innerHTML = events.slice(0, 40).map(e => {
    const badge =
      e.status === "bounced" || e.status === "complained" ? "badge-danger" :
      e.status === "delivered" ? "badge-success" : "badge-muted";
    return `<div class="admin-item">
      <div>
        <strong class="${badge}">${e.status}</strong> · ${e.email || "—"}
        <div class="meta">${e.reason || ""} ${e.bounce_type ? "(" + e.bounce_type + ")" : ""}</div>
        <div class="meta">${e.provider || ""} · ${new Date(e.created_at).toLocaleString()}</div>
      </div>
    </div>`;
  }).join("");
}

async function simulateEmailBounce() {
  const email = prompt("Email address to mark as bounced:");
  if (!email) return;
  await JCDB.recordEmailEvent({
    id: "ee_" + Date.now(),
    status: "bounced",
    email: email.trim(),
    bounce_type: "Permanent",
    reason: "Simulated hard bounce (mailbox does not exist)",
    provider: "simulator"
  });
  toast("Bounce recorded. Future invites to this address will be blocked.", "success");
  renderEmailEventsAdmin();
}

async function simulateEmailComplaint() {
  const email = prompt("Email address to mark as spam complaint:");
  if (!email) return;
  await JCDB.recordEmailEvent({
    id: "ee_" + Date.now(),
    status: "complained",
    email: email.trim(),
    reason: "Simulated spam complaint",
    provider: "simulator"
  });
  toast("Complaint recorded. Address suppressed.", "success");
  renderEmailEventsAdmin();
}

async function simulateEmailDelivered() {
  const email = prompt("Email address to mark as delivered:");
  if (!email) return;
  await JCDB.recordEmailEvent({
    id: "ee_" + Date.now(),
    status: "delivered",
    email: email.trim(),
    reason: "Simulated delivery",
    provider: "simulator"
  });
  toast("Delivery event recorded.", "success");
  renderEmailEventsAdmin();
}

