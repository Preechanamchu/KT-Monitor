// --- DATA & STATE ---
const INITIAL_STAFF = [
    { id: 1, name: 'สมชาย ใจดี', phone: '081-111-1111', lat: 13.7563, lng: 100.5018, area: 'พระนคร', status: 'ready', image: null },
    { id: 2, name: 'วิชัย รวดเร็ว', phone: '089-222-2222', lat: 13.6900, lng: 100.6000, area: 'บางนา', status: 'busy', image: null },
    { id: 3, name: 'อำนาจ ประหยัด', phone: '085-333-3333', lat: 13.8000, lng: 100.5500, area: 'จตุจักร', status: 'ready', image: null },
    { id: 4, name: 'ก้องเกียรติ พารวย', phone: '090-444-4444', lat: 13.9000, lng: 100.4500, area: 'นนทบุรี', status: 'ready', image: null },
    { id: 5, name: 'มานะ อดทน', phone: '088-555-5555', lat: 13.6500, lng: 100.4000, area: 'บางขุนเทียน', status: 'ready', image: null }
];

let state = {
    staffList: [],
    isAdminAuthenticated: false,
    activeTab: 'dashboard',
    accidentLocation: null,
    searchQuery: '',
    mapType: 'roadmap',
    isSidebarOpen: true,
    isUsingMock: false,
    tempMarkerData: null,
    selectedStaffId: null,
    searchHistory: [] // New: History State
};

// Map Objects
let mapInstance = null;
let tileLayer = null;
let markers = [];
let routeLayers = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initMap();
    fetchStaff();
    loadSearchHistory(); // Load history from LocalStorage
    setupEventListeners();
    renderUI();
});

// --- API FUNCTIONS ---
async function fetchStaff() {
    try {
        const res = await fetch('/api/staff');
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        // Parse numbers
        state.staffList = data.map(s => ({...s, lat: parseFloat(s.lat), lng: parseFloat(s.lng)}));
        state.isUsingMock = false;
    } catch (err) {
        console.warn('Using Mock Data');
        state.staffList = [...INITIAL_STAFF];
        state.isUsingMock = true;
    }
    updateAppVersionText();
    renderStaffLists();
    updateMapMarkers();
}

async function loginAdmin(pin) {
    try {
        const res = await fetch('/api/login', {
            method: 'POST', 
            body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if(data.success) return true;
        throw new Error('Invalid PIN');
    } catch (err) {
        // Mock fallback
        if (pin === '210406') return true;
        return false;
    }
}

// --- SEARCH HISTORY LOGIC (New Feature) ---
function loadSearchHistory() {
    const history = localStorage.getItem('kt_search_history');
    if (history) {
        state.searchHistory = JSON.parse(history);
    }
}

function saveToSearchHistory(item) {
    // Avoid duplicates
    const exists = state.searchHistory.find(h => h.lat === item.lat && h.lon === item.lon);
    if (!exists) {
        // Add to top, keep max 5
        state.searchHistory.unshift(item);
        if (state.searchHistory.length > 5) state.searchHistory.pop();
        localStorage.setItem('kt_search_history', JSON.stringify(state.searchHistory));
    }
}

function clearSearchHistory() {
    state.searchHistory = [];
    localStorage.removeItem('kt_search_history');
    renderSearchSuggestions([], true); // Render empty state
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
}

function handleMapClick(latlng) {
    if (state.activeTab === 'dashboard') {
        state.accidentLocation = latlng;
        state.selectedStaffId = null; // Reset selection
        renderDashboard();
        updateMapMarkers();
        mapInstance.flyTo([latlng.lat, latlng.lng], 15, { duration: 1.5 });
        
        // Open sidebar if closed
        state.isSidebarOpen = true;
        renderUI();
    } else if (state.activeTab === 'admin' && state.isAdminAuthenticated && !document.getElementById('modal-staff').classList.contains('hidden')) {
        // Admin picking location mode
        updateModalCoords(latlng.lat, latlng.lng, 'เลือกจากแผนที่');
    }
}

function updateMapMarkers() {
    // Clear existing
    markers.forEach(m => mapInstance.removeLayer(m));
    routeLayers.forEach(l => mapInstance.removeLayer(l));
    markers = [];
    routeLayers = [];

    // Icons
    const iconBlue = createLeafletIcon('blue');
    const iconGreen = createLeafletIcon('green');
    const iconGold = createLeafletIcon('gold');
    const iconFlash = createFlashIcon();

    // Staff Markers
    state.staffList.forEach(staff => {
        const isSelected = state.selectedStaffId === staff.id;
        const m = L.marker([staff.lat, staff.lng], { icon: isSelected ? iconGreen : iconBlue })
            .bindPopup(createPopupContent(staff));
        m.addTo(mapInstance);
        markers.push(m);
    });

    // Accident Marker
    if (state.accidentLocation) {
        const acc = L.marker([state.accidentLocation.lat, state.accidentLocation.lng], { icon: iconFlash })
            .bindPopup('<b style="color:red">🚨 จุดเกิดเหตุ</b>').openPopup();
        acc.addTo(mapInstance);
        markers.push(acc);
        
        drawRoute();
    }

    // Temp Marker (Admin)
    if (state.tempMarkerData) {
        const t = L.marker([state.tempMarkerData.lat, state.tempMarkerData.lng], { icon: iconGold }).addTo(mapInstance);
        markers.push(t);
        // Center map on temp marker if it exists
        mapInstance.setView([state.tempMarkerData.lat, state.tempMarkerData.lng], 15);
    }
}

function drawRoute() {
    if (!state.accidentLocation) return;
    
    // Calculate distances to find route
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
        const line2 = L.polyline(latlngs, { color: '#3b82f6', weight: 4, dashArray: '15, 15', className: 'flowing-dash' }).addTo(mapInstance);
        routeLayers.push(line1, line2);
    }
}

// --- DOM RENDERING ---
function renderUI() {
    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    if (state.isSidebarOpen) sidebar.classList.remove('-translate-x-[120%]');
    else sidebar.classList.add('-translate-x-[120%]');

    // Tabs
    const tabDash = document.getElementById('tab-dashboard');
    const tabAdmin = document.getElementById('tab-admin');
    const viewDash = document.getElementById('view-dashboard');
    const viewAdmin = document.getElementById('view-admin');

    if (state.activeTab === 'dashboard') {
        tabDash.className = "flex-1 py-3 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors";
        tabAdmin.className = "flex-1 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors";
        viewDash.classList.remove('hidden');
        viewAdmin.classList.add('hidden');
        renderDashboard();
    } else {
        tabDash.className = "flex-1 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors";
        tabAdmin.className = "flex-1 py-3 text-sm font-medium text-blue-600 border-b-2 border-blue-600 transition-colors";
        viewDash.classList.add('hidden');
        viewAdmin.classList.remove('hidden');
        renderAdmin();
    }
}

function renderDashboard() {
    const emptyState = document.getElementById('dashboard-empty-state');
    const activeState = document.getElementById('dashboard-active-state');
    const listContainer = document.getElementById('nearby-staff-list');

    if (!state.accidentLocation) {
        emptyState.classList.remove('hidden');
        activeState.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    activeState.classList.remove('hidden');

    // Calculate distances
    const nearby = state.staffList.map(s => {
        const dist = getDistance(state.accidentLocation, {lat: s.lat, lng: s.lng});
        return { ...s, dist: dist, time: (dist/30)*60 };
    }).sort((a,b) => a.dist - b.dist).slice(0, 10);

    listContainer.innerHTML = nearby.map((s, idx) => `
        <div onclick="selectStaff(${s.id})" class="p-3 rounded-lg border flex justify-between items-center transition-all cursor-pointer hover:bg-blue-50 ${state.selectedStaffId === s.id ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300' : 'bg-white border-slate-200'}">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden border-2 ${state.selectedStaffId === s.id ? 'border-blue-500' : 'border-slate-200'}">
                    ${s.image ? `<img src="${s.image}" class="w-full h-full object-cover">` : '<div class="w-full h-full bg-slate-100 flex items-center justify-center"><i data-lucide="users" class="w-6 h-6 text-slate-400"></i></div>'}
                </div>
                <div>
                    <div class="font-bold text-base ${state.selectedStaffId === s.id ? 'text-blue-700' : 'text-slate-800'}">${idx+1}. ${s.name}</div>
                    <div class="flex items-center gap-3 mt-1">
                        <span class="text-sm font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">📍 ${s.dist.toFixed(1)} กม.</span>
                        <span class="text-sm font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded flex items-center gap-1">⏱ ${s.time.toFixed(0)} นาที</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
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
        renderStaffLists(); // Ensure list is up to date
    }
}

function renderStaffLists() {
    const container = document.getElementById('admin-staff-list');
    container.innerHTML = state.staffList.map(s => `
        <div class="bg-white p-3 rounded border border-slate-200 shadow-sm flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                    ${s.image ? `<img src="${s.image}" class="w-full h-full object-cover">` : '<i data-lucide="users" class="w-5 h-5 text-slate-400 m-auto h-full pt-2"></i>'}
                </div>
                <div>
                    <div class="font-bold text-sm text-slate-800">${s.name}</div>
                    <div class="text-xs text-slate-500">${s.phone}</div>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="editStaff(${s.id})" class="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="deleteStaff(${s.id})" class="p-2 bg-red-100 rounded-lg text-red-600 hover:bg-red-200"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

// --- EVENT HANDLERS & HELPERS ---
function setupEventListeners() {
    // Tabs
    document.getElementById('tab-dashboard').onclick = () => { state.activeTab = 'dashboard'; renderUI(); };
    document.getElementById('tab-admin').onclick = () => { state.activeTab = 'admin'; renderUI(); };
    
    // Sidebar
    document.getElementById('btn-toggle-sidebar').onclick = () => { state.isSidebarOpen = !state.isSidebarOpen; renderUI(); };

    // Login
    document.getElementById('form-login').onsubmit = async (e) => {
        e.preventDefault();
        const pin = document.getElementById('input-pin').value;
        const success = await loginAdmin(pin);
        if (success) {
            state.isAdminAuthenticated = true;
            document.getElementById('input-pin').value = '';
            document.getElementById('login-error').classList.add('hidden');
            renderUI();
        } else {
            document.getElementById('login-error').textContent = 'รหัสผ่านไม่ถูกต้อง';
            document.getElementById('login-error').classList.remove('hidden');
        }
    };
    
    document.getElementById('btn-logout').onclick = () => {
        state.isAdminAuthenticated = false;
        state.activeTab = 'dashboard';
        renderUI();
    };

    // Modal & CRUD
    document.getElementById('btn-open-add-modal').onclick = () => openModal();
    document.getElementById('btn-close-modal').onclick = () => closeModal();
    document.getElementById('input-image').onchange = handleImageUpload;
    document.getElementById('btn-save-staff').onclick = handleSaveStaff;
    
    // ** New: Find Location Button **
    document.getElementById('btn-find-coords').onclick = handleStaffLocationSearch;
    
    // Input Enter key trigger search
    document.getElementById('input-coords').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') handleStaffLocationSearch();
    });

    // Dashboard Actions
    document.getElementById('btn-clear-incident').onclick = () => {
        state.accidentLocation = null;
        state.selectedStaffId = null;
        updateMapMarkers();
        renderDashboard();
    };

    // Map Types
    document.getElementById('btn-map-roadmap').onclick = () => switchMap('m');
    document.getElementById('btn-map-satellite').onclick = () => switchMap('y');

    // Search Logic (Updated for History)
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    
    searchInput.onfocus = () => {
        if (!searchInput.value.trim()) {
            renderSearchHistory(); // Show history immediately on focus if empty
        }
    };

    searchInput.oninput = (e) => {
        const val = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (!val) {
            renderSearchHistory(); // Show history if cleared
            return;
        }
        searchTimeout = setTimeout(() => doSearch(val), 800);
    };
    
    document.querySelector('#search-icon-container button').onclick = () => {
        searchInput.value = '';
        renderSearchHistory();
        state.accidentLocation = null;
        renderDashboard();
        updateMapMarkers();
    };
}

// Helper: Open Modal
function openModal(staff = null) {
    const modal = document.getElementById('modal-staff');
    const title = document.getElementById('modal-title');
    const imgPreview = document.getElementById('preview-image');
    const placeholder = document.getElementById('placeholder-image');
    
    // Reset form
    document.getElementById('input-id').value = staff ? staff.id : '';
    document.getElementById('input-name').value = staff ? staff.name : '';
    document.getElementById('input-phone').value = staff ? staff.phone : '';
    document.getElementById('input-coords').value = '';
    document.getElementById('location-status').textContent = '';
    
    if (staff && staff.image) {
        imgPreview.src = staff.image;
        imgPreview.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        imgPreview.src = '';
        imgPreview.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }

    if (staff) {
        title.textContent = 'แก้ไขพนักงาน';
        updateModalCoords(staff.lat, staff.lng, 'ตำแหน่งปัจจุบัน');
    } else {
        title.textContent = 'เพิ่มพนักงาน';
        state.tempMarkerData = null;
        document.getElementById('coords-display').textContent = 'ยังไม่ได้ระบุตำแหน่ง';
        document.getElementById('input-coords').value = '';
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-staff').classList.add('hidden');
    state.tempMarkerData = null;
    updateMapMarkers();
}

function updateModalCoords(lat, lng, sourceText = '') {
    state.tempMarkerData = { lat, lng };
    document.getElementById('coords-display').textContent = `พิกัด: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    
    // Show status success
    const statusEl = document.getElementById('location-status');
    statusEl.innerHTML = `<span class="text-green-600 flex items-center gap-1"><i data-lucide="check" class="w-3 h-3"></i> ${sourceText || 'พบตำแหน่ง'}</span>`;
    lucide.createIcons();
    
    updateMapMarkers();
}

// ** Logic ใหม่: ค้นหาตำแหน่งพนักงาน (Smart Parser) **
async function handleStaffLocationSearch() {
    const input = document.getElementById('input-coords').value.trim();
    const statusEl = document.getElementById('location-status');
    
    if (!input) {
        statusEl.innerHTML = '<span class="text-red-500">กรุณากรอกข้อมูล</span>';
        return;
    }

    statusEl.innerHTML = '<span class="text-blue-500 animate-pulse">กำลังค้นหา...</span>';

    // 1. Check Regex for raw Lat,Lng
    const rawCoords = parseCoordinates(input);
    if (rawCoords) {
        updateModalCoords(rawCoords.lat, rawCoords.lng, 'จากพิกัด');
        return;
    }

    // 2. Check for Google Maps Links (Smart Regex)
    // Supports: goo.gl, maps.app.goo.gl, google.com/maps/...
    // Since we can't unshorten links client-side easily without CORS proxy, 
    // we assume the user pastes the full URL or we try to extract coords if present in string.
    
    // Try to find @lat,lng pattern common in google maps URLs
    const googleMapRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const matchGM = input.match(googleMapRegex);
    if (matchGM) {
        updateModalCoords(parseFloat(matchGM[1]), parseFloat(matchGM[2]), 'จากลิงก์ Google Map');
        return;
    }
    
    // Try to find q=lat,lng pattern
    const googleMapQRegex = /q=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const matchGMQ = input.match(googleMapQRegex);
    if (matchGMQ) {
        updateModalCoords(parseFloat(matchGMQ[1]), parseFloat(matchGMQ[2]), 'จากลิงก์ Google Map');
        return;
    }

    // 3. If NOT coords/link, treat as Address Search (District/Province)
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input + ' Thailand')}&format=json&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
            updateModalCoords(parseFloat(data[0].lat), parseFloat(data[0].lon), 'จากชื่อสถานที่');
        } else {
            statusEl.innerHTML = '<span class="text-red-500">ไม่พบสถานที่นี้</span>';
        }
    } catch (e) {
        statusEl.innerHTML = '<span class="text-red-500">เกิดข้อผิดพลาด</span>';
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = document.getElementById('preview-image');
            img.src = reader.result;
            img.classList.remove('hidden');
            document.getElementById('placeholder-image').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

async function handleSaveStaff() {
    const id = document.getElementById('input-id').value;
    const name = document.getElementById('input-name').value;
    const phone = document.getElementById('input-phone').value;
    const image = document.getElementById('preview-image').src;
    
    if (!name || !phone) return alert('กรุณากรอกชื่อและเบอร์โทร');
    if (!state.tempMarkerData) return alert('กรุณาระบุตำแหน่ง (กดปุ่ม "ค้นหา" หรือเลือกบนแผนที่)');

    const newStaff = {
        id: id ? parseInt(id) : Date.now(),
        name,
        phone,
        lat: state.tempMarkerData.lat,
        lng: state.tempMarkerData.lng,
        image: image.includes('data:image') ? image : null,
        area: 'ระบุตำแหน่งแล้ว',
        status: 'ready'
    };

    if (state.isUsingMock) {
        if (id) {
            const idx = state.staffList.findIndex(s => s.id == id);
            if(idx !== -1) state.staffList[idx] = newStaff;
        } else {
            state.staffList.push(newStaff);
        }
        alert('บันทึกข้อมูลเรียบร้อย (Offline)');
    } else {
        alert('ระบบจะบันทึกลงฐานข้อมูลจริงที่นี่');
    }

    closeModal();
    renderStaffLists();
    updateMapMarkers();
}

// Global functions for HTML onclick
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
    if(!confirm('ยืนยันลบ?')) return;
    state.staffList = state.staffList.filter(s => s.id !== id);
    renderStaffLists();
    updateMapMarkers();
};

// Utils
function getDistance(pos1, pos2) {
    var R = 6371; 
    var dLat = (pos2.lat-pos1.lat) * (Math.PI/180);
    var dLon = (pos2.lng-pos1.lng) * (Math.PI/180); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(pos1.lat*(Math.PI/180)) * Math.cos(pos2.lat*(Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return (R * c) * 1.35; 
}

function parseCoordinates(input) {
    const regex = /(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/;
    const match = input.match(regex);
    if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[3]) };
    return null;
}

function createLeafletIcon(color) {
    return new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

function createFlashIcon() {
    return new L.DivIcon({
        className: 'custom-div-icon',
        html: `<div style="position:relative; width:40px; height:40px;">
                <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-green.png" style="width:25px; height:41px; position:absolute; left:7px; top:0;" />
                <div class="led-flash" style="position:absolute; top:-10px; left:2px; width:35px; height:35px; background:radial-gradient(circle, rgba(255,50,50,1) 0%, rgba(255,0,0,0) 70%); border-radius:50%;"></div>
               </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
    });
}

function createPopupContent(staff) {
    return `<div style="font-family: sans-serif; min-width: 180px;">
        ${staff.image ? `<img src="${staff.image}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:8px;" />` : ''}
        <div style="font-weight:bold; color:#1e40af; font-size:14px;">${staff.name}</div>
        <div style="color:#64748b; font-size:12px; margin-bottom:4px;">📍 ${staff.area || 'ไม่ระบุ'}</div>
        <a href="tel:${staff.phone}" style="display:inline-block; background:#3b82f6; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:12px; width:100%; text-align:center;">📞 ${staff.phone}</a>
    </div>`;
}

function updateAppVersionText() {
    const el = document.getElementById('app-version');
    el.textContent = `KT Monitor v5.2 ${state.isUsingMock ? '(Offline Mode)' : '(Online)'}`;
}

function switchMap(typeCode) {
    mapInstance.removeLayer(tileLayer);
    tileLayer = L.tileLayer(`http://{s}.google.com/vt/lyrs=${typeCode}&x={x}&y={y}&z={z}`, {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(mapInstance);
    // Button styling toggle
    const btnRoad = document.getElementById('btn-map-roadmap');
    const btnSat = document.getElementById('btn-map-satellite');
    
    if (typeCode === 'm') {
        btnRoad.classList.add('bg-blue-100', 'text-blue-700');
        btnRoad.classList.remove('text-slate-600', 'hover:bg-slate-100');
        btnSat.classList.remove('bg-blue-100', 'text-blue-700');
        btnSat.classList.add('text-slate-600', 'hover:bg-slate-100');
    } else {
        btnSat.classList.add('bg-blue-100', 'text-blue-700');
        btnSat.classList.remove('text-slate-600', 'hover:bg-slate-100');
        btnRoad.classList.remove('bg-blue-100', 'text-blue-700');
        btnRoad.classList.add('text-slate-600', 'hover:bg-slate-100');
    }
}

async function doSearch(query) {
    if (query.length < 2) return;
    
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Thailand')}&format=json&limit=5`);
        const data = await res.json();
        
        renderSearchSuggestions(data, false);
    } catch(e) {}
}

function renderSearchSuggestions(data, isHistory = false) {
    const container = document.getElementById('search-suggestions');
    
    if (isHistory) {
        // Render History State
        const historyData = state.searchHistory;
        if (!historyData || historyData.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.innerHTML = `
            <div class="px-4 py-1 text-xs font-bold text-slate-400 flex justify-between items-center">
                <span>ค้นหาล่าสุด</span>
                <button onclick="clearSearchHistory()" class="text-red-400 hover:text-red-600">ล้าง</button>
            </div>
            ${historyData.map(item => `
                <div onclick="handleSelectLocation(${item.lat}, ${item.lon}, true)" class="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-start gap-3 text-slate-700 cursor-pointer border-b border-slate-50 last:border-0 group">
                    <div class="mt-0.5"><i data-lucide="clock" class="w-4 h-4 text-slate-400 group-hover:text-blue-500"></i></div>
                    <div><div class="font-medium text-slate-800 line-clamp-1">${item.display_name}</div></div>
                </div>
            `).join('')}
        `;
    } else {
        // Render Search Results State
        if (data.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-sm text-slate-400">ไม่พบผลการค้นหา</div>';
        } else {
            container.innerHTML = data.map(item => `
                <div onclick="handleSelectLocation('${item.lat}', '${item.lon}', false, '${item.display_name.replace(/'/g, "\\'")}')" class="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-start gap-3 text-slate-700 cursor-pointer border-b border-slate-50 last:border-0">
                    <div class="mt-0.5"><i data-lucide="map-pin" class="w-4 h-4 text-slate-400"></i></div>
                    <div><div class="font-medium text-slate-800">${item.display_name.split(',')[0]}</div><div class="text-xs text-slate-400 line-clamp-1">${item.display_name}</div></div>
                </div>
            `).join('');
        }
    }
    
    container.classList.remove('hidden');
    lucide.createIcons();
}

function renderSearchHistory() {
    renderSearchSuggestions([], true);
}

window.handleSelectLocation = (lat, lon, isHistoryItem, displayName = '') => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    
    // Save to history if it's a new search result
    if (!isHistoryItem && displayName) {
        saveToSearchHistory({
            lat: latNum,
            lon: lonNum,
            display_name: displayName.split(',')[0] // Save short name
        });
    }

    document.getElementById('search-suggestions').classList.add('hidden');
    handleMapClick({lat: latNum, lng: lonNum});
};

window.clearSearchHistory = () => {
    clearSearchHistory();
};