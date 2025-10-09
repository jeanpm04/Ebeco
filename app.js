// app.js — Auth DEMO con localStorage (solo para prototipo)
const EKEY = "ebeco_demo_state_v1";

function getState(){ try{return JSON.parse(localStorage.getItem(EKEY))??{};}catch{return{};} }
function setState(s){ localStorage.setItem(EKEY, JSON.stringify(s)); }

function _ensureAuth(){ const s=getState(); if(!s.auth) s.auth={currentUserId:null,users:[]}; setState(s); return s.auth; }

function isAuthed(){ const s=getState(); return !!(s.auth && s.auth.currentUserId); }
function getCurrentUser(){ const s=getState(); if(!s.auth?.currentUserId) return null; return s.auth.users.find(u=>u.id===s.auth.currentUserId)||null; }
function registerUser({name,email,password}){ const s=getState(); const a=_ensureAuth();
  if(a.users.some(u=>u.email.toLowerCase()===email.toLowerCase())) throw new Error("Ya existe una cuenta con ese correo.");
  const id=crypto.randomUUID?.()||String(Date.now()); a.users.push({id,name,email,password}); a.currentUserId=id; setState(s); return true; }
function loginUser(email,password){ const s=getState(); const a=_ensureAuth();
  const u=a.users.find(u=>u.email.toLowerCase()===email.toLowerCase() && u.password===password);
  if(!u) throw new Error("Credenciales incorrectas."); a.currentUserId=u.id; setState(s); return true; }
function logoutUser(){ const s=getState(); const a=_ensureAuth(); a.currentUserId=null; setState(s); }
function requireAuth(redirectIfNot="login.html"){ if(!isAuthed()) location.href=redirectIfNot; }

window.EBECO = { isAuthed, getCurrentUser, registerUser, loginUser, logoutUser, requireAuth };
// === Mostrar el nombre del usuario en todas las pantallas ===
document.addEventListener("DOMContentLoaded", () => {
  const user = window.EBECO?.getCurrentUser?.();
  const nameTag = document.getElementById("userName");
  const logoutBtn = document.getElementById("logoutBtn");

  if (nameTag && user) {
    nameTag.textContent = `Hola, ${user.name}`;
  }
  if (logoutBtn) {
    logoutBtn.style.display = user ? "inline-flex" : "none";
    logoutBtn.addEventListener("click", () => {
      EBECO.logoutUser();
      location.href = "login.html";
    });
  }
});
