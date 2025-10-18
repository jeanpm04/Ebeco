// POC local: registro + verificación facial (IndexedDB) con face-api.js
const $log = document.getElementById('log');
const $video = document.getElementById('cam');
const $canvas = document.getElementById('snap');
const ctx = $canvas.getContext('2d');

function log(m){ $log.textContent = `${new Date().toLocaleTimeString()} ▶ ${m}\n` + $log.textContent; }

// -------- Cámara --------
let stream = null;
async function openCam(){
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  $video.srcObject = stream;
  await $video.play();
  log('Cámara abierta.');
}
function stopCam(){
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    $video.srcObject = null;
    log('Cámara cerrada.');
  }
}
function drawFrame(){ ctx.drawImage($video, 0, 0, $canvas.width, $canvas.height); }

// -------- Modelos --------
const MODEL_URL = 'assets/models'; // <- ubicamos modelos dentro de /assets/models
async function loadModels(){
  log('Cargando modelos...');
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  log('Modelos listos.');
}

// -------- Embeddings --------
function normalize(v){
  let n = Math.sqrt(v.reduce((s,x)=>s+x*x,0)) || 1;
  return v.map(x => x / n);
}
function euclidean(a, b){
  let s = 0; for (let i=0;i<a.length;i++){ const d = a[i]-b[i]; s += d*d; }
  return Math.sqrt(s);
}
async function getEmbedding() {
  drawFrame();
  const opts = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.6,
  });
  const det = await faceapi
    .detectSingleFace($canvas, opts)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) throw new Error('No se detectó un rostro claro. Mejora iluminación / acércate.');
  const box = det.detection?.box;
  if (box && (box.width < 120 || box.height < 120)) {
    throw new Error('Rostro muy pequeño/lejos. Acércate a la cámara.');
  }
  return normalize(Array.from(det.descriptor));
}
async function captureAvgEmbedding(n = 7, delayMs = 100){
  const acc = new Array(128).fill(0);
  for (let i=0;i<n;i++){
    const e = await getEmbedding();
    for (let k=0;k<128;k++) acc[k] += e[k];
    await new Promise(r => setTimeout(r, delayMs));
  }
  for (let k=0;k<128;k++) acc[k] /= n;
  return normalize(acc);
}

// -------- IndexedDB --------
const DB_NAME = 'ebeco-facial';
const STORE = 'templates';
function idbOpen(){
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function saveTemplate(userId, emb){
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(emb, userId);
    tx.oncomplete = () => { log(`Plantilla guardada para ${userId}`); res(); };
    tx.onerror = () => rej(tx.error);
  });
}
async function loadTemplate(userId){
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(userId);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

// -------- UI --------
document.getElementById('btn-start').onclick = async () => {
  try { await openCam(); await loadModels(); }
  catch (e) { log('Error abrir cámara/modelos: ' + e.message); }
};
document.getElementById('btn-stop').onclick = () => stopCam();

// REGISTRO: promedia 7 embeddings
document.getElementById('btn-capture').onclick = async () => {
  try {
    if (!stream) await openCam();
    const emb = await captureAvgEmbedding(7, 100);
    const userId = 'usuario-demo'; // TODO: integrar con usuario de EBECO si tienes login
    await saveTemplate(userId, emb);
    log('✅ Rostro registrado localmente.');
  } catch (e) { log('Error registrando: ' + e.message); }
};

// LOGIN: distancia euclídea (más estricto)
document.getElementById('btn-login').onclick = async () => {
  try {
    const userId = 'usuario-demo';
    const stored = await loadTemplate(userId);
    if (!stored) return log('No hay plantilla guardada. Registra primero.');
    if (!stream) await openCam();
    const now = await getEmbedding();
    const dist = euclidean(stored, now);
    log('Distancia euclídea: ' + dist.toFixed(3));
    if (dist <= 0.25) {
      log('✅ Rostro coincide (login local).');
      // Aquí rediriges a tu flujo de EBECO:
      // location.href = 'bicicleta-reconocida.html';
    } else {
      log('❌ Rostro NO coincide.');
    }
  } catch (e) { log('Error verificando: ' + e.message); }
};
