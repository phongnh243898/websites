/**
 * javascripts.js
 * Quản lý trạng thái trang, lưu API Key trình duyệt,
 * Popover tự đóng cho Rotate & Filter (Brightness, Contrast, Color),
 * Modal AI & Modal Cấu hình xuất PDF (đã lược bỏ statusBar).
 */

const STORAGE_KEY_OPENAI = 'doc_scanner_openai_api_key';

const AppState = {
    pages: [],
    currentIndex: -1,
    activeMode: null, // 'crop' | null
    cameraStream: null,
    cameraFacingMode: 'environment',
    draggingCorner: null,

    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    startPanX: 0,
    startPanY: 0,
    panStartX: 0,
    panStartY: 0,
    activePointers: new Map(),
    lastPinchDistance: 0,
    lastPinchCenter: null
};

const DOM = {
    fileInput: document.getElementById('fileInput'),
    pageList: document.getElementById('pageList'),
    pageCount: document.getElementById('pageCount'),
    viewport: document.getElementById('viewport'),
    panzoomStage: document.getElementById('panzoomStage'),
    editorCanvas: document.getElementById('editorCanvas'),
    emptyState: document.getElementById('emptyState'),

    // Zoom
    zoomLabel: document.getElementById('zoomLabel'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),

    // 4 góc Crop
    cropOverlaySvg: document.getElementById('cropOverlaySvg'),
    cropPolygon: document.getElementById('cropPolygon'),
    handles: {
        tl: document.getElementById('handle-tl'),
        tr: document.getElementById('handle-tr'),
        br: document.getElementById('handle-br'),
        bl: document.getElementById('handle-bl')
    },

    // Nút trên thanh điều khiển: Rotate, Crop, Filter, AI
    groupRotate: document.getElementById('groupRotate'),
    btnToggleRotate: document.getElementById('btnToggleRotate'),
    popoverRotate: document.getElementById('popoverRotate'),

    btnToolCrop: document.getElementById('btnToolCrop'),

    groupFilter: document.getElementById('groupFilter'),
    btnToggleFilter: document.getElementById('btnToggleFilter'),
    popoverFilter: document.getElementById('popoverFilter'),

    // 3 icon con trong Filter: Brightness, Contrast, Color
    btnSubBrightness: document.getElementById('btnSubBrightness'),
    btnSubContrast: document.getElementById('btnSubContrast'),
    btnSubColor: document.getElementById('btnSubColor'),
    subRowBrightness: document.getElementById('subRowBrightness'),
    subRowContrast: document.getElementById('subRowContrast'),
    subRowColor: document.getElementById('subRowColor'),

    rangeBrightness: document.getElementById('rangeBrightness'),
    rangeContrast: document.getElementById('rangeContrast'),
    valBrightness: document.getElementById('valBrightness'),
    valContrast: document.getElementById('valContrast'),
    btnColorOriginal: document.getElementById('btnColorOriginal'),
    btnColorBW: document.getElementById('btnColorBW'),

    // Modal AI
    btnToolAI: document.getElementById('btnToolAI'),
    aiModal: document.getElementById('aiModal'),
    openaiApiKey: document.getElementById('openaiApiKey'),
    keySavedBadge: document.getElementById('keySavedBadge'),
    openaiPrompt: document.getElementById('openaiPrompt'),
    btnRunAIImage: document.getElementById('btnRunAIImage'),

    // Modal Cấu hình PDF
    pdfModal: document.getElementById('pdfModal'),
    pdfFileName: document.getElementById('pdfFileName'),
    pdfFormat: document.getElementById('pdfFormat'),
    pdfOrientation: document.getElementById('pdfOrientation'),
    pdfMargin: document.getElementById('pdfMargin'),
    pdfScaleMode: document.getElementById('pdfScaleMode'),

    // Modal Camera
    cameraModal: document.getElementById('cameraModal'),
    cameraVideo: document.getElementById('cameraVideo'),
    cameraStatusMsg: document.getElementById('cameraStatusMsg'),
    cameraAspectRatio: document.getElementById('cameraAspectRatio'),
    cameraRatioGuide: document.getElementById('cameraRatioGuide'),
    btnCapturePhoto: document.getElementById('btnCapturePhoto')
};

document.addEventListener('DOMContentLoaded', () => {
    initSavedApiKey();
    initEvents();
    initAutoClosePopovers();
    initZoomPanEvents();
    initCornerDragEvents();
});

/* [1] Lưu OpenAI API Key vào localStorage trình duyệt */
function initSavedApiKey() {
    try {
        const savedKey = localStorage.getItem(STORAGE_KEY_OPENAI);
        if (savedKey) {
            DOM.openaiApiKey.value = savedKey;
            DOM.keySavedBadge.classList.add('show');
        }
    } catch (_) {}

    DOM.openaiApiKey.addEventListener('input', () => {
        const val = DOM.openaiApiKey.value.trim();
        try {
            if (val) {
                localStorage.setItem(STORAGE_KEY_OPENAI, val);
                DOM.keySavedBadge.classList.add('show');
            } else {
                localStorage.removeItem(STORAGE_KEY_OPENAI);
                DOM.keySavedBadge.classList.remove('show');
            }
        } catch (_) {}
    });

    DOM.keySavedBadge.addEventListener('click', () => {
        try { localStorage.removeItem(STORAGE_KEY_OPENAI); } catch (_) {}
        DOM.openaiApiKey.value = '';
        DOM.keySavedBadge.classList.remove('show');
    });
}

/* [2] Sự kiện điều khiển chính */
function initEvents() {
    DOM.fileInput.addEventListener('change', handleFileUpload);
    document.getElementById('btnOpenCamera').addEventListener('click', () => openCamera());
    document.getElementById('btnCloseCamera').addEventListener('click', closeCamera);
    document.getElementById('btnSwitchCamera').addEventListener('click', switchCameraFacing);
    DOM.btnCapturePhoto.addEventListener('click', capturePhoto);
    DOM.cameraAspectRatio.addEventListener('change', updateCameraRatioGuide);

    // Mở & Đóng Modal PDF
    document.getElementById('btnOpenPDFModal').addEventListener('click', openPDFModal);
    document.getElementById('btnClosePDFModal').addEventListener('click', closePDFModal);
    document.getElementById('btnCancelPDFModal').addEventListener('click', closePDFModal);
    document.getElementById('btnConfirmExportPDF').addEventListener('click', handleConfirmExportPDF);

    // Rotate Sub-icons
    document.getElementById('btnRotateLeft').addEventListener('click', () => handleOrientation(-90));
    document.getElementById('btnRotateRight').addEventListener('click', () => handleOrientation(90));
    document.getElementById('btnFlipH').addEventListener('click', () => handleOrientation('flipH'));
    document.getElementById('btnFlipV').addEventListener('click', () => handleOrientation('flipV'));

    // Crop
    DOM.btnToolCrop.addEventListener('click', () => {
        closeAllPopovers();
        toggleCropMode();
    });

    // Filter: Chuyển đổi giữa 3 icon Brightness, Contrast, Color
    DOM.btnSubBrightness.addEventListener('click', () => switchFilterSubTab('brightness'));
    DOM.btnSubContrast.addEventListener('click', () => switchFilterSubTab('contrast'));
    DOM.btnSubColor.addEventListener('click', () => switchFilterSubTab('color'));

    let filterTimer = null;
    const onSliderChange = () => {
        DOM.valBrightness.textContent = DOM.rangeBrightness.value;
        DOM.valContrast.textContent = DOM.rangeContrast.value;
        clearTimeout(filterTimer);
        filterTimer = setTimeout(previewFilterLive, 30);
    };
    DOM.rangeBrightness.addEventListener('input', onSliderChange);
    DOM.rangeContrast.addEventListener('input', onSliderChange);

    DOM.btnColorOriginal.addEventListener('click', () => setColorMode('original'));
    DOM.btnColorBW.addEventListener('click', () => setColorMode('bw'));

    // Mở & Đóng Modal AI
    DOM.btnToolAI.addEventListener('click', openAIModal);
    document.getElementById('btnCloseAIModal').addEventListener('click', closeAIModal);
    document.getElementById('btnCancelAIModal').addEventListener('click', closeAIModal);
    DOM.btnRunAIImage.addEventListener('click', handleRunAIImage);

    // Áp dụng & Gốc
    document.getElementById('btnApply').addEventListener('click', () => {
        closeAllPopovers();
        handleApplyAction();
    });
    document.getElementById('btnOriginal').addEventListener('click', () => {
        closeAllPopovers();
        handleRestoreOriginal();
    });
}

function switchFilterSubTab(tab) {
    DOM.btnSubBrightness.classList.toggle('active', tab === 'brightness');
    DOM.btnSubContrast.classList.toggle('active', tab === 'contrast');
    DOM.btnSubColor.classList.toggle('active', tab === 'color');

    DOM.subRowBrightness.classList.toggle('show', tab === 'brightness');
    DOM.subRowContrast.classList.toggle('show', tab === 'contrast');
    DOM.subRowColor.classList.toggle('show', tab === 'color');
}

/* [3] Menu phụ Rotate & Filter chỉ hiện khi thao tác, tự đóng khi rời khỏi */
function initAutoClosePopovers() {
    const configs = [
        { group: DOM.groupRotate, btn: DOM.btnToggleRotate, pop: DOM.popoverRotate },
        { group: DOM.groupFilter, btn: DOM.btnToggleFilter, pop: DOM.popoverFilter }
    ];

    configs.forEach(({ group, btn, pop }) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!getActivePage()) return;
            const isShowing = pop.classList.contains('show');
            closeAllPopovers();
            if (!isShowing) {
                pop.classList.add('show');
                btn.classList.add('active');
            }
        });

        group.addEventListener('mouseleave', () => {
            if (window.innerWidth > 768) {
                pop.classList.remove('show');
                btn.classList.remove('active');
            }
        });
    });

    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.dock-item-group')) {
            closeAllPopovers();
        }
    });
}

function closeAllPopovers() {
    DOM.popoverRotate.classList.remove('show');
    DOM.btnToggleRotate.classList.remove('active');
    DOM.popoverFilter.classList.remove('show');
    DOM.btnToggleFilter.classList.remove('active');
}

/* [4] Zoom & Pan trên khung Preview */
function updateTransform() {
    DOM.panzoomStage.style.transform = `translate(${AppState.panX}px, ${AppState.panY}px) scale(${AppState.zoom})`;
    DOM.zoomLabel.textContent = `${Math.round(AppState.zoom * 100)}%`;
    const page = AppState.pages[AppState.currentIndex];
    if (page && page.corners && AppState.activeMode === 'crop') {
        renderCornerHandles(page.corners);
    }
}

function resetZoomPan() {
    AppState.zoom = 1;
    AppState.panX = 0;
    AppState.panY = 0;
    updateTransform();
}

function getPinchData() {
    const pointers = Array.from(AppState.activePointers.values()).slice(0, 2);
    if (pointers.length < 2) return null;

    const [first, second] = pointers;
    return {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        center: {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2
        }
    };
}

function zoomAt(nextZoom, clientX, clientY) {
    const rect = DOM.viewport.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const contentX = (clientX - centerX - AppState.panX) / AppState.zoom;
    const contentY = (clientY - centerY - AppState.panY) / AppState.zoom;

    AppState.zoom = Math.min(4, Math.max(0.25, nextZoom));
    AppState.panX = clientX - centerX - contentX * AppState.zoom;
    AppState.panY = clientY - centerY - contentY * AppState.zoom;
}

function isViewportControl(target) {
    return target.closest('.floating-dock') ||
        target.closest('.zoom-controls') ||
        target.classList.contains('corner-handle');
}

function initZoomPanEvents() {
    DOM.viewport.addEventListener('wheel', (e) => {
        if (AppState.currentIndex < 0) return;
        e.preventDefault();
        const zoomFactor = Math.exp(-e.deltaY * 0.0015);
        zoomAt(AppState.zoom * zoomFactor, e.clientX, e.clientY);
        updateTransform();
    }, { passive: false });

    DOM.viewport.addEventListener('pointerdown', (e) => {
        if (AppState.currentIndex < 0 || AppState.draggingCorner || isViewportControl(e.target)) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        e.preventDefault();
        DOM.viewport.setPointerCapture?.(e.pointerId);
        AppState.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (AppState.activePointers.size === 1) {
            AppState.isPanning = true;
            AppState.startPanX = e.clientX;
            AppState.startPanY = e.clientY;
            AppState.panStartX = AppState.panX;
            AppState.panStartY = AppState.panY;
        } else if (AppState.activePointers.size === 2) {
            const pinch = getPinchData();
            AppState.lastPinchDistance = pinch.distance;
            AppState.lastPinchCenter = pinch.center;
        }

        DOM.viewport.classList.add('panning');
    });

    DOM.viewport.addEventListener('pointermove', (e) => {
        if (!AppState.activePointers.has(e.pointerId)) return;
        e.preventDefault();
        AppState.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (AppState.activePointers.size >= 2) {
            const pinch = getPinchData();
            const zoomRatio = AppState.lastPinchDistance
                ? pinch.distance / AppState.lastPinchDistance
                : 1;

            zoomAt(AppState.zoom * zoomRatio, pinch.center.x, pinch.center.y);
            if (AppState.lastPinchCenter) {
                AppState.panX += pinch.center.x - AppState.lastPinchCenter.x;
                AppState.panY += pinch.center.y - AppState.lastPinchCenter.y;
            }
            AppState.lastPinchDistance = pinch.distance;
            AppState.lastPinchCenter = pinch.center;
            updateTransform();
            return;
        }

        if (AppState.isPanning) {
            AppState.panX = AppState.panStartX + e.clientX - AppState.startPanX;
            AppState.panY = AppState.panStartY + e.clientY - AppState.startPanY;
            updateTransform();
        }
    });

    const endPointer = (e) => {
        AppState.activePointers.delete(e.pointerId);
        if (AppState.activePointers.size === 1) {
            const remaining = Array.from(AppState.activePointers.values())[0];
            AppState.isPanning = true;
            AppState.startPanX = remaining.x;
            AppState.startPanY = remaining.y;
            AppState.panStartX = AppState.panX;
            AppState.panStartY = AppState.panY;
        } else if (AppState.activePointers.size === 0) {
            AppState.isPanning = false;
            AppState.lastPinchDistance = 0;
            AppState.lastPinchCenter = null;
            DOM.viewport.classList.remove('panning');
        }
    };

    DOM.viewport.addEventListener('pointerup', endPointer);
    DOM.viewport.addEventListener('pointercancel', endPointer);
    DOM.viewport.addEventListener('lostpointercapture', endPointer);

    DOM.btnZoomIn.addEventListener('click', () => {
        const rect = DOM.viewport.getBoundingClientRect();
        zoomAt(AppState.zoom + 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
        updateTransform();
    });
    DOM.btnZoomOut.addEventListener('click', () => {
        const rect = DOM.viewport.getBoundingClientRect();
        zoomAt(AppState.zoom - 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
        updateTransform();
    });
    DOM.btnZoomReset.addEventListener('click', resetZoomPan);
}

/* [5] Quản lý danh sách trang ảnh */
function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => addPage(ev.target.result);
        reader.readAsDataURL(file);
    });
    DOM.fileInput.value = '';
}

function addPage(dataUrl) {
    AppState.pages.push({
        id: Date.now() + Math.random(),
        originalDataUrl: dataUrl,
        baseDataUrl: dataUrl,
        currentDataUrl: dataUrl,
        corners: null,
        filter: { brightness: 0, contrast: 0, colorMode: 'original' }
    });
    AppState.currentIndex = AppState.pages.length - 1;
    closeAllModes();
    resetZoomPan();
    renderPageList();
    loadActivePageToCanvas();
}

function selectPage(index) {
    AppState.currentIndex = index;
    closeAllModes();
    resetZoomPan();
    renderPageList();
    loadActivePageToCanvas();
}

function movePage(fromIdx, toIdx, e) {
    e.stopPropagation();
    if (toIdx < 0 || toIdx >= AppState.pages.length) return;
    const activeId = AppState.pages[AppState.currentIndex]?.id;
    const [moved] = AppState.pages.splice(fromIdx, 1);
    AppState.pages.splice(toIdx, 0, moved);
    if (activeId) {
        AppState.currentIndex = AppState.pages.findIndex(p => p.id === activeId);
    }
    renderPageList();
}

function deletePage(idx, e) {
    e.stopPropagation();
    AppState.pages.splice(idx, 1);
    if (AppState.pages.length === 0) {
        AppState.currentIndex = -1;
        closeAllModes();
    } else if (AppState.currentIndex >= AppState.pages.length) {
        AppState.currentIndex = AppState.pages.length - 1;
    }
    renderPageList();
    loadActivePageToCanvas();
}

function renderPageList() {
    DOM.pageCount.textContent = AppState.pages.length;
    DOM.pageList.innerHTML = '';

    AppState.pages.forEach((page, idx) => {
        const item = document.createElement('div');
        item.className = `page-item ${idx === AppState.currentIndex ? 'active' : ''}`;
        item.onclick = () => selectPage(idx);

        item.innerHTML = `
            <div class="page-thumb-wrap">
                <span class="page-index">${idx + 1}</span>
                <img src="${page.currentDataUrl}" alt="">
            </div>
            <div class="page-actions icon-sm">
                <button class="icon-action btn-up" title="Đẩy lên" ${idx === 0 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <button class="icon-action btn-down" title="Đẩy xuống" ${idx === AppState.pages.length - 1 ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button class="icon-action delete btn-del" title="Xóa">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;

        item.querySelector('.btn-up').onclick = (e) => movePage(idx, idx - 1, e);
        item.querySelector('.btn-down').onclick = (e) => movePage(idx, idx + 1, e);
        item.querySelector('.btn-del').onclick = (e) => deletePage(idx, e);

        DOM.pageList.appendChild(item);
    });
}

function updateColorModeUI(colorMode) {
    const isBW = colorMode === 'bw';
    DOM.btnColorOriginal.classList.toggle('active', !isBW);
    DOM.btnColorBW.classList.toggle('active', isBW);
}

function loadActivePageToCanvas(callback = null) {
    const page = AppState.pages[AppState.currentIndex];
    if (!page) {
        DOM.panzoomStage.style.display = 'none';
        DOM.emptyState.style.display = 'block';
        return;
    }

    DOM.emptyState.style.display = 'none';
    DOM.panzoomStage.style.display = 'inline-block';

    DOM.rangeBrightness.value = page.filter.brightness;
    DOM.valBrightness.textContent = page.filter.brightness;
    DOM.rangeContrast.value = page.filter.contrast;
    DOM.valContrast.textContent = page.filter.contrast;
    updateColorModeUI(page.filter.colorMode);

    const img = new Image();
    img.onload = () => {
        DOM.editorCanvas.width = img.width;
        DOM.editorCanvas.height = img.height;
        DOM.editorCanvas.getContext('2d').drawImage(img, 0, 0);
        if (callback) callback();
    };
    img.src = page.currentDataUrl;
}

/* [6] Xử lý Rotate, Crop, Filter, AI, PDF */
function getActivePage() {
    if (AppState.currentIndex < 0) {
        alert('Vui lòng tải ảnh lên hoặc chụp ảnh trước.');
        return null;
    }
    return AppState.pages[AppState.currentIndex];
}

function closeAllModes() {
    AppState.activeMode = null;
    DOM.btnToolCrop.classList.remove('active');
    closeAllPopovers();
    hideCornerHandles();
}

async function toggleCropMode() {
    const page = getActivePage();
    if (!page) return;

    if (AppState.activeMode === 'crop') {
        closeAllModes();
        return;
    }

    closeAllModes();
    AppState.activeMode = 'crop';
    DOM.btnToolCrop.classList.add('active');

    page.corners = await detectDocumentCorners(DOM.editorCanvas);
    renderCornerHandles(page.corners);
}

async function handleOrientation(mode) {
    const page = getActivePage();
    if (!page) return;

    page.baseDataUrl = await orientationDocument(page.baseDataUrl, mode);
    page.currentDataUrl = await adjustImage(page.baseDataUrl, page.filter);
    page.corners = null;
    hideCornerHandles();
    renderPageList();
    loadActivePageToCanvas();
}

async function setColorMode(mode) {
    const page = getActivePage();
    if (!page) return;

    page.filter.colorMode = mode;
    updateColorModeUI(mode);
    await previewFilterLive();
}

async function previewFilterLive() {
    const page = AppState.pages[AppState.currentIndex];
    if (!page) return;

    const tempFilter = {
        brightness: parseFloat(DOM.rangeBrightness.value),
        contrast: parseFloat(DOM.rangeContrast.value),
        colorMode: page.filter.colorMode
    };

    const previewUrl = await adjustImage(page.baseDataUrl, tempFilter);
    const img = new Image();
    img.onload = () => {
        DOM.editorCanvas.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = previewUrl;
}

async function handleApplyAction() {
    const page = getActivePage();
    if (!page) return;

    if (AppState.activeMode === 'crop' && page.corners) {
        const baseCanvas = await createCanvasFromDataUrl(page.baseDataUrl);
        const warpedDataUrl = await cropMarginDocument(baseCanvas, page.corners);

        page.baseDataUrl = warpedDataUrl;
        page.currentDataUrl = await adjustImage(page.baseDataUrl, page.filter);
        page.corners = null;

        closeAllModes();
        resetZoomPan();
        renderPageList();
        loadActivePageToCanvas();
        return;
    }

    page.filter = {
        brightness: parseFloat(DOM.rangeBrightness.value),
        contrast: parseFloat(DOM.rangeContrast.value),
        colorMode: page.filter.colorMode
    };
    page.currentDataUrl = await adjustImage(page.baseDataUrl, page.filter);
    renderPageList();
    loadActivePageToCanvas();
}

function handleRestoreOriginal() {
    const page = getActivePage();
    if (!page) return;

    page.baseDataUrl = page.originalDataUrl;
    page.currentDataUrl = page.originalDataUrl;
    page.corners = null;
    page.filter = { brightness: 0, contrast: 0, colorMode: 'original' };

    closeAllModes();
    resetZoomPan();
    renderPageList();
    loadActivePageToCanvas();
}

/* Modal AI */
function openAIModal() {
    if (!getActivePage()) return;
    closeAllPopovers();
    DOM.aiModal.classList.add('active');
}

function closeAIModal() {
    DOM.aiModal.classList.remove('active');
}

async function handleRunAIImage() {
    const page = getActivePage();
    if (!page) return;

    const apiKey = DOM.openaiApiKey.value.trim();
    const prompt = DOM.openaiPrompt.value.trim();

    if (apiKey) {
        try {
            localStorage.setItem(STORAGE_KEY_OPENAI, apiKey);
            DOM.keySavedBadge.classList.add('show');
        } catch (_) {}
    }

    DOM.btnRunAIImage.disabled = true;
    DOM.btnRunAIImage.textContent = 'Đang xử lý...';

    try {
        const resultImageDataUrl = await ocrAIImage(page.currentDataUrl, apiKey, prompt);
        page.baseDataUrl = resultImageDataUrl;
        page.currentDataUrl = resultImageDataUrl;
        page.filter = { brightness: 0, contrast: 0, colorMode: 'original' };

        renderPageList();
        loadActivePageToCanvas();
        closeAIModal();
    } catch (err) {
        alert('Lỗi xử lý AI: ' + err.message);
    } finally {
        DOM.btnRunAIImage.disabled = false;
        DOM.btnRunAIImage.textContent = 'Chạy xử lý AI';
    }
}

/* Modal Cấu hình & Xuất PDF */
function openPDFModal() {
    if (AppState.pages.length === 0) {
        alert('Chưa có trang ảnh nào để xuất PDF.');
        return;
    }
    DOM.pdfModal.classList.add('active');
}

function closePDFModal() {
    DOM.pdfModal.classList.remove('active');
}

async function handleConfirmExportPDF() {
    if (AppState.pages.length === 0) return;

    const config = {
        fileName: DOM.pdfFileName.value.trim() || 'document.pdf',
        format: DOM.pdfFormat.value,
        orientation: DOM.pdfOrientation.value,
        margin: Number(DOM.pdfMargin.value) || 0,
        scaleMode: DOM.pdfScaleMode.value
    };

    closePDFModal();
    const list = AppState.pages.map(p => p.currentDataUrl);
    await convertImages2PDF(list, config);
}

function createCanvasFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c);
        };
        img.src = dataUrl;
    });
}

/* [7] Kéo thả 4 góc Crop */
function renderCornerHandles(corners) {
    const w = DOM.editorCanvas.clientWidth;
    const h = DOM.editorCanvas.clientHeight;
    if (!w || !h) return;

    const scaleX = w / DOM.editorCanvas.width;
    const scaleY = h / DOM.editorCanvas.height;

    DOM.cropOverlaySvg.style.display = 'block';

    Object.keys(DOM.handles).forEach(k => {
        const el = DOM.handles[k];
        el.style.display = 'block';
        el.style.left = `${corners[k].x * scaleX}px`;
        el.style.top = `${corners[k].y * scaleY}px`;
    });

    const pts = [
        `${corners.tl.x * scaleX},${corners.tl.y * scaleY}`,
        `${corners.tr.x * scaleX},${corners.tr.y * scaleY}`,
        `${corners.br.x * scaleX},${corners.br.y * scaleY}`,
        `${corners.bl.x * scaleX},${corners.bl.y * scaleY}`
    ].join(' ');
    DOM.cropPolygon.setAttribute('points', pts);
}

function hideCornerHandles() {
    DOM.cropOverlaySvg.style.display = 'none';
    Object.values(DOM.handles).forEach(el => el.style.display = 'none');
}

function initCornerDragEvents() {
    Object.entries(DOM.handles).forEach(([key, el]) => {
        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            AppState.draggingCorner = key;
            if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
        });
    });

    window.addEventListener('pointermove', (e) => {
        if (!AppState.draggingCorner) return;
        const page = AppState.pages[AppState.currentIndex];
        if (!page || !page.corners) return;

        const rect = DOM.editorCanvas.getBoundingClientRect();
        const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const relY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

        const scaleX = DOM.editorCanvas.width / rect.width;
        const scaleY = DOM.editorCanvas.height / rect.height;

        page.corners[AppState.draggingCorner] = {
            x: Math.round(relX * scaleX),
            y: Math.round(relY * scaleY)
        };

        renderCornerHandles(page.corners);
    });

    window.addEventListener('pointerup', () => {
        AppState.draggingCorner = null;
    });

    window.addEventListener('resize', () => {
        const page = AppState.pages[AppState.currentIndex];
        if (page && page.corners && AppState.activeMode === 'crop') {
            renderCornerHandles(page.corners);
        }
    });
}

/* [8] Camera xin quyền & chụp ảnh */
async function openCamera(facingMode = AppState.cameraFacingMode) {
    DOM.cameraModal.classList.add('active');
    DOM.cameraStatusMsg.style.display = 'block';
    DOM.cameraStatusMsg.textContent = 'Đang yêu cầu quyền truy cập Camera...';
    DOM.btnCapturePhoto.disabled = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        DOM.cameraStatusMsg.textContent = 'Trình duyệt không hỗ trợ Camera hoặc chưa chạy qua HTTPS / localhost.';
        return;
    }

    stopCameraTracks();

    const constraintsList = [
        { video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        { video: true, audio: false }
    ];

    for (const constraints of constraintsList) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            AppState.cameraStream = stream;
            AppState.cameraFacingMode =
                stream.getVideoTracks()[0]?.getSettings().facingMode || facingMode;
            DOM.cameraVideo.srcObject = stream;
            await DOM.cameraVideo.play();
            updateCameraRatioGuide();
            DOM.cameraStatusMsg.style.display = 'none';
            DOM.btnCapturePhoto.disabled = false;
            return;
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                DOM.cameraStatusMsg.textContent = 'Quyền Camera bị từ chối. Vui lòng cấp quyền trên trình duyệt rồi thử lại.';
                return;
            }
        }
    }

    DOM.cameraStatusMsg.textContent = 'Không tìm thấy thiết bị Camera.';
}

function switchCameraFacing() {
    const nextFacing = AppState.cameraFacingMode === 'environment' ? 'user' : 'environment';
    openCamera(nextFacing);
}

function stopCameraTracks() {
    if (AppState.cameraStream) {
        AppState.cameraStream.getTracks().forEach(t => t.stop());
        AppState.cameraStream = null;
    }
    DOM.cameraVideo.srcObject = null;
}

function closeCamera() {
    stopCameraTracks();
    DOM.cameraModal.classList.remove('active');
}

function updateCameraRatioGuide() {
    const ratio = DOM.cameraAspectRatio.value;
    if (ratio === 'device') {
        DOM.cameraRatioGuide.hidden = true;
        return;
    }

    DOM.cameraRatioGuide.hidden = false;
    DOM.cameraRatioGuide.style.setProperty('--camera-ratio', ratio);
}

function getCaptureRatio() {
    const value = DOM.cameraAspectRatio.value;
    return value === 'device' ? DOM.cameraVideo.videoWidth / DOM.cameraVideo.videoHeight : Number(value);
}

function capturePhoto() {
    if (!AppState.cameraStream || !DOM.cameraVideo.videoWidth) return;
    const c = document.createElement('canvas');
    const sourceWidth = DOM.cameraVideo.videoWidth;
    const sourceHeight = DOM.cameraVideo.videoHeight;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = getCaptureRatio();
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (targetRatio > sourceRatio) {
        cropHeight = Math.round(sourceWidth / targetRatio);
    } else if (targetRatio < sourceRatio) {
        cropWidth = Math.round(sourceHeight * targetRatio);
    }

    const cropX = Math.round((sourceWidth - cropWidth) / 2);
    const cropY = Math.round((sourceHeight - cropHeight) / 2);
    c.width = cropWidth;
    c.height = cropHeight;
    c.getContext('2d').drawImage(
        DOM.cameraVideo,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
    );
    addPage(c.toDataURL('image/jpeg', 0.94));
    closeCamera();
}