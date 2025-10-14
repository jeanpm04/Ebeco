// app.js — Auth DEMO con localStorage (solo para prototipo)
const EKEY = "ebeco_demo_state_v1";

// --- helpers de estado ---
function getState() {
  try { return JSON.parse(localStorage.getItem(EKEY)) ?? {}; }
  catch { return {}; }
}
function setState(s) {
  localStorage.setItem(EKEY, JSON.stringify(s));
}
// ejecuta una mutación atómica sobre el mismo objeto 's'
function withState(mutator) {
  const s = getState();
  if (!s.auth) s.auth = { currentUserId: null, users: [] };
  mutator(s);           // muta s en memoria
  setState(s);          // guarda el mismo s
  return s;
}

// lecturas cómodas
function isAuthed() {
  const s = getState();
  return !!(s.auth && s.auth.currentUserId);
}
function getCurrentUser() {
  const s = getState();
  if (!s.auth?.currentUserId) return null;
  return s.auth.users.find(u => u.id === s.auth.currentUserId) || null;
}

// --- normalizadores ---
function normEmail(email) { return (email || "").trim().toLowerCase(); }
function normName(name) { return (name || "").trim(); }
function normPass(pw) { return (pw || "").trim(); }

// --- acciones ---
function registerUser({ name, email, password }) {
  name = normName(name);
  email = normEmail(email);
  password = normPass(password);

  if (!name || !email || !password) throw new Error("Completa todos los campos.");

  withState(s => {
    const exists = s.auth.users.some(u => u.email === email);
    if (exists) throw new Error("Ya existe una cuenta con ese correo.");
    const id = crypto.randomUUID?.() || String(Date.now());
    s.auth.users.push({ id, name, email, password }); // ojo: solo demo (sin hash)
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

// expone la API
window.EBECO = { isAuthed, getCurrentUser, registerUser, loginUser, logoutUser, requireAuth };

// === Mostrar el nombre del usuario en todas las pantallas ===
document.addEventListener("DOMContentLoaded", () => {
  const user = window.EBECO?.getCurrentUser?.();
  const nameTag = document.getElementById("userName");
  const logoutBtn = document.getElementById("logoutBtn");

  if (nameTag && user) nameTag.textContent = `Hola, ${user.name}`;
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
