// === Config general ===
const MODELS = 'assets/models';        // carpeta con los modelos
const REDIRECT_OK = 'bicicleta-reconocida.html';
const THRESHOLD = 0.55;                // distancia euclídea (bajar = más estricto)
const SAMPLES = 7;                     // frames promediados
const DELAY = 100;                     // ms entre frames

// === UI ===
const $status = document.getElementById('status');
const $bar = document.getElementById('bar');
const $led = document.getElementById('led');
const $log = document.getElementById('log');
const $video = document.getElementById('cam');
const $retry = document.getElementById('btn-retry');
const $cancel = document.getElementById('btn-cancel');

function log(m){ $log.textContent = m + '\n' + $log.textContent; }
function setProgress(p){ $bar.style.width = `${Math.max(0, Math.min(100, p))}%`; }

// === Utilidades ===
function getUserId() {
  const u = new URL(location.href);
  return u.searchParams.get('userId') || localStorage.getItem('userId') || 'usuario-demo';
}
function normalize(v){
  const n = Math.sqrt(v.reduce((s,x)=>s+x*x,0)) || 1;
  return v.map(x => x/n);
}
function euclidean(a,b){
  let s=0; for(let i=0;i<a.length;i++){ const d=a[i]-b[i]; s+=d*d; }
  return Math.sqrt(s);
}

// === IndexedDB ===
const DB_NAME = 'ebeco-facial'; const STORE = 'templates';
function idbOpen(){
  return new Promise((res,rej)=>{
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadTemplate(userId){
  const db = await idbOpen();
  return new Promise((res,rej)=>{
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(userId);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}

// === Cámara + modelos ===
let stream = null;
let modelsLoaded = false;
let running = false;

async function openCam(){
  // Mostrar el video siempre
  $video.classList.remove('hidden');

  // Si ya hay stream anterior, deténlo
  await stopCam();

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio:false });
    $video.srcObject = stream;
    await $video.play();
  } catch (err) {
    if (err && err.name === 'NotAllowedError') {
      throw new Error('Permiso de cámara denegado. Concede acceso para continuar.');
    }
    if (err && err.name === 'NotFoundError') {
      throw new Error('No se encontró una cámara disponible.');
    }
    throw err;
  }
}

async function stopCam(){
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    $video.srcObject = null;
  }
}

async function loadModels(){
  if (modelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS);
  modelsLoaded = true;
}

// === Embeddings ===
function drawFrame(ctx,w,h){ ctx.drawImage($video, 0, 0, w, h); }
async function getEmbedding(ctx, w, h){
  drawFrame(ctx, w, h);
  const det = await faceapi
    .detectSingleFace(ctx.canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) throw new Error('No se detectó un rostro claro. Acércate y mejora la iluminación.');
  const box = det.detection?.box;
  if (box && (box.width < 120 || box.height < 120)) throw new Error('Rostro lejos. Acércate a la cámara.');
  return normalize(Array.from(det.descriptor));
}
async function captureAvg(n=7, delay=100){
  const can = document.createElement('canvas');
  can.width = 480; can.height = 360;
  const ctx = can.getContext('2d');
  const acc = new Array(128).fill(0);
  for (let i=0;i<n;i++){
    const e = await getEmbedding(ctx, can.width, can.height);
    for (let k=0;k<128;k++) acc[k]+=e[k];
    setProgress(20 + ((i+1)/n)*60); // 20%→80% durante captura
    await new Promise(r=>setTimeout(r, delay));
  }
  for (let k=0;k<128;k++) acc[k]/=n;
  return normalize(acc);
}

// === Flujo principal ===
async function verifyFlow(){
  if (running) return;      // evita múltiples ejecuciones simultáneas
  running = true;

  try {
    const userId = getUserId();

    $status.textContent = 'Abriendo cámara…';
    $led.style.background = '#2ecc71';
    setProgress(5);
    await openCam();

    $status.textContent = 'Cargando modelos…';
    setProgress(15);
    await loadModels();

    const template = await loadTemplate(userId);
    if (!template) throw new Error('No hay plantilla registrada para este usuario.');

    $status.textContent = 'Procesando datos biométricos…';
    setProgress(20);
    const now = await captureAvg(SAMPLES, DELAY);

    $status.textContent = 'Comparando…';
    setProgress(90);
    const dist = euclidean(template, now);
    log(`Distancia: ${dist.toFixed(3)} (umbral ${THRESHOLD})`);

    if (dist <= THRESHOLD) {
      $status.textContent = 'Verificado';
      $led.style.background = '#2ecc71';
      setProgress(100);
      // opcional: detener cámara antes de irte
      await stopCam();
      setTimeout(()=> location.href = REDIRECT_OK, 650);
    } else {
      throw new Error('No coincide el rostro. Intenta nuevamente.');
    }
  } catch (e) {
    $status.textContent = 'Error de verificación';
    $led.style.background = '#e74c3c';
    $retry.classList.remove('hidden');
    log(e.message);
  } finally {
    running = false;
  }
}

$retry.onclick = async () => {
  $retry.classList.add('hidden');
  $video.classList.remove('hidden');       // asegúrate de mostrar cámara
  $led.style.background='#2ecc71';
  $status.textContent='Reintentando…';
  setProgress(0);
  await verifyFlow();
};

$cancel.onclick = async () => {
  await stopCam();
  history.back();
};

// Auto-inicio
verifyFlow();
