/**
 * convert_images_to_pdf.js
 * 1. orientationDocument()   : Xoay / Lật ảnh
 * 2. detectDocumentCorners() : Phát hiện 4 góc tài liệu
 * 3. cropMarginDocument()    : Trải phẳng tứ giác (Perspective Warp)
 * 4. adjustImage()           : Brightness, Contrast & Color Mode (Original / BW)
 * 5. ocrImage()              : Nhận diện chữ Tesseract.js
 * 6. ocrAIImage()            : Xử lý ảnh với OpenAI API
 * 7. convertImages2PDF()     : Xuất PDF với cấu hình khổ giấy, hướng, lề, chất lượng
 */

/* [1] Xoay & Lật ảnh */
async function orientationDocument(imageDataUrl, mode = 'auto') {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (mode === 'flipH' || mode === 'flipV') {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.translate(mode === 'flipH' ? canvas.width : 0, mode === 'flipV' ? canvas.height : 0);
                ctx.scale(mode === 'flipH' ? -1 : 1, mode === 'flipV' ? -1 : 1);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
                return;
            }

            let angle = mode === 'auto' ? (img.width > img.height ? 90 : 0) : (Number(mode) || 0);
            if (angle === 0) {
                resolve(imageDataUrl);
                return;
            }

            const rad = (angle * Math.PI) / 180;
            if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(rad);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.src = imageDataUrl;
    });
}

/* [2] Tự động phát hiện 4 góc tài liệu */
async function detectDocumentCorners(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height).data;

    let tl = null, tr = null, br = null, bl = null;
    let minSum = Infinity, maxSum = -Infinity;
    let minDiff = Infinity, maxDiff = -Infinity;
    let count = 0;

    const step = Math.max(2, Math.floor(Math.min(width, height) / 250));

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            const lum = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];

            if (lum > 165) {
                count++;
                const sum = x + y;
                const diff = x - y;

                if (sum < minSum) { minSum = sum; tl = { x, y }; }
                if (sum > maxSum) { maxSum = sum; br = { x, y }; }
                if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
                if (diff < minDiff) { minDiff = diff; bl = { x, y }; }
            }
        }
    }

    if (count < 100 || !tl || !tr || !br || !bl) {
        const px = Math.round(width * 0.07);
        const py = Math.round(height * 0.07);
        return {
            tl: { x: px, y: py },
            tr: { x: width - px, y: py },
            br: { x: width - px, y: height - py },
            bl: { x: px, y: height - py }
        };
    }

    return { tl, tr, br, bl };
}

/* [3] Cắt lề & Trải phẳng tứ giác */
async function cropMarginDocument(sourceCanvas, corners = null) {
    const c = corners || await detectDocumentCorners(sourceCanvas);
    const { tl, tr, br, bl } = c;

    const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
    const dstW = Math.max(50, Math.round(Math.max(widthTop, widthBottom)));

    const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);
    const dstH = Math.max(50, Math.round(Math.max(heightLeft, heightRight)));

    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const srcData = sourceCanvas.getContext('2d').getImageData(0, 0, srcW, srcH).data;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = dstW;
    outCanvas.height = dstH;
    const outCtx = outCanvas.getContext('2d');
    const outImgData = outCtx.createImageData(dstW, dstH);
    const dstData = outImgData.data;

    for (let y = 0; y < dstH; y++) {
        const v = dstH > 1 ? y / (dstH - 1) : 0;
        const oneMinusV = 1 - v;

        for (let x = 0; x < dstW; x++) {
            const u = dstW > 1 ? x / (dstW - 1) : 0;
            const oneMinusU = 1 - u;

            const srcX = oneMinusU * oneMinusV * tl.x + u * oneMinusV * tr.x + u * v * br.x + oneMinusU * v * bl.x;
            const srcY = oneMinusU * oneMinusV * tl.y + u * oneMinusV * tr.y + u * v * br.y + oneMinusU * v * bl.y;

            const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcX)));
            const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcY)));
            const x1 = Math.min(srcW - 1, x0 + 1);
            const y1 = Math.min(srcH - 1, y0 + 1);

            const dx = srcX - x0;
            const dy = srcY - y0;
            const w00 = (1 - dx) * (1 - dy);
            const w10 = dx * (1 - dy);
            const w01 = (1 - dx) * dy;
            const w11 = dx * dy;

            const idx00 = (y0 * srcW + x0) * 4;
            const idx10 = (y0 * srcW + x1) * 4;
            const idx01 = (y1 * srcW + x0) * 4;
            const idx11 = (y1 * srcW + x1) * 4;

            const dstIdx = (y * dstW + x) * 4;
            dstData[dstIdx]     = srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11;
            dstData[dstIdx + 1] = srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11;
            dstData[dstIdx + 2] = srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11;
            dstData[dstIdx + 3] = 255;
        }
    }

    outCtx.putImageData(outImgData, 0, 0);
    return outCanvas.toDataURL('image/jpeg', 0.95);
}

/* Hàm tính ngưỡng Otsu tự động cho chế độ Đen Trắng */
function computeOtsuThreshold(histogram, totalPixels) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0, wB = 0, maxVariance = 0, threshold = 128;

    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        const wF = totalPixels - wB;
        if (wF === 0) break;

        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varianceBetween = wB * wF * (mB - mF) * (mB - mF);

        if (varianceBetween > maxVariance) {
            maxVariance = varianceBetween;
            threshold = t;
        }
    }
    return threshold;
}

/* [4] Điều chỉnh Brightness, Contrast & Chế độ màu (Original / Đen trắng tự chọn ngưỡng) */
async function adjustImage(imageDataUrl, options = {}) {
    const { brightness = 0, contrast = 0, colorMode = 'original' } = options;

    if (brightness === 0 && contrast === 0 && colorMode === 'original') {
        return imageDataUrl;
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            const isBW = colorMode === 'bw';
            const totalPixels = width * height;
            const lumArray = isBW ? new Float32Array(totalPixels) : null;
            const histogram = isBW ? new Uint32Array(256) : null;

            for (let i = 0, p = 0; i < data.length; i += 4, p++) {
                let r = factor * (data[i] + brightness - 128) + 128;
                let g = factor * (data[i + 1] + brightness - 128) + 128;
                let b = factor * (data[i + 2] + brightness - 128) + 128;

                r = Math.min(255, Math.max(0, r));
                g = Math.min(255, Math.max(0, g));
                b = Math.min(255, Math.max(0, b));

                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;

                if (isBW) {
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    lumArray[p] = lum;
                    histogram[Math.min(255, Math.max(0, Math.round(lum)))]++;
                }
            }

            if (isBW && lumArray) {
                const otsuT = computeOtsuThreshold(histogram, totalPixels);
                const integral = new Float64Array(totalPixels);

                for (let y = 0; y < height; y++) {
                    let rowSum = 0;
                    for (let x = 0; x < width; x++) {
                        const idx = y * width + x;
                        rowSum += lumArray[idx];
                        integral[idx] = (y > 0 ? integral[(y - 1) * width + x] : 0) + rowSum;
                    }
                }

                const radius = Math.max(14, Math.round(Math.min(width, height) / 30));
                const adaptiveSensitivity = otsuT > 165 ? 0.14 : (otsuT < 110 ? 0.20 : 0.16);
                const minContrastDiff = 10;

                for (let y = 0; y < height; y++) {
                    const y1 = Math.max(0, y - radius);
                    const y2 = Math.min(height - 1, y + radius);

                    for (let x = 0; x < width; x++) {
                        const x1 = Math.max(0, x - radius);
                        const x2 = Math.min(width - 1, x + radius);

                        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
                        let sum = integral[y2 * width + x2];
                        if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
                        if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
                        if (y1 > 0 && x1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];

                        const localMean = sum / count;
                        const pixelLum = lumArray[y * width + x];

                        const isDarkText =
                            (pixelLum < localMean * (1 - adaptiveSensitivity) && (localMean - pixelLum) > minContrastDiff) ||
                            (pixelLum < otsuT * 0.65 && pixelLum < localMean - 6);

                        const outVal = isDarkText ? 0 : 255;
                        const pIdx = (y * width + x) * 4;
                        data[pIdx] = outVal;
                        data[pIdx + 1] = outVal;
                        data[pIdx + 2] = outVal;
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.src = imageDataUrl;
    });
}

/* [5] OCR nhận diện chữ */
async function ocrImage(imageDataUrl, onProgress = null) {
    const result = await Tesseract.recognize(imageDataUrl, 'vie+eng', {
        logger: (m) => {
            if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
        }
    });
    return result.data.text.trim();
}

/* [6] Xử lý ảnh với OpenAI API */
async function ocrAIImage(imageDataUrl, apiKey = '', userPrompt = '') {
    const promptText = userPrompt || 'Làm sạch nền giấy, khử bóng râm và tăng độ sắc nét cho trang tài liệu này.';

    if (apiKey) {
        try {
            const blob = await (await fetch(imageDataUrl)).blob();
            const formData = new FormData();
            formData.append('model', 'gpt-image-1');
            formData.append('image', blob, 'document.png');
            formData.append('prompt', promptText);

            const response = await fetch('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                const b64 = data?.data?.[0]?.b64_json;
                if (b64) return `data:image/png;base64,${b64}`;
                const imgUrl = data?.data?.[0]?.url;
                if (imgUrl) {
                    const fetchedBlob = await (await fetch(imgUrl)).blob();
                    return await blobToDataUrl(fetchedBlob);
                }
            }
        } catch (_) {}

        const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                response_format: { type: 'json_object' },
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Yêu cầu: "${promptText}". Trả về JSON thông số tối ưu cho ảnh tài liệu: {"brightness": -50..50, "contrast": 0..80, "colorMode": "bw" hoặc "original"}.`
                        },
                        { type: 'image_url', image_url: { url: imageDataUrl } }
                    ]
                }]
            })
        });

        if (!visionRes.ok) {
            const err = await visionRes.json().catch(() => ({}));
            throw new Error(err?.error?.message || `HTTP ${visionRes.status}`);
        }

        const visionData = await visionRes.json();
        const params = JSON.parse(visionData.choices[0].message.content || '{}');
        return await adjustImage(imageDataUrl, {
            brightness: Number(params.brightness) || 10,
            contrast: Number(params.contrast) || 25,
            colorMode: params.colorMode === 'original' ? 'original' : 'bw'
        });
    }

    return await adjustImage(imageDataUrl, {
        brightness: 8,
        contrast: 20,
        colorMode: 'bw'
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

/* [7] Xuất mảng ảnh thành PDF theo cấu hình (khổ giấy, hướng trang, căn lề, chế độ vừa trang) */
async function convertImages2PDF(imageArray, config = {}) {
    const {
        fileName = 'document.pdf',
        format = 'a4',          // 'a4' | 'letter' | 'fit'
        orientation = 'p',      // 'p' | 'l' | 'auto'
        margin = 8,             // mm
        scaleMode = 'contain'   // 'contain' | 'fill'
    } = typeof config === 'string' ? { fileName: config } : config;

    const { jsPDF } = window.jspdf;
    let pdf = null;

    for (let i = 0; i < imageArray.length; i++) {
        const imgData = imageArray[i];
        const dim = await new Promise((res) => {
            const im = new Image();
            im.onload = () => res({ w: im.width, h: im.height });
            im.src = imgData;
        });

        const pageOrient = orientation === 'auto'
            ? (dim.w > dim.h ? 'l' : 'p')
            : orientation;

        if (format === 'fit') {
            const pxToMm = 0.264583;
            const customW = Math.max(20, dim.w * pxToMm + margin * 2);
            const customH = Math.max(20, dim.h * pxToMm + margin * 2);
            const fitOrient = customW > customH ? 'l' : 'p';

            if (i === 0) {
                pdf = new jsPDF({ orientation: fitOrient, unit: 'mm', format: [customW, customH] });
            } else {
                pdf.addPage([customW, customH], fitOrient);
            }
            pdf.addImage(imgData, 'JPEG', margin, margin, customW - margin * 2, customH - margin * 2);
        } else {
            if (i === 0) {
                pdf = new jsPDF({ orientation: pageOrient, unit: 'mm', format });
            } else {
                pdf.addPage(format, pageOrient);
            }

            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const availW = Math.max(10, pageW - margin * 2);
            const availH = Math.max(10, pageH - margin * 2);

            let w, h;
            if (scaleMode === 'fill') {
                w = availW;
                h = availH;
            } else {
                const ratio = Math.min(availW / dim.w, availH / dim.h);
                w = dim.w * ratio;
                h = dim.h * ratio;
            }

            const x = (pageW - w) / 2;
            const y = (pageH - h) / 2;
            pdf.addImage(imgData, 'JPEG', x, y, w, h);
        }
    }

    if (pdf) {
        const cleanName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
        pdf.save(cleanName);
    }
}