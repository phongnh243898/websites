const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];
const weekdayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const today = new Date();
const state = {
    year: today.getFullYear(),
    calendar: "solar",
    selectedDates: new Set(),
    events: JSON.parse(localStorage.getItem("batch-calendar-events") || "{}"),
    editingDate: null
};

const $ = (selector) => document.querySelector(selector);
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = (key) => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); };
const formatDate = (key) => parseDate(key).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

function lunarDate(date) {
    const [day, month] = convertSolarToLunar(date.getDate(), date.getMonth() + 1, date.getFullYear());
    return `${day}/${month}`;
}

function julianDay(day, month, year) {
    const value = Math.floor((14 - month) / 12);
    const y = year + 4800 - value;
    const m = month + 12 * value - 3;
    return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function newMoonDay(k) {
    const time = k / 1236.85;
    const radians = Math.PI / 180;
    let value = 2415020.75933 + 29.53058868 * k + 0.0001178 * time * time - 0.000000155 * time * time * time;
    value += 0.00033 * Math.sin((166.56 + 132.87 * time - 0.009173 * time * time) * radians);
    const meanAnomaly = (359.2242 + 29.1053567 * k - 0.0000333 * time * time) * radians;
    const sunAnomaly = (306.0253 + 385.816918 * k + 0.0107306 * time * time) * radians;
    const moonArgument = (21.2964 + 390.67050646 * k - 0.0016528 * time * time) * radians;
    const correction = (0.1734 - 0.000393 * time) * Math.sin(meanAnomaly)
        + 0.0021 * Math.sin(2 * meanAnomaly)
        - 0.4068 * Math.sin(sunAnomaly)
        + 0.0161 * Math.sin(2 * sunAnomaly)
        - 0.0004 * Math.sin(3 * sunAnomaly)
        + 0.0104 * Math.sin(2 * moonArgument)
        - 0.0051 * Math.sin(meanAnomaly + sunAnomaly)
        - 0.0074 * Math.sin(meanAnomaly - sunAnomaly)
        + 0.0004 * Math.sin(2 * moonArgument + meanAnomaly)
        - 0.0004 * Math.sin(2 * moonArgument - meanAnomaly)
        - 0.0006 * Math.sin(2 * moonArgument + sunAnomaly)
        + 0.001 * Math.sin(2 * moonArgument - sunAnomaly)
        + 0.0005 * Math.sin(2 * sunAnomaly + meanAnomaly);
    return Math.floor(value + correction - 0.5 - 7 / 24) + 1;
}

function sunLongitude(dayNumber) {
    const radians = Math.PI / 180;
    const time = (dayNumber - 2451545.5 - 7 / 24) / 36525;
    const value = (280.466 + 36000.77 * time) * radians;
    const anomaly = (357.529 + 35999.05 * time) * radians;
    return ((value + 1.914666 * Math.sin(anomaly) + 0.019994643 * Math.sin(2 * anomaly)) / Math.PI * 6) % 12;
}

function lunarMonth11(year) {
    const off = julianDay(31, 12, year) - 2415021;
    const k = Math.floor(off / 29.530588853);
    let monthStart = newMoonDay(k);
    if (sunLongitude(monthStart) >= 9) monthStart = newMoonDay(k - 1);
    return monthStart;
}

function leapMonthOffset(a11) {
    const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last = 0;
    let index = 1;
    let arc = sunLongitude(newMoonDay(k + index));
    do {
        last = arc;
        index += 1;
        arc = sunLongitude(newMoonDay(k + index));
    } while (arc !== last && index < 14);
    return index - 1;
}

function convertSolarToLunar(day, month, year) {
    const dayNumber = julianDay(day, month, year);
    const currentMonthStart = newMoonDay(Math.floor((dayNumber - 2415021.076998695) / 29.530588853 + 0.5));
    let monthStart = currentMonthStart;
    let lunarYear = year;
    let a11 = lunarMonth11(year);
    let b11 = a11;
    if (a11 >= dayNumber) {
        lunarYear -= 1;
        a11 = lunarMonth11(lunarYear);
    } else {
        b11 = lunarMonth11(lunarYear + 1);
    }
    const lunarDay = dayNumber - monthStart + 1;
    const diff = Math.floor((monthStart - a11) / 29);
    let lunarMonth = diff + 11;
    let leap = false;
    if (b11 - a11 > 365) {
        const leapMonthDiff = leapMonthOffset(a11);
        if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10;
            if (diff === leapMonthDiff) leap = true;
        }
    }
    if (lunarMonth > 12) lunarMonth -= 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear += 1;
    return [lunarDay, lunarMonth, leap, lunarYear];
}

function saveEvents() {
    localStorage.setItem("batch-calendar-events", JSON.stringify(state.events));
}

function renderYearOptions() {
    const select = $("#yearSelect");
    select.innerHTML = "";
    for (let year = today.getFullYear() - 10; year <= today.getFullYear() + 10; year += 1) {
        const option = new Option(year, year);
        option.selected = year === state.year;
        select.add(option);
    }
}

function renderCalendar() {
    $("#introYear").textContent = state.year;
    const grid = $("#monthsGrid");
    grid.innerHTML = "";
    for (let month = 0; month < 12; month += 1) {
        const card = document.createElement("section");
        card.className = "month-card";
        const firstDay = new Date(state.year, month, 1);
        const daysInMonth = new Date(state.year, month + 1, 0).getDate();
        const mondayOffset = (firstDay.getDay() + 6) % 7;
        card.innerHTML = `<div class="month-title"><strong>${monthNames[month]}</strong><span>${daysInMonth} ngày</span></div>
            <div class="weekday-row">${weekdayNames.map((day) => `<span class="weekday">${day}</span>`).join("")}</div>
            <div class="days-grid"></div>`;
        const daysGrid = card.querySelector(".days-grid");
        for (let index = 0; index < mondayOffset; index += 1) {
            const blank = document.createElement("span");
            blank.className = "day is-other-month";
            daysGrid.append(blank);
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(state.year, month, day);
            const key = dateKey(date);
            const dayButton = document.createElement("button");
            dayButton.type = "button";
            dayButton.className = "day";
            if (key === dateKey(today)) dayButton.classList.add("is-today");
            if (state.selectedDates.has(key)) dayButton.classList.add("is-selected");
            if (state.events[key]) dayButton.classList.add("has-event");
            dayButton.dataset.key = key;
            dayButton.title = state.events[key] ? `${state.events[key].title} - ${formatDate(key)}` : `Chọn ${formatDate(key)}`;
            const lunar = lunarDate(date);
            dayButton.innerHTML = state.calendar === "solar"
                ? `<span class="day-number">${day}</span><span class="lunar-number">${lunar}</span>`
                : `<span class="day-number">${lunar.split("/")[0]}</span><span class="lunar-number">${day}/${month + 1}</span>`;
            dayButton.addEventListener("click", () => toggleDate(key));
            daysGrid.append(dayButton);
        }
        grid.append(card);
    }
}

function toggleDate(key) {
    if (state.selectedDates.has(key)) state.selectedDates.delete(key);
    else state.selectedDates.add(key);
    state.editingDate = state.selectedDates.size === 1 ? [...state.selectedDates][0] : null;
    renderCalendar();
    renderSidebar();
}

function renderSidebar() {
    const selected = [...state.selectedDates].sort();
    $("#selectedCount").textContent = selected.length;
    $("#eventCount").textContent = Object.keys(state.events).filter((key) => parseDate(key).getFullYear() === state.year).length;
    $("#selectionHint").textContent = selected.length
        ? `${selected.length} ngày: ${selected.length <= 2 ? selected.map(formatDate).join(" và ") : `${formatDate(selected[0])} và ${selected.length - 1} ngày khác`}`
        : "Chọn ngày trên lịch để bắt đầu tạo lịch trình.";
    const existing = state.editingDate && state.events[state.editingDate];
    const selectedDate = state.editingDate || selected[0] || "";
    $("#eventTitle").value = existing?.title || "";
    $("#eventDate").value = existing?.date || selectedDate;
    $("#eventEndDate").value = existing?.endDate || existing?.date || selectedDate;
    $("#eventStart").value = existing?.start || "09:00";
    $("#eventEnd").value = existing?.end || "10:00";
    $("#eventLocation").value = existing?.location || "";
    $("#eventNotes").value = existing?.notes || "";
    $("#eventUrl").value = existing?.url || "";
    $("#deleteEventButton").disabled = !existing;
    $("#saveEventButton").textContent = existing ? "Lưu thay đổi" : "+ Thêm lịch";
    const events = Object.entries(state.events)
        .filter(([key]) => parseDate(key).getFullYear() === state.year)
        .sort(([a], [b]) => a.localeCompare(b));
    $("#eventList").innerHTML = events.length ? events.map(([key, event]) => `<button class="event-item${key === state.editingDate ? " is-active" : ""}" type="button" data-event-key="${key}">
        <strong>${escapeHtml(event.title)}</strong><span>${formatDate(key)}${event.endDate && event.endDate !== key ? ` → ${formatDate(event.endDate)}` : ""} · ${event.start} - ${event.end}</span>${event.location ? `<span>${escapeHtml(event.location)}</span>` : ""}
    </button>`).join("") : '<p class="empty-state">Chưa có lịch trình nào trong năm này.</p>';
    document.querySelectorAll("[data-event-key]").forEach((item) => item.addEventListener("click", () => {
        const key = item.dataset.eventKey;
        state.selectedDates = new Set([key]);
        state.editingDate = key;
        renderCalendar();
        renderSidebar();
    }));
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function createIcs(events) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PhongNH//Batch Calendar ICS//VI", "CALSCALE:GREGORIAN"];
    events.forEach(({ key, event }) => {
        const clean = (value = "") => value.replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
        const start = event.start.replace(":", "");
        const end = event.end.replace(":", "");
        const date = (event.date || key).replace(/-/g, "");
        const endDate = (event.endDate || event.date || key).replace(/-/g, "");
        lines.push("BEGIN:VEVENT", `UID:${key}-${start}@phongnh`, `DTSTAMP:${date}T${start}00`, `DTSTART:${date}T${start}00`, `DTEND:${date}T${end}00`, `SUMMARY:${clean(event.title)}`);
        if (endDate !== date) lines[lines.length - 1] = `DTEND:${endDate}T${end}00`;
        if (event.location) lines.push(`LOCATION:${clean(event.location)}`);
        if (event.notes) lines.push(`DESCRIPTION:${clean(event.notes)}`);
        if (event.url) lines.push(`URL:${clean(event.url)}`);
        lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
}

function downloadIcs(events, filename) {
    if (!events.length) {
        showToast("Chưa có lịch trình để xuất.");
        return;
    }
    const blob = new Blob([createIcs(events)], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`Đã xuất ${events.length} lịch trình.`);
}

$("#yearSelect").addEventListener("change", (event) => {
    state.year = Number(event.target.value);
    state.selectedDates.clear();
    state.editingDate = null;
    renderCalendar();
    renderSidebar();
});
document.querySelectorAll("[data-calendar]").forEach((button) => button.addEventListener("click", () => {
    state.calendar = button.dataset.calendar;
    document.querySelectorAll("[data-calendar]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderCalendar();
    showToast(state.calendar === "solar" ? "Đang xem Dương lịch." : "Đang xem Âm lịch.");
}));
$("#todayButton").addEventListener("click", () => {
    state.year = today.getFullYear();
    $("#yearSelect").value = state.year;
    state.selectedDates = new Set([dateKey(today)]);
    state.editingDate = state.events[dateKey(today)] ? dateKey(today) : null;
    renderCalendar();
    renderSidebar();
});
$("#clearFormButton").addEventListener("click", () => {
    state.selectedDates.clear();
    state.editingDate = null;
    renderCalendar();
    renderSidebar();
});
$("#eventForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const details = {
        title: $("#eventTitle").value.trim(),
        date: $("#eventDate").value,
        endDate: $("#eventEndDate").value || $("#eventDate").value,
        start: $("#eventStart").value,
        end: $("#eventEnd").value,
        location: $("#eventLocation").value.trim(),
        notes: $("#eventNotes").value.trim(),
        url: $("#eventUrl").value.trim()
    };
    if (!details.date) {
        showToast("Hãy chọn ngày bắt đầu.");
        return;
    }
    if (details.endDate < details.date) {
        showToast("Ngày kết thúc cần sau ngày bắt đầu.");
        return;
    }
    if (details.end <= details.start && details.endDate === details.date) {
        showToast("Giờ kết thúc cần sau giờ bắt đầu.");
        return;
    }
    const datesToSave = state.selectedDates.size ? [...state.selectedDates] : [details.date];
    datesToSave.forEach((key) => { state.events[key] = { ...details }; });
    saveEvents();
    state.selectedDates = new Set([details.date]);
    state.editingDate = details.date;
    renderCalendar();
    renderSidebar();
    showToast(`Đã lưu lịch trình cho ${state.selectedDates.size} ngày.`);
});
$("#deleteEventButton").addEventListener("click", () => {
    if (!state.editingDate) return;
    delete state.events[state.editingDate];
    saveEvents();
    renderCalendar();
    renderSidebar();
    showToast("Đã xóa lịch trình.");
});
$("#exportAllButton").addEventListener("click", () => {
    const events = Object.entries(state.events)
        .filter(([key]) => parseDate(key).getFullYear() === state.year)
        .map(([key, event]) => ({ key, event }));
    downloadIcs(events, `lich-${state.year}.ics`);
});

renderYearOptions();
renderCalendar();
renderSidebar();
