// --- VARIÁVEIS GLOBAIS ---
let pdfDoc = null, pdfBytes = null, scale = 1.0;
let signatureMode = 'type'; 
let isDrawing = false;
let lastX = 0, lastY = 0;

const canvasDraw = document.getElementById('draw-canvas');
const ctxDraw = canvasDraw.getContext('2d');
const dragBox = document.getElementById('drag-box');
const pdfWrapper = document.getElementById('pdf-wrapper');

// --- 1. CAPTURA DE DADOS DA URL (IMPORTANTE PARA VENDER) ---
const urlParams = new URLSearchParams(window.location.search);
const docId = urlParams.get('doc') || "000";
const emailPrestador = urlParams.get('email_dest') || ""; // E-mail de quem te comprou o sistema

// --- 2. LOGICA DE UPLOAD E RENDERIZAÇÃO ---
document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('loading-msg').style.display = 'block';
    const reader = new FileReader();
    reader.onload = async (ev) => {
        pdfBytes = new Uint8Array(ev.target.result);
        await renderPDF(pdfBytes);
        document.getElementById('step-upload').classList.remove('active');
        document.getElementById('step-sign').classList.add('active');
        resizeCanvas();
        setupCanvasEvents();
    };
    reader.readAsArrayBuffer(file);
});

async function renderPDF(data) {
    const loadingTask = pdfjsLib.getDocument({data: data});
    pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1);

    const viewportInitial = page.getViewport({scale: 1});
    const containerWidth = document.querySelector('.container').clientWidth - 40;
    scale = containerWidth / viewportInitial.width;
    
    const viewport = page.getViewport({scale: scale});
    const canvas = document.getElementById('pdf-render');
    const ctx = canvas.getContext('2d');

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
}

// --- 3. DESENHO RESPONSIVO (PC + CELULAR) ---
function resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper && wrapper.offsetWidth > 0) {
        canvasDraw.width = wrapper.offsetWidth;
        canvasDraw.height = wrapper.offsetHeight;
        ctxDraw.lineWidth = 2;
        ctxDraw.lineCap = "round";
        ctxDraw.strokeStyle = "#000";
    }
}

function getCoords(e) {
    const rect = canvasDraw.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function setupCanvasEvents() {
    const start = (e) => { 
        if(e.cancelable) e.preventDefault(); 
        isDrawing = true; 
        const pos = getCoords(e); 
        lastX = pos.x; lastY = pos.y; 
    };
    const move = (e) => {
        if (!isDrawing) return;
        if(e.cancelable) e.preventDefault();
        const pos = getCoords(e);
        ctxDraw.beginPath();
        ctxDraw.moveTo(lastX, lastY);
        ctxDraw.lineTo(pos.x, pos.y);
        ctxDraw.stroke();
        lastX = pos.x; lastY = pos.y;
    };
    const stop = () => isDrawing = false;

    canvasDraw.addEventListener('mousedown', start);
    canvasDraw.addEventListener('touchstart', start, {passive: false});
    canvasDraw.addEventListener('mousemove', move);
    canvasDraw.addEventListener('touchmove', move, {passive: false});
    canvasDraw.addEventListener('mouseup', stop);
    canvasDraw.addEventListener('touchend', stop);
}

window.clearCanvas = () => ctxDraw.clearRect(0, 0, canvasDraw.width, canvasDraw.height);

// --- 4. ABAS E PREVIEW ---
window.switchTab = function(mode) {
    signatureMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sign-mode').forEach(d => d.style.display = 'none');

    if (mode === 'type') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('mode-type').style.display = 'block';
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('mode-draw').style.display = 'block';
        setTimeout(resizeCanvas, 100);
    }
    updateDragPreview();
}

window.updateTypedSignature = function() {
    updateDragPreview();
    document.getElementById('font-preview').innerText = document.getElementById('type-input').value || "Assinatura";
}

function updateDragPreview() {
    const dragText = document.getElementById('drag-text');
    if (signatureMode === 'type') {
        dragText.innerText = document.getElementById('type-input').value || "Assinatura";
    } else {
        dragText.innerText = "(Desenho)";
    }
}

// --- 5. MOVIMENTAR CAIXA DE ASSINATURA ---
let isDraggingBox = false;
dragBox.addEventListener('mousedown', () => isDraggingBox = true);
dragBox.addEventListener('touchstart', () => isDraggingBox = true);
document.addEventListener('mouseup', () => isDraggingBox = false);
document.addEventListener('touchend', () => isDraggingBox = false);

document.addEventListener('mousemove', (e) => moveBox(e.clientX, e.clientY));
document.addEventListener('touchmove', (e) => {
    if(isDraggingBox) e.preventDefault();
    moveBox(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

function moveBox(clientX, clientY) {
    if (!isDraggingBox) return;
    const rect = pdfWrapper.getBoundingClientRect();
    let x = clientX - rect.left - (dragBox.offsetWidth / 2);
    let y = clientY - rect.top - (dragBox.offsetHeight / 2);
    
    x = Math.max(0, Math.min(x, rect.width - dragBox.offsetWidth));
    y = Math.max(0, Math.min(y, rect.height - dragBox.offsetHeight));

    dragBox.style.left = x + 'px';
    dragBox.style.top = y + 'px';
}

// --- 6. FINALIZAR E BAIXAR ---
window.finishSignature = async function() {
    if (!document.getElementById('terms-check').checked) return alert("Aceite os termos.");

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDocLib = await PDFDocument.load(pdfBytes);
    const firstPage = pdfDocLib.getPages()[0];
    const { height: pdfH } = firstPage.getSize();

    const x = parseFloat(dragBox.style.left || 0) / scale;
    const y = pdfH - ((parseFloat(dragBox.style.top || 0) + dragBox.offsetHeight) / scale);

    if (signatureMode === 'type') {
        const text = document.getElementById('type-input').value || "Assinado";
        const font = await pdfDocLib.embedFont(StandardFonts.TimesRomanItalic);
        firstPage.drawText(text, { x: x + 5, y: y + 15, size: 20 / scale, font, color: rgb(0,0,0) });
    } else {
        const pngImageBytes = await fetch(canvasDraw.toDataURL('image/png')).then(res => res.arrayBuffer());
        const pngImage = await pdfDocLib.embedPng(pngImageBytes);
        firstPage.drawImage(pngImage, { x, y, width: dragBox.offsetWidth / scale, height: dragBox.offsetHeight / scale });
    }

    const pdfFinal = await pdfDocLib.save();
    const blob = new Blob([pdfFinal], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `OS_${docId}_Assinada.pdf`;
    link.click();

    // Notificar Prestador (Se você configurar o EmailJS)
    console.log(`Notificação deveria ir para: ${emailPrestador}`);
    alert("Documento assinado com sucesso!");
};
