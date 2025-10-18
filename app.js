// app.js — Auth + Planes DEMO con localStorage (solo prototipo)
const EKEY = "ebeco_demo_state_v1";

// ===== Planes disponibles =====
const EBECO_PLANS = {
  basico:   { key: "basico",   name: "Básico",   price: 25 },
  estandar: { key: "estandar", name: "Estándar", price: 35 },
  premium:  { key: "premium",  name: "Premium",  price: 45 },
};

// ---------- helpers de estado ----------
function ensureSchema(s) {
  if (!s.auth) s.auth = { currentUserId: null, users: [] };
  // Normaliza cada usuario para que tenga plan/suscripción/fechas
  s.auth.users = (s.auth.users || []).map(u => ({
    plan: null,
    subscriptionActive: false,
    createdAt: u.createdAt || new Date().toISOString(),
    updatedAt: u.updatedAt || new Date().toISOString(),
    ...u, // mantiene campos existentes (id, name, email, password)
  }));
  return s;
}

function getState() {
  try {
    const raw = JSON.parse(localStorage.getItem(EKEY)) ?? {};
    return ensureSchema(raw);
  } catch {
    return ensureSchema({});
  }
}

function setState(s) {
  localStorage.setItem(EKEY, JSON.stringify(s));
}

// ejecuta una mutación atómica sobre el mismo objeto 's'
function withState(mutator) {
  const s = ensureSchema(getState());
  mutator(s);           // muta s en memoria
  setState(s);          // guarda el mismo s
  return s;
}

// ---------- lecturas cómodas ----------
function isAuthed() {
  const s = getState();
  return !!(s.auth && s.auth.currentUserId);
}

function getCurrentUser() {
  const s = getState();
  if (!s.auth?.currentUserId) return null;
  return s.auth.users.find(u => u.id === s.auth.currentUserId) || null;
}

// ---------- normalizadores ----------
function normEmail(email) { return (email || "").trim().toLowerCase(); }
function normName(name) { return (name || "").trim(); }
function normPass(pw) { return (pw || "").trim(); }

// ---------- acciones: auth ----------
function registerUser({ name, email, password, plan = null }) {
  name = normName(name);
  email = normEmail(email);
  password = normPass(password);
  if (!name || !email || !password) throw new Error("Completa todos los campos.");

  withState(s => {
    const exists = s.auth.users.some(u => u.email === email);
    if (exists) throw new Error("Ya existe una cuenta con ese correo.");
    const id = crypto.randomUUID?.() || String(Date.now());

    s.auth.users.push({
      id, name, email, password,             // demo: sin hash
      plan: plan || null,                    // "basico" | "estandar" | "premium" | null
      subscriptionActive: false,             // se activa tras pago
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    s.auth.currentUserId = id; // inicia sesión
  });

  return true;
}

function loginUser(email, password) {
  email = normEmail(email);
  password = normPass(password);

  let ok = false;
  withState(s => {
    const user = s.auth.users.find(u => u.email === email && u.password === password);
    if (!user) return; // no tocar estado si no coincide
    s.auth.currentUserId = user.id;
    ok = true;
  });

  if (!ok) throw new Error("Credenciales incorrectas.");
  return true;
}

function logoutUser() {
  withState(s => { s.auth.currentUserId = null; });
}

function requireAuth(redirectIfNot = "login.html") {
  if (!isAuthed()) location.href = redirectIfNot;
}

// ---------- acciones: planes / suscripción ----------
function getPlans() { return EBECO_PLANS; }

function setPlan(planKey) {
  if (!EBECO_PLANS[planKey]) throw new Error("Plan inválido.");
  withState(s => {
    const id = s.auth.currentUserId;
    const idx = s.auth.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error("NO_SESSION");
    const u = s.auth.users[idx];
    s.auth.users[idx] = {
      ...u,
      plan: planKey,
      subscriptionActive: false, // requerirá pago nuevamente
      updatedAt: new Date().toISOString(),
    };
  });
  return true;
}

function markPaymentOk() {
  withState(s => {
    const id = s.auth.currentUserId;
    const idx = s.auth.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error("NO_SESSION");
    const u = s.auth.users[idx];
    s.auth.users[idx] = {
      ...u,
      subscriptionActive: true,
      updatedAt: new Date().toISOString(),
    };
  });
  return true;
}

function hasActiveSubscription() {
  const u = getCurrentUser();
  return !!(u && u.plan && u.subscriptionActive);
}

function getCurrentPlanInfo() {
  const u = getCurrentUser();
  if (!u?.plan) return null;
  return EBECO_PLANS[u.plan] || null;
}

// ---------- expone la API ----------
window.EBECO = {
  // auth
  isAuthed, getCurrentUser, registerUser, loginUser, logoutUser, requireAuth,
  // planes
  getPlans, setPlan, markPaymentOk, hasActiveSubscription, getCurrentPlanInfo,
};

// === Mostrar el nombre (y opcionalmente el plan) en todas las pantallas ===
document.addEventListener("DOMContentLoaded", () => {
  const user = window.EBECO?.getCurrentUser?.();
  const nameTag = document.getElementById("userName");
  const planTag = document.getElementById("userPlan"); // opcional: <span id="userPlan"></span>
  const logoutBtn = document.getElementById("logoutBtn");

  if (nameTag && user) nameTag.textContent = `Hola, ${user.name}`;
  if (planTag && user?.plan) {
    const p = EBECO_PLANS[user.plan];
    planTag.textContent = p ? ` · Plan: ${p.name}` : "";
  }
  if (logoutBtn) {
    logoutBtn.style.display = user ? "inline-flex" : "none";
    logoutBtn.addEventListener("click", () => {
      logoutUser();
      location.href = "login.html";
    });
  }
});

// debug opcional
console.log("[EBECO] app.js cargado; estado:", getState());
