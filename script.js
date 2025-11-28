// --- CONFIGURATION ---
const APP_STORAGE_KEY = 'kt_monitor_v6_data';
const SETTINGS_STORAGE_KEY = 'kt_monitor_v6_settings';

// --- ICONS CONFIGURATION ---
const STAFF_ICONS = [
    { id: 'ambulance', icon: 'fa-truck-medical', label: 'รถพยาบาล', color: '#ef4444' },
    { id: 'motorcycle', icon: 'fa-motorcycle', label: 'จยย.กู้ชีพ', color: '#f59e0b' },
    { id: 'car', icon: 'fa-car-side', label: 'รถตรวจการณ์', color: '#3b82f6' },
    { id: 'tow', icon: 'fa-truck-pickup', label: 'รถยก/สไลด์', color: '#8b5cf6' },
    { id: 'fire', icon: 'fa-fire-extinguisher', label: 'ดับเพลิง', color: '#ef4444' },
    { id: 'user', icon: 'fa-user-shield', label: 'จนท.ทั่วไป', color: '#64748b' }
];

const ACCIDENT_ICONS = [
    { id: 'siren', icon: 'fa-bell', label: 'ไซเรน', color: '#dc2626' },
    { id: 'crash', icon: 'fa-car-burst', label: 'รถชน', color: '#dc2626' },
    { id: 'fire', icon: 'fa-fire', label: 'ไฟไหม้', color: '#f97316' },
    { id: 'medical', icon: 'fa-heart-pulse', label: 'เจ็บป่วย', color: '#ec4899' },
    { id: 'warning', icon: 'fa-triangle-exclamation', label: 'แจ้งเตือน', color: '#eab308' }
];

// Default Data (Used if LocalStorage is empty)
const DEFAULT_STAFF = [
    { id: 1, name: 'ทีม A (หลักสี่)', phone: '081-111-1111', lat: 13.8850, lng: 100.5740, area: 'หลักสี่', iconType: 'ambulance', image: null },
    { id: 2, name: 'ชุดเคลื่อนที่เร็ว 1', phone: '089-222-2222', lat: 13.8400, lng: 100.5500, area: 'จตุจักร', iconType: 'motorcycle', image: null },
    { id: 3, name: 'จุดจอดบางนา', phone: '085-333-3333', lat: 13.6680, lng: 100.6200, area: 'บางนา', iconType: 'car', image: null }
];

// --- STATE MANAGEMENT ---
let state = {
    staffList: [],
    settings: {
        accidentIconType: 'siren'
    },
    isAdminAuthenticated: false,
    activeTab: 'dashboard',
    accidentLocation: null,
    searchHistory: [],
    isSidebarOpen: true,
    tempMarkerData: null,
    selectedStaffId: null,
    tempSelectedStaffIcon: 'ambulance' // For Modal
};

// Map Objects
let mapInstance = null;
let tileLayer = null;
let markers = [];
let routeLayers = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadData(); // Load persistence data
    initMap();
    setupEventListeners();
    renderUI();
});

// --- DATA PERSISTENCE (LOCAL STORAGE) ---
// *Note: In a real Netlify + Neon setup, these functions would be fetch() calls to your API endpoints.
// Example: await fetch('/api/staff', { method: 'POST', body: JSON.stringify(data) });

function loadData() {
    // 1. Staff Data
    const storedData = localStorage.getItem(APP_STORAGE_KEY);
    if (storedData) {
        state.staffList = JSON.parse(storedData);
    } else {
        state.staffList = [...DEFAULT_STAFF];
        saveData(); // Save defaults
    }

    // 2. Settings
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedSettings) {
        state.settings = { ...state.settings, ...JSON.parse(storedSettings) };
    }

    // 3. Search History
    const history = localStorage.getItem('kt_search_history');
    if (history) state.searchHistory = JSON.parse(history);
}

function saveData() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state.staffList));
}

function saveSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
}

window.resetSystemData = () => {
    if(confirm('คุณต้องการลบข้อมูลพนักงานและการตั้งค่าทั้งหมดและเริ่มใหม่หรือไม่?')) {
        localStorage.removeItem(APP_STORAGE_KEY);
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
        location.reload();
    }
}

// --- MAP LOGIC ---
function initMap() {
    mapInstance = L.map('map-container', { zoomControl: false }).setView([13.7563, 100.5018], 11);
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

    tileLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(mapInstance);

    mapInstance.on('click', (e) => handleMapClick(e.latlng));
    
    // Initial render
    updateMapMarkers();
}

function handleMapClick(latlng) {
    if (state.activeTab === 'dashboard') {
        state.accidentLocation = latlng;
        state.selectedStaffId = null; 
        renderDashboard();
        updateMapMarkers();
        mapInstance.flyTo([latlng.lat, latlng.lng], 15, { duration: 1.0 });
        
        // Open sidebar if closed
        if(!state.isSidebarOpen) {
            state.isSidebarOpen = true;
            renderUI();
        }
    } else if (state.activeTab === 'admin' && state.isAdminAuthenticated && !document.getElementById('modal-staff').classList.contains('hidden')) {
        updateModalCoords(latlng.lat, latlng.lng, 'เลือกจากแผนที่');
    }
}

// --- MARKER SYSTEM ---
function updateMapMarkers() {
    // Clear old layers
    markers.forEach(m => mapInstance.removeLayer(m));
    routeLayers.forEach(l => mapInstance.removeLayer(l));
    markers = [];
    routeLayers = [];

    // 1. Render Staff Markers
    state.staffList.forEach(staff => {
        const isSelected = state.selectedStaffId === staff.id;
        const iconDef = STAFF_ICONS.find(i => i.id === staff.iconType) || STAFF_ICONS[0];
        
        const customIcon = L.divIcon({
            className: 'custom-map-icon',
            html: `
                <div class="relative w-10 h-10 transition-transform ${isSelected ? 'scale-125 z-50' : 'hover:scale-110 z-10'}">
                    <div class="absolute inset-0 bg-white rounded-full shadow-md flex items-center justify-center border-2" style="border-color: ${iconDef.color}">
                        <i class="fa-solid ${iconDef.icon}" style="color: ${iconDef.color}; font-size: 16px;"></i>
                    </div>
                    ${isSelected ? '<div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-600 rounded-full animate-ping"></div>' : ''}
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20], // Center
            popupAnchor: [0, -25]
        });

        const m = L.marker([staff.lat, staff.lng], { icon: customIcon })
            .bindPopup(createPopupContent(staff, iconDef));
        m.addTo(mapInstance);
        markers.push(m);
    });

    // 2. Render Accident Marker
    if (state.accidentLocation) {
        const iconDef = ACCIDENT_ICONS.find(i => i.id === state.settings.accidentIconType) || ACCIDENT_ICONS[0];
        
        const flashIcon = L.divIcon({
            className: 'custom-flash-icon',
            html: `
                <div class="relative w-12 h-12">
                    <div class="absolute inset-0 rounded-full animate-ping opacity-75" style="background-color: ${iconDef.color}"></div>
                    <div class="absolute inset-2 bg-white rounded-full shadow-lg flex items-center justify-center border-2" style="border-color: ${iconDef.color}">
                        <i class="fa-solid ${iconDef.icon} animate-pulse" style="color: ${iconDef.color}; font-size: 20px;"></i>
                    </div>
                </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });

        const acc = L.marker([state.accidentLocation.lat, state.accidentLocation.lng], { icon: flashIcon })
            .bindPopup(`<b style="color:${iconDef.color}">🚨 จุดเกิดเหตุ (${iconDef.label})</b>`).openPopup();
        acc.addTo(mapInstance);
        markers.push(acc);
        
        drawRoute();
    }

    // 3. Temp Marker (Admin)
    if (state.tempMarkerData) {
        const tempIcon = L.divIcon({
            html: `<div class="w-4 h-4 bg-slate-800 rounded-full border-2 border-white shadow-lg animate-bounce"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 16]
        });
        const t = L.marker([state.tempMarkerData.lat, state.tempMarkerData.lng], { icon: tempIcon }).addTo(mapInstance);
        markers.push(t);
    }
}

function drawRoute() {
    if (!state.accidentLocation) return;
    
    // Sort staff by distance
    const staffWithDist = state.staffList.map(s => ({
        ...s,
        dist: getDistance(state.accidentLocation, {lat: s.lat, lng: s.lng})
    })).sort((a,b) => a.dist - b.dist);

    const target = state.selectedStaffId 
        ? staffWithDist.find(s => s.id === state.selectedStaffId) 
        : staffWithDist[0];

    if (target) {
        const latlngs = [[target.lat, target.lng], [state.accidentLocation.lat, state.accidentLocation.lng]];
        const line1 = L.polyline(latlngs, { color: '#1e3a8a', weight: 6, opacity: 0.3 }).addTo(mapInstance);
        const line2 = L.polyline(latlngs, { color: '#3b82f6', weight: 4, dashArray: '10, 20', className: 'flowing-dash' }).addTo(mapInstance);
        routeLayers.push(line1, line2);
    }
}

// --- DOM & RENDERING ---
function renderUI() {
    // 1. Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    if (state.isSidebarOpen) sidebar.classList.remove('-translate-x-[120%]');
    else sidebar.classList.add('-translate-x-[120%]');

    // 2. Tabs Logic
    const tabs = ['dashboard', 'admin', 'settings'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const view = document.getElementById(`view-${t}`);
        
        if (state.activeTab === t) {
            btn.className = "flex-1 py-3 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors";
            // Update icon color for Settings tab specially
            if(t === 'settings') btn.innerHTML = `<i data-lucide="settings-2" class="w-4 h-4 mx-auto text-blue-600"></i>`;
            
            view.classList.remove('hidden');
        } else {
            btn.className = "flex-1 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors";
            if(t === 'settings') btn.innerHTML = `<i data-lucide="settings" class="w-4 h-4 mx-auto"></i>`;
            
            view.classList.add('hidden');
        }
    });

    // 3. Render Views
    if (state.activeTab === 'dashboard') renderDashboard();
    else if (state.activeTab === 'admin') renderAdmin();
    else if (state.activeTab === 'settings') renderSettings();

    lucide.createIcons();
}

function renderDashboard() {
    const emptyState = document.getElementById('dashboard-empty-state');
    const activeState = document.getElementById('dashboard-active-state');
    const listContainer = document.getElementById('nearby-staff-list');
    const coordsDisplay = document.getElementById('incident-coords-display');

    if (!state.accidentLocation) {
        emptyState.classList.remove('hidden');
        activeState.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    activeState.classList.remove('hidden');
    coordsDisplay.textContent = `${state.accidentLocation.lat.toFixed(4)}, ${state.accidentLocation.lng.toFixed(4)}`;

    // Calculate & Render List
    const nearby = state.staffList.map(s => {
        const dist = getDistance(state.accidentLocation, {lat: s.lat, lng: s.lng});
        return { ...s, dist: dist, time: (dist/40)*60 }; // Avg speed 40km/h
    }).sort((a,b) => a.dist - b.dist);

    listContainer.innerHTML = nearby.map((s, idx) => {
        const iconDef = STAFF_ICONS.find(i => i.id === s.iconType) || STAFF_ICONS[0];
        const isSelected = state.selectedStaffId === s.id;

        return `
        <div onclick="selectStaff(${s.id})" class="group p-3 rounded-lg border flex justify-between items-center transition-all cursor-pointer ${isSelected ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-md' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'}">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center border border-slate-100 shadow-sm" style="background-color: ${isSelected ? '#eff6ff' : '#f8fafc'}">
                    <i class="fa-solid ${iconDef.icon}" style="color: ${iconDef.color}; font-size: 18px;"></i>
                </div>
                <div>
                    <div class="font-bold text-sm ${isSelected ? 'text-blue-700' : 'text-slate-800'}">${idx+1}. ${s.name}</div>
                    <div class="text-[10px] text-slate-500 flex items-center gap-1">
                        <i data-lucide="phone" class="w-3 h-3"></i> ${s.phone}
                    </div>
                </div>
            </div>
            <div class="text-right">
                <div class="text-sm font-black text-slate-700">${s.dist.toFixed(1)} <span class="text-[10px] font-normal text-slate-500">กม.</span></div>
                <div class="text-[10px] font-bold text-orange-500">~${Math.ceil(s.time)} นาที</div>
            </div>
        </div>
    `}).join('');
    
    lucide.createIcons();
}

function renderAdmin() {
    const loginView = document.getElementById('admin-login-view');
    const panelView = document.getElementById('admin-panel-view');

    if (!state.isAdminAuthenticated) {
        loginView.classList.remove('hidden');
        panelView.classList.add('hidden');
    } else {
        loginView.classList.add('hidden');
        panelView.classList.remove('hidden');
        renderAdminList();
    }
}

function renderAdminList() {
    const container = document.getElementById('admin-staff-list');
    const filter = document.getElementById('filter-staff').value.toLowerCase();
    
    const filtered = state.staffList.filter(s => s.name.toLowerCase().includes(filter));

    container.innerHTML = filtered.map(s => {
        const iconDef = STAFF_ICONS.find(i => i.id === s.iconType) || STAFF_ICONS[0];
        return `
        <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center hover:border-slate-300 transition-colors">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                     <i class="fa-solid ${iconDef.icon}" style="color: ${iconDef.color};"></i>
                </div>
                <div>
                    <div class="font-bold text-sm text-slate-800">${s.name}</div>
                    <div class="text-xs text-slate-500">${s.phone}</div>
                </div>
            </div>
            <div class="flex gap-1">
                <button onclick="editStaff(${s.id})" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                <button onclick="deleteStaff(${s.id})" class="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>
    `}).join('');
    lucide.createIcons();
}

function renderSettings() {
    const container = document.getElementById('accident-icon-selector');
    container.innerHTML = ACCIDENT_ICONS.map(icon => {
        const isActive = state.settings.accidentIconType === icon.id;
        return `
            <div onclick="setAccidentIcon('${icon.id}')" 
                class="cursor-pointer rounded-lg border-2 p-2 flex flex-col items-center gap-1 transition-all
                ${isActive ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-blue-200'}">
                <i class="fa-solid ${icon.icon}" style="color: ${icon.color}; font-size: 20px;"></i>
                <span class="text-[10px] text-slate-600">${icon.label}</span>
            </div>
        `;
    }).join('');
}

// --- ACTIONS & HANDLERS ---
function setupEventListeners() {
    // Tabs
    ['dashboard', 'admin', 'settings'].forEach(t => {
        document.getElementById(`tab-${t}`).onclick = () => { state.activeTab = t; renderUI(); };
    });
    
    // Sidebar
    document.getElementById('btn-toggle-sidebar').onclick = () => { state.isSidebarOpen = !state.isSidebarOpen; renderUI(); };

    // Login
    document.getElementById('form-login').onsubmit = (e) => {
        e.preventDefault();
        const pin = document.getElementById('input-pin').value;
        if (pin === '210406') {
            state.isAdminAuthenticated = true;
            document.getElementById('input-pin').value = '';
            document.getElementById('login-error').classList.add('hidden');
            renderUI();
        } else {
            document.getElementById('login-error').textContent = 'รหัสผ่านไม่ถูกต้อง';
            document.getElementById('login-error').classList.remove('hidden');
        }
    };
    document.getElementById('btn-logout').onclick = () => { state.isAdminAuthenticated = false; renderUI(); };

    // CRUD Modal
    document.getElementById('btn-open-add-modal').onclick = () => openModal();
    document.getElementById('btn-close-modal').onclick = () => closeModal();
    document.getElementById('input-image').onchange = handleImageUpload;
    document.getElementById('btn-save-staff').onclick = handleSaveStaff;
    
    // Location Search
    document.getElementById('btn-find-coords').onclick = handleStaffLocationSearch;
    document.getElementById('input-coords').onkeypress = (e) => { if(e.key === 'Enter') handleStaffLocationSearch(); };

    // Dashboard Actions
    document.getElementById('btn-clear-incident').onclick = () => {
        state.accidentLocation = null;
        state.selectedStaffId = null;
        updateMapMarkers();
        renderDashboard();
    };

    // Filter
    document.getElementById('filter-staff').oninput = renderAdminList;

    // Map Types
    document.getElementById('btn-map-roadmap').onclick = () => switchMap('m');
    document.getElementById('btn-map-satellite').onclick = () => switchMap('y');

    // Search
    setupSearch();
}

function openModal(staff = null) {
    const modal = document.getElementById('modal-staff');
    const title = document.getElementById('modal-title');
    const imgPreview = document.getElementById('preview-image');
    
    // Reset Fields
    document.getElementById('input-id').value = staff ? staff.id : '';
    document.getElementById('input-name').value = staff ? staff.name : '';
    document.getElementById('input-phone').value = staff ? staff.phone : '';
    document.getElementById('input-coords').value = '';
    document.getElementById('location-status').textContent = '';
    
    // Image
    if (staff && staff.image) {
        imgPreview.src = staff.image;
        imgPreview.classList.remove('hidden');
        document.getElementById('placeholder-image').classList.add('hidden');
    } else {
        imgPreview.src = '';
        imgPreview.classList.add('hidden');
        document.getElementById('placeholder-image').classList.remove('hidden');
    }

    // Icon Selector
    state.tempSelectedStaffIcon = staff ? staff.iconType : 'ambulance';
    renderStaffIconSelector();

    // Location
    if (staff) {
        title.innerHTML = '<i data-lucide="edit" class="w-4 h-4"></i> แก้ไขพนักงาน';
        updateModalCoords(staff.lat, staff.lng, 'ตำแหน่งปัจจุบัน');
    } else {
        title.innerHTML = '<i data-lucide="user-plus" class="w-4 h-4"></i> เพิ่มพนักงาน';
        state.tempMarkerData = null;
        document.getElementById('coords-display').textContent = 'ยังไม่ได้ระบุตำแหน่ง';
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
}

function renderStaffIconSelector() {
    const container = document.getElementById('staff-icon-selector');
    container.innerHTML = STAFF_ICONS.map(icon => {
        const isSelected = state.tempSelectedStaffIcon === icon.id;
        return `
            <div onclick="state.tempSelectedStaffIcon = '${icon.id}'; renderStaffIconSelector();" 
                class="cursor-pointer rounded border p-2 flex flex-col items-center justify-center gap-1 transition-all aspect-square
                ${isSelected ? 'bg-blue-600 border-blue-600 text-white shadow-md transform scale-105' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-blue-300'}">
                <i class="fa-solid ${icon.icon} text-lg"></i>
                <span class="text-[9px] font-bold text-center leading-none mt-1">${icon.label}</span>
            </div>
        `;
    }).join('');
}

function closeModal() {
    document.getElementById('modal-staff').classList.add('hidden');
    state.tempMarkerData = null;
    updateMapMarkers(); // Refresh to remove temp marker
}

function updateModalCoords(lat, lng, sourceText) {
    state.tempMarkerData = { lat, lng };
    document.getElementById('coords-display').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const statusEl = document.getElementById('location-status');
    statusEl.innerHTML = `<span class="text-green-600 flex items-center gap-1 font-bold"><i data-lucide="check-circle" class="w-3 h-3"></i> ${sourceText}</span>`;
    lucide.createIcons();
    updateMapMarkers(); // Show temp marker
}

function handleSaveStaff() {
    const id = document.getElementById('input-id').value;
    const name = document.getElementById('input-name').value;
    const phone = document.getElementById('input-phone').value;
    const image = document.getElementById('preview-image').src;
    
    if (!name || !phone) return alert('กรุณากรอกชื่อและเบอร์โทร');
    if (!state.tempMarkerData) return alert('กรุณาระบุตำแหน่ง');

    const staffData = {
        id: id ? parseInt(id) : Date.now(),
        name,
        phone,
        lat: state.tempMarkerData.lat,
        lng: state.tempMarkerData.lng,
        image: image.includes('data:image') ? image : null,
        iconType: state.tempSelectedStaffIcon,
        area: 'Update'
    };

    if (id) {
        const idx = state.staffList.findIndex(s => s.id == id);
        if(idx !== -1) state.staffList[idx] = staffData;
    } else {
        state.staffList.push(staffData);
    }

    saveData(); // Save to LocalStorage
    closeModal();
    renderAdminList();
    updateMapMarkers();
}

window.selectStaff = (id) => {
    state.selectedStaffId = id;
    renderDashboard();
    updateMapMarkers();
};

window.editStaff = (id) => {
    const staff = state.staffList.find(s => s.id === id);
    if(staff) openModal(staff);
};

window.deleteStaff = (id) => {
    if(!confirm('ยืนยันลบพนักงาน?')) return;
    state.staffList = state.staffList.filter(s => s.id !== id);
    saveData();
    renderAdminList();
    updateMapMarkers();
};

window.setAccidentIcon = (type) => {
    state.settings.accidentIconType = type;
    saveSettings();
    renderSettings();
    updateMapMarkers(); // Update live if marker exists
};

// Utils: Location Search
async function handleStaffLocationSearch() {
    const input = document.getElementById('input-coords').value.trim();
    if (!input) return;

    // 1. Raw Lat/Lng
    const rawCoords = input.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (rawCoords) return updateModalCoords(parseFloat(rawCoords[1]), parseFloat(rawCoords[3]), 'พิกัด');

    // 2. Google Maps Link Patterns
    const linkMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || input.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (linkMatch) return updateModalCoords(parseFloat(linkMatch[1]), parseFloat(linkMatch[2]), 'Google Maps');

    // 3. Nominatim Geocoding
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input + ' Thailand')}&format=json&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) updateModalCoords(parseFloat(data[0].lat), parseFloat(data[0].lon), 'ชื่อสถานที่');
        else alert('ไม่พบสถานที่');
    } catch(e) { alert('Error connecting to map service'); }
}

// Utils: Map Helper
function createPopupContent(staff, iconDef) {
    return `
        <div class="font-sans text-center min-w-[160px]">
            ${staff.image ? `<img src="${staff.image}" class="w-full h-24 object-cover rounded mb-2">` : ''}
            <div class="flex items-center justify-center gap-2 mb-1">
                <i class="fa-solid ${iconDef.icon}" style="color:${iconDef.color}"></i>
                <span class="font-bold text-slate-800">${staff.name}</span>
            </div>
            <a href="tel:${staff.phone}" class="block bg-blue-600 text-white text-xs py-1 px-2 rounded mt-2 no-underline">
                📞 ${staff.phone}
            </a>
        </div>
    `;
}

function getDistance(pos1, pos2) {
    const R = 6371; 
    const dLat = (pos2.lat-pos1.lat) * (Math.PI/180);
    const dLon = (pos2.lng-pos1.lng) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(pos1.lat*(Math.PI/180)) * Math.cos(pos2.lat*(Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return (R * c) * 1.35; // Adjust for road factor
}

function switchMap(typeCode) {
    mapInstance.removeLayer(tileLayer);
    tileLayer = L.tileLayer(`http://{s}.google.com/vt/lyrs=${typeCode}&x={x}&y={y}&z={z}`, {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(mapInstance);
}

// Search Feature
function setupSearch() {
    const input = document.getElementById('search-input');
    const container = document.getElementById('search-suggestions');
    let timeout;

    input.oninput = (e) => {
        clearTimeout(timeout);
        if(!e.target.value) return container.classList.add('hidden');
        timeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(e.target.value + ' Thailand')}&format=json&limit=5`);
                const data = await res.json();
                container.innerHTML = data.map(i => `
                    <div onclick="handleMapClick({lat:${i.lat}, lng:${i.lon}}); document.getElementById('search-suggestions').classList.add('hidden');" 
                        class="p-3 border-b hover:bg-slate-50 cursor-pointer text-sm">
                        ${i.display_name}
                    </div>
                `).join('');
                container.classList.remove('hidden');
            } catch(e){}
        }, 500);
    };
}