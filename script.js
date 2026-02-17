// VARIÁVEIS GLOBAIS
let pdfDoc = null, pdfBytes = null, scale = 1.0;
let signatureMode = 'type'; // 'type' ou 'draw'
let isDrawing = false;
let lastX = 0, lastY = 0;

// ELEMENTOS DOM
const fileInput = document.getElementById('file-input');
const canvasDraw = document.getElementById('draw-canvas');
const ctxDraw = canvasDraw.getContext('2d');
const dragBox = document.getElementById('drag-box');
const pdfWrapper = document.getElementById('pdf-wrapper');

// --- 1. UPLOAD E RENDERIZAÇÃO DO PDF ---
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "application/pdf") return alert("Erro: Selecione um PDF válido.");

    document.getElementById('loading-msg').style.display = 'block';

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            pdfBytes = new Uint8Array(ev.target.result);
            await renderPDF(pdfBytes);
            
            document.getElementById('step-upload').classList.remove('active');
            document.getElementById('step-sign').classList.add('active');
            
            // Inicializa canvas de desenho
            resizeCanvas();
            setupCanvasEvents();
        } catch (err) {
            alert("Erro ao abrir PDF: " + err.message);
            location.reload();
        }
    };
    reader.readAsArrayBuffer(file);
});

async function renderPDF(data) {
    const loadingTask = pdfjsLib.getDocument({data: data});
    pdfDoc = await loadingTask.promise;
    const page = await pdfDoc.getPage(1); // Página 1

    // Cálculo responsivo de escala
    const viewportInitial = page.getViewport({scale: 1});
    const containerWidth = document.querySelector('.container').clientWidth - 40; // padding
    scale = containerWidth / viewportInitial.width;
    
    const viewport = page.getViewport({scale: scale});
    const canvas = document.getElementById('pdf-render');
    const ctx = canvas.getContext('2d');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
}

// --- 2. CONTROLE DE ABAS (DIGITAR/DESENHAR) ---
window.switchTab = function(mode) {
    signatureMode = mode;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sign-mode').forEach(d => d.style.display = 'none');

    if (mode === 'type') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('mode-type').style.display = 'block';
        updatePreview('text');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('mode-draw').style.display = 'block';
        // Hack para o canvas renderizar corretamente ao aparecer
        setTimeout(resizeCanvas, 50);
        updatePreview('draw');
    }
}

// --- 3. LÓGICA DE DESENHO (MOUSE + TOUCH) ---
function resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (wrapper.offsetWidth > 0) {
        canvasDraw.width = wrapper.offsetWidth;
        canvasDraw.height = wrapper.offsetHeight;
        
        ctxDraw.lineWidth = 2;
        ctxDraw.lineCap = "round";
        ctxDraw.lineJoin = "round";
        ctxDraw.strokeStyle = "#000000";
    }
}
window.addEventListener('resize', resizeCanvas);

function getCoords(e) {
    const rect = canvasDraw.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function setupCanvasEvents() {
    ['mousedown', 'touchstart'].forEach(evt => 
        canvasDraw.addEventListener(evt, (e) => {
            if (e.cancelable) e.preventDefault();
            isDrawing = true;
            const pos = getCoords(e);
            lastX = pos.x; lastY = pos.y;
        }, {passive: false})
    );

    ['mousemove', 'touchmove'].forEach(evt => 
        canvasDraw.addEventListener(evt, (e) => {
            if (e.cancelable) e.preventDefault();
            if (!isDrawing) return;
            const pos = getCoords(e);
            ctxDraw.beginPath();
            ctxDraw.moveTo(lastX, lastY);
            ctxDraw.lineTo(pos.x, pos.y);
            ctxDraw.stroke();
            lastX = pos.x; lastY = pos.y;
        }, {passive: false})
    );

    ['mouseup', 'touchend', 'mouseout'].forEach(evt => 
        canvasDraw.addEventListener(evt, () => isDrawing = false)
    );
}

window.clearCanvas = () => ctxDraw.clearRect(0, 0, canvasDraw.width, canvasDraw.height);

// --- 4. DIGITAÇÃO ---
window.updateTypedSignature = function() {
    const text = document.getElementById('type-input').value || "Assinatura";
    document.getElementById('font-preview').innerText = text;
    if (signatureMode === 'type') {
        document.getElementById('drag-text').innerText = text;
    }
}

function updatePreview(type) {
    const box = document.getElementById('drag-box');
    const text = document.getElementById('drag-text');
    
    if (type === 'text') {
        box.style.background = 'rgba(245, 158, 11, 0.2)';
        text.style.display = 'block';
        text.innerText = document.getElementById('type-input').value || "Assinatura";
    } else {
        box.style.background = 'rgba(37, 99, 235, 0.1)';
        text.style.display = 'block';
        text.innerText = "(Seu Desenho)";
        text.style.fontFamily = 'Arial';
        text.style.fontSize = '14px';
    }
}

// --- 5. DRAG AND DROP (CAIXA) ---
let isDraggingBox = false;

// Eventos unificados Mouse/Touch
const startDrag = (e) => { isDraggingBox = true; };
const endDrag = () => { isDraggingBox = false; };

dragBox.addEventListener('mousedown', startDrag);
dragBox.addEventListener('touchstart', startDrag, {passive: true});
document.addEventListener('mouseup', endDrag);
document.addEventListener('touchend', endDrag);

const moveBox = (clientX, clientY) => {
    if (!isDraggingBox) return;
    const rect = pdfWrapper.getBoundingClientRect();
    
    let x = clientX - rect.left - (dragBox.offsetWidth / 2);
    let y = clientY - rect.top - (dragBox.offsetHeight / 2);
    
    // Limites
    const maxX = rect.width - dragBox.offsetWidth;
    const maxY = rect.height - dragBox.offsetHeight;

    if (x < 0) x = 0; if (x > maxX) x = maxX;
    if (y < 0) y = 0; if (y > maxY) y = maxY;

    dragBox.style.left = x + 'px';
    dragBox.style.top = y + 'px';
};

document.addEventListener('mousemove', e => moveBox(e.clientX, e.clientY));
document.addEventListener('touchmove', e => {
    if (isDraggingBox) e.preventDefault(); // Impede scroll ao arrastar
    moveBox(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

// --- 6. FINALIZAR E SALVAR ---
window.finishSignature = async function() {
    if (!document.getElementById('terms-check').checked) {
        return alert("Por favor, aceite os termos antes de finalizar.");
    }

    try {
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const pdfDocLib = await PDFDocument.load(pdfBytes);
        const pages = pdfDocLib.getPages();
        const firstPage = pages[0]; // Assume página 1
        
        // Conversão de Coordenadas (DOM -> PDF)
        const { width: pdfW, height: pdfH } = firstPage.getSize();
        const boxLeft = parseFloat(dragBox.style.left || 50);
        const boxTop = parseFloat(dragBox.style.top || 50);
        
        // x = (pixels esquerda / scale)
        const x = boxLeft / scale;
        // y = altura total - (pixels topo + altura box) / scale
        const y = pdfH - ((boxTop + dragBox.offsetHeight) / scale);

        if (signatureMode === 'type') {
            const text = document.getElementById('type-input').value || "Assinado";
            const font = await pdfDocLib.embedFont(StandardFonts.TimesRomanItalic);
            firstPage.drawText(text, {
                x: x + 5, y: y + 15, // Ajuste fino
                size: 24 / scale,
                font: font, color: rgb(0,0,0)
            });
        } else {
            // Salva o desenho como PNG
            const pngImageBytes = await fetch(canvasDraw.toDataURL('image/png')).then(res => res.arrayBuffer());
            const pngImage = await pdfDocLib.embedPng(pngImageBytes);
            
            firstPage.drawImage(pngImage, {
                x: x, y: y,
                width: dragBox.offsetWidth / scale,
                height: dragBox.offsetHeight / scale
            });
        }

        const pdfBytesFinal = await pdfDocLib.save();
        const blob = new Blob([pdfBytesFinal], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Documento_Assinado.pdf";
        link.click();
        
        alert("Sucesso! O download do PDF assinado começará agora.");

    } catch (err) {
        alert("Erro ao gerar PDF final: " + err.message);
        console.error(err);
    }
}