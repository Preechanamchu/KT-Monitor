import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, MapPin, Users, Phone, Navigation, Plus, Settings, AlertCircle, 
  CheckCircle, Car, Clock, Menu, X, Loader, Lock, LogOut, Layers, Edit2, 
  Trash2, Monitor, ChevronLeft, ChevronRight, ArrowLeft, ImageIcon, Upload, 
  Siren, Link as LinkIcon 
} from 'lucide-react';

// --- Configuration ---
// Initial Staff Data (Fallback for Preview Mode)
const INITIAL_STAFF = [
  { id: 1, name: 'สมชาย ใจดี', phone: '081-111-1111', lat: 13.7563, lng: 100.5018, area: 'พระนคร', status: 'ready', image: null },
  { id: 2, name: 'วิชัย รวดเร็ว', phone: '089-222-2222', lat: 13.6900, lng: 100.6000, area: 'บางนา', status: 'busy', image: null },
  { id: 3, name: 'อำนาจ ประหยัด', phone: '085-333-3333', lat: 13.8000, lng: 100.5500, area: 'จตุจักร', status: 'ready', image: null },
  { id: 4, name: 'ก้องเกียรติ พารวย', phone: '090-444-4444', lat: 13.9000, lng: 100.4500, area: 'นนทบุรี', status: 'ready', image: null },
  { id: 5, name: 'มานะ อดทน', phone: '088-555-5555', lat: 13.6500, lng: 100.4000, area: 'บางขุนเทียน', status: 'ready', image: null },
  { id: 6, name: 'วีระ ขายเก่ง', phone: '081-234-5678', lat: 13.7200, lng: 100.5200, area: 'สาทร', status: 'ready', image: null },
  { id: 7, name: 'ปิติ ยินดี', phone: '089-987-6543', lat: 13.7800, lng: 100.4800, area: 'ปิ่นเกล้า', status: 'ready', image: null },
  { id: 8, name: 'ชูใจ มั่นคง', phone: '086-555-4444', lat: 13.8200, lng: 100.5800, area: 'ลาดพร้าว', status: 'busy', image: null },
  { id: 9, name: 'แก้ว กล้าหาญ', phone: '092-222-3333', lat: 13.6800, lng: 100.4200, area: 'พระราม 2', status: 'ready', image: null },
  { id: 10, name: 'สุดา พาเพลิน', phone: '084-444-5555', lat: 13.7400, lng: 100.5600, area: 'ทองหล่อ', status: 'ready', image: null },
  { id: 11, name: 'วินัย ใจสู้', phone: '081-123-4567', lat: 13.8500, lng: 100.5200, area: 'งามวงศ์วาน', status: 'ready', image: null },
  { id: 12, name: 'ธิดา รักษ์ดี', phone: '089-111-2222', lat: 13.7000, lng: 100.6200, area: 'อ่อนนุช', status: 'ready', image: null }
];

// Helper: Haversine Distance
function getEstimatedDistance(lat1, lon1, lat2, lon2) {
  var R = 6371; 
  var dLat = (lat2-lat1) * (Math.PI/180);
  var dLon = (lon2-lon1) * (Math.PI/180); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var linearDist = R * c;
  return linearDist * 1.35; 
}

function parseCoordinates(input) {
  const regex = /(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/;
  const match = input.match(regex);
  if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[3]) };
  return null;
}

export default function KTMonitorGoogleUI() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [staffList, setStaffList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [accidentLocation, setAccidentLocation] = useState(null);
  const [isUsingMock, setIsUsingMock] = useState(false); // New state to track if we are using mock data
  
  // State for ranking & search
  const [nearbyStaffList, setNearbyStaffList] = useState([]); 
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRouteStaffId, setSelectedRouteStaffId] = useState(null); 
  
  // Map View State
  const [mapType, setMapType] = useState('roadmap'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Admin & Auth State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [editingStaff, setEditingStaff] = useState(null); 
  const [newStaff, setNewStaff] = useState({ name: '', phone: '', lat: '', lng: '', coordsInput: '', image: null });
  const [tempMarker, setTempMarker] = useState(null);

  // Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayersRef = useRef([]); 
  const [libLoaded, setLibLoaded] = useState(false);
  const tileLayerRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // --- API Functions (with Fallback) ---
  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      // Try fetching from real API
      const res = await fetch('/api/staff');
      if (!res.ok) throw new Error('API not available');
      
      const data = await res.json();
      const formattedData = data.map(s => ({
          ...s,
          lat: parseFloat(s.lat),
          lng: parseFloat(s.lng)
      }));
      setStaffList(formattedData);
      setIsUsingMock(false);
    } catch (error) {
      // Fallback to Mock Data if API fails (Preview Mode)
      console.warn("API unavailable, using mock data.");
      setStaffList(INITIAL_STAFF);
      setIsUsingMock(true);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 1. Load Leaflet ---
  useEffect(() => {
    const existingScript = document.getElementById('leaflet-script');
    const existingCss = document.getElementById('leaflet-css');
    if (existingScript && existingCss) { setLibLoaded(true); return; }
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.id = 'leaflet-script';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLibLoaded(true);
    document.head.appendChild(script);
  }, []);

  // --- 2. Initialize Map & Fetch Data ---
  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (!libLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapContainerRef.current, {
        zoomControl: false 
    }).setView([13.7563, 100.5018], 11);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const googleRoadmap = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    });
    googleRoadmap.addTo(map);
    tileLayerRef.current = googleRoadmap;
    mapInstanceRef.current = map;

    map.on('click', (e) => {
      document.dispatchEvent(new CustomEvent('map-click', { detail: e.latlng }));
    });
  }, [libLoaded]);

  // Handle Switch Map Type
  useEffect(() => {
      if (!mapInstanceRef.current || !tileLayerRef.current) return;
      const L = window.L;
      const map = mapInstanceRef.current;
      map.removeLayer(tileLayerRef.current);
      const typeCode = mapType === 'satellite' ? 'y' : 'm'; 
      const newLayer = L.tileLayer(`http://{s}.google.com/vt/lyrs=${typeCode}&x={x}&y={y}&z={z}`, {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
      });
      newLayer.addTo(map);
      tileLayerRef.current = newLayer;
  }, [mapType]);

  // Handle click logic
  useEffect(() => {
    const handleMapClickInternal = (e) => {
      const latlng = e.detail;
      if (activeTab === 'dashboard') {
        handleMapClick(latlng);
      } else if (activeTab === 'admin' && isAdminAuthenticated && isModalOpen) {
        handleMapClick(latlng);
      }
    };
    document.addEventListener('map-click', handleMapClickInternal);
    return () => document.removeEventListener('map-click', handleMapClickInternal);
  }, [activeTab, isModalOpen, staffList, isAdminAuthenticated]);

  // --- 3. Update Markers & Lines ---
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    routeLayersRef.current.forEach(l => map.removeLayer(l));
    routeLayersRef.current = [];

    // Icons
    const iconPersonBlue = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const iconPersonGreen = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const iconAccidentFlash = new L.DivIcon({
        className: 'custom-div-icon',
        html: `
            <div style="position:relative; width:40px; height:40px;">
                <img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-green.png" style="width:25px; height:41px; position:absolute; left:7px; top:0;" />
                <div class="led-flash" style="position:absolute; top:-10px; left:2px; width:35px; height:35px; background:radial-gradient(circle, rgba(255,50,50,1) 0%, rgba(255,0,0,0) 70%); border-radius:50%; animation: flash 0.8s infinite;"></div>
                <div style="position:absolute; top:-5px; left:12px; width:16px; height:10px; background:red; border-radius:5px 5px 0 0; box-shadow:0 0 10px red;"></div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
    });

    const iconSelected = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-gold.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    staffList.forEach(staff => {
      const isSelected = selectedRouteStaffId === staff.id;
      const marker = L.marker([staff.lat, staff.lng], { icon: isSelected ? iconPersonGreen : iconPersonBlue })
        .bindPopup(`
            <div style="font-family: sans-serif; min-width: 180px;">
                ${staff.image ? `<img src="${staff.image}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:8px;" />` : ''}
                <div style="font-weight:bold; color:#1e40af; font-size:14px;">${staff.name}</div>
                <div style="color:#64748b; font-size:12px; margin-bottom:4px;">📍 ${staff.area || 'ไม่ระบุ'}</div>
                <a href="tel:${staff.phone}" style="display:inline-block; background:#3b82f6; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:12px; width:100%; text-align:center;">📞 ${staff.phone}</a>
            </div>
        `);
      marker.addTo(map);
      markersRef.current.push(marker);
    });

    if (accidentLocation) {
        const accMarker = L.marker([accidentLocation.lat, accidentLocation.lng], { icon: iconAccidentFlash })
            .bindPopup(`<div style="font-family:sans-serif; font-weight:bold; color:#ef4444;">🚨 จุดเกิดเหตุฉุกเฉิน</div>`)
            .openPopup();
        accMarker.addTo(map);
        markersRef.current.push(accMarker);
    }

    if (tempMarker && activeTab === 'admin' && isAdminAuthenticated) {
        const tMarker = L.marker([tempMarker.lat, tempMarker.lng], { icon: iconSelected }).addTo(map);
        markersRef.current.push(tMarker);
    }

    if (accidentLocation && nearbyStaffList.length > 0 && selectedRouteStaffId) {
        const targetStaff = nearbyStaffList.find(s => s.id === selectedRouteStaffId) || nearbyStaffList[0];
        const latlngs = [[targetStaff.lat, targetStaff.lng], [accidentLocation.lat, accidentLocation.lng]];
        
        const baseLine = L.polyline(latlngs, { color: '#1e3a8a', weight: 6, opacity: 0.3 }).addTo(map);
        const dashLine = L.polyline(latlngs, { 
            color: '#3b82f6', weight: 4, opacity: 1, dashArray: '15, 15', className: 'flowing-dash'
        }).addTo(map);
        
        routeLayersRef.current.push(baseLine, dashLine);
        map.fitBounds(dashLine.getBounds(), { padding: [100, 100] });
    }
  }, [staffList, accidentLocation, tempMarker, nearbyStaffList, activeTab, libLoaded, isAdminAuthenticated, selectedRouteStaffId]);

  // --- Logic Functions ---
  const handleMapClick = (latlng, flyTo = false) => {
    if (activeTab === 'dashboard') {
      setAccidentLocation(latlng);
      calculateNearbyStaff(latlng, staffList);
      if (flyTo && mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latlng.lat, latlng.lng], 15, { animate: true, duration: 1.5 });
      }
      setIsSidebarOpen(true); 
      setSearchQuery(''); 
      setShowSuggestions(false);
    } else if (activeTab === 'admin' && isAdminAuthenticated && isModalOpen) {
      setTempMarker(latlng);
      setNewStaff(prev => ({ ...prev, lat: latlng.lat.toFixed(6), lng: latlng.lng.toFixed(6), coordsInput: `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}` }));
    }
  };

  const calculateNearbyStaff = (location, list) => {
    if (!location) return;
    const staffWithDistance = list.map(staff => {
        const dist = getEstimatedDistance(location.lat, location.lng, staff.lat, staff.lng);
        const timeMins = (dist / 30) * 60; 
        return { ...staff, distance: dist, time: timeMins };
    });
    staffWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbyStaffList(staffWithDistance.slice(0, 10));
    if(staffWithDistance.length > 0) setSelectedRouteStaffId(staffWithDistance[0].id);
  };

  const handleStaffListClick = (staffId) => setSelectedRouteStaffId(staffId);

  // --- AUTHENTICATION (with Fallback) ---
  const handleAdminLogin = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      setAuthError('');
      
      try {
        const res = await fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ pin: pinInput })
        });
        if (!res.ok) throw new Error('Auth API failed');
        const data = await res.json();
        
        if (data.success) {
            setIsAdminAuthenticated(true);
            setPinInput('');
        } else {
            setAuthError('รหัสผ่านไม่ถูกต้อง');
            setPinInput('');
        }
      } catch (err) {
          // Fallback Auth
          if (pinInput === '210406') {
             setIsAdminAuthenticated(true);
             setPinInput('');
             if (isUsingMock) alert('Login สำเร็จ (Offline Mode)');
          } else {
             setAuthError('รหัสผ่านไม่ถูกต้อง');
          }
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleLogout = () => { setIsAdminAuthenticated(false); setActiveTab('dashboard'); };

  // --- CRUD (Create, Read, Update, DELETE) - With Fallback ---
  const handleSaveStaff = async (e) => {
    e.preventDefault();
    let { lat, lng, coordsInput } = newStaff;
    if (!lat && coordsInput) {
        const parsed = parseCoordinates(coordsInput);
        if (parsed) { lat = parsed.lat; lng = parsed.lng; }
    }
    if (!newStaff.name || !newStaff.phone || !lat) { alert("กรุณากรอกข้อมูลให้ครบถ้วน"); return; }
    
    setIsSubmitting(true);
    try {
        const payload = {
            id: editingStaff ? editingStaff.id : null,
            name: newStaff.name,
            phone: newStaff.phone,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            image: newStaff.image,
            area: newStaff.area || 'กำหนดเอง'
        };

        const res = await fetch('/api/staff', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
           await fetchStaff(); 
           closeModal();
        } else {
           throw new Error('Save API failed');
        }
    } catch (err) {
        // Fallback Save (Update local state only)
        if (isUsingMock) {
            if (editingStaff) {
                setStaffList(staffList.map(s => s.id === editingStaff.id ? { ...s, name: newStaff.name, phone: newStaff.phone, lat: parseFloat(lat), lng: parseFloat(lng), image: newStaff.image } : s));
            } else {
                setStaffList([...staffList, { id: Date.now(), name: newStaff.name, phone: newStaff.phone, lat: parseFloat(lat), lng: parseFloat(lng), area: 'กำหนดเอง', status: 'ready', image: newStaff.image }]);
            }
            alert("บันทึกข้อมูลแล้ว (Offline Mode: ข้อมูลจะหายไปเมื่อรีเฟรช)");
            closeModal();
        } else {
            alert('เกิดข้อผิดพลาดในการบันทึก');
        }
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleImageChange = (e) => {
      const file = e.target.files[0];
      if (file) {
          if (file.type !== 'image/png' && file.type !== 'image/jpeg') { alert('รองรับเฉพาะไฟล์ PNG/JPG'); return; }
          const reader = new FileReader();
          reader.onloadend = () => setNewStaff(prev => ({ ...prev, image: reader.result }));
          reader.readAsDataURL(file);
      }
  };

  const handleEditClick = (staff) => {
      setEditingStaff(staff);
      setNewStaff({ name: staff.name, phone: staff.phone, lat: staff.lat, lng: staff.lng, coordsInput: `${staff.lat}, ${staff.lng}`, image: staff.image });
      setTempMarker({ lat: staff.lat, lng: staff.lng });
      setIsModalOpen(true);
      if (mapInstanceRef.current) mapInstanceRef.current.flyTo([staff.lat, staff.lng], 15);
  };

  const handleDeleteClick = async (id) => { 
      if (window.confirm('ยืนยันการลบรายชื่อพนักงานนี้? (ไม่สามารถกู้คืนได้)')) {
          try {
              const res = await fetch('/api/staff', {
                  method: 'DELETE',
                  body: JSON.stringify({ id })
              });
              if(res.ok) {
                  fetchStaff();
              } else {
                  throw new Error('Delete API failed');
              }
          } catch(err) {
              if (isUsingMock) {
                  setStaffList(staffList.filter(s => s.id !== id));
              } else {
                  alert("เกิดข้อผิดพลาด");
              }
          }
      }
  };

  const openAddModal = () => { setEditingStaff(null); setNewStaff({ name: '', phone: '', lat: '', lng: '', coordsInput: '', image: null }); setTempMarker(null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingStaff(null); setNewStaff({ name: '', phone: '', lat: '', lng: '', coordsInput: '', image: null }); setTempMarker(null); };

  // --- Search Logic ---
  const handleSearchInputChange = (e) => {
      const query = e.target.value;
      setSearchQuery(query);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (query.length > 1) {
          setIsSearching(true);
          searchTimeoutRef.current = setTimeout(() => fetchPlaces(query), 800); 
      } else {
          setSuggestions([]);
          setShowSuggestions(false);
          setIsSearching(false);
      }
  };

  const fetchPlaces = async (query) => {
      try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Thailand')}&format=json&limit=5&addressdetails=1`);
          const data = await response.json();
          setSuggestions(data.map(item => ({
              name: item.name || item.display_name.split(',')[0], 
              full_address: item.display_name,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon)
          })));
          setShowSuggestions(true);
      } catch (error) { console.error("Search failed:", error); setSuggestions([]); } 
      finally { setIsSearching(false); }
  };

  const handleSelectSuggestion = (location) => {
      setSearchQuery(location.name);
      setShowSuggestions(false);
      handleMapClick({ lat: location.lat, lng: location.lng }, true);
  };

  const clearSearch = () => {
      setSearchQuery('');
      setSuggestions([]);
      setShowSuggestions(false);
      if (accidentLocation) { setAccidentLocation(null); setNearbyStaffList([]); setSelectedRouteStaffId(null); }
  };

  return (
    <div className="relative h-screen w-full bg-slate-100 overflow-hidden font-sans">
      
      {/* 1. MAP BACKGROUND */}
      <div className="absolute inset-0 z-0 block">
         {!libLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
                <Loader className="animate-spin w-8 h-8 mr-2" />
                Loading Maps...
            </div>
         )}
         <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* 2. FLOATING SEARCH BAR */}
      <div className="absolute top-4 left-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
          <div className="bg-white rounded-lg shadow-xl flex items-center p-0.5 border border-transparent focus-within:border-blue-500 transition-all">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"><Menu className="w-5 h-5" /></button>
            <div className="flex-1 relative">
                <input type="text" placeholder="ค้นหาใน Google Maps" className="w-full px-2 py-3 text-sm outline-none text-slate-700 placeholder-slate-400 bg-transparent" value={searchQuery} onChange={handleSearchInputChange} onFocus={() => searchQuery.length > 1 && setShowSuggestions(true)} />
            </div>
            <div className="flex items-center px-2 border-l border-slate-100">
                {isSearching ? <Loader className="w-5 h-5 text-blue-500 animate-spin mr-2" /> : searchQuery ? <button onClick={clearSearch} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button> : <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"><Search className="w-5 h-5" /></button>}
            </div>
          </div>
          {showSuggestions && suggestions.length > 0 && (
             <div className="mt-1 bg-white rounded-lg shadow-xl border-t border-slate-100 overflow-hidden py-2 animate-fade-in-up">
                {suggestions.map((loc, idx) => (
                    <button key={idx} onClick={() => handleSelectSuggestion(loc)} className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-start gap-3 text-slate-700 transition-colors">
                        <div className="mt-0.5 min-w-[16px]"><MapPin className="w-4 h-4 text-slate-400" /></div>
                        <div><div className="font-medium text-slate-800">{loc.name}</div><div className="text-xs text-slate-400 line-clamp-1">{loc.full_address}</div></div>
                    </button>
                ))}
             </div>
          )}
      </div>

      {/* 3. SIDEBAR DRAWER */}
      <div className={`absolute top-24 left-4 bottom-8 w-96 bg-white rounded-xl shadow-2xl z-40 transform transition-transform duration-300 flex flex-col overflow-hidden border border-slate-200 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[120%]'}`}>
         <div className="flex border-b border-slate-200 bg-white">
            <button onClick={() => setActiveTab('dashboard')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'dashboard' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>ปฏิบัติการ</button>
            <button onClick={() => setActiveTab('admin')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'admin' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>Admin</button>
         </div>
         <div className="flex-1 overflow-y-auto p-0 bg-slate-50">
            {activeTab === 'dashboard' && (
                <div className="p-4 space-y-4">
                    {!accidentLocation ? (
                         <div className="text-center py-10 opacity-60">
                            <img src="https://www.gstatic.com/images/icons/material/system_gm/2x/place_gm_blue_24dp.png" className="w-12 h-12 mx-auto mb-2 opacity-50" alt="" />
                            <p className="text-slate-500 text-sm">ค้นหาสถานที่ หรือ คลิกบนแผนที่</p>
                         </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                                <span className="text-sm font-bold text-red-600 flex items-center gap-2"><Siren className="w-5 h-5 animate-pulse" /> จุดเกิดเหตุ (ฉุกเฉิน)</span>
                                <button onClick={() => { setAccidentLocation(null); setNearbyStaffList([]); setSearchQuery(''); }} className="text-xs text-slate-400 hover:text-red-500">ล้างค่า</button>
                            </div>
                            {nearbyStaffList.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-400 mb-2 font-medium">คลิกชื่อเพื่อดูเส้นทาง</p>
                                    {nearbyStaffList.map((staff, index) => (
                                        <div key={staff.id} onClick={() => handleStaffListClick(staff.id)} className={`p-3 rounded-lg border flex justify-between items-center transition-all cursor-pointer hover:bg-blue-50 ${selectedRouteStaffId === staff.id ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300' : 'bg-white border-slate-200'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-full flex-shrink-0 overflow-hidden border-2 ${selectedRouteStaffId === staff.id ? 'border-blue-500' : 'border-slate-200'}`}>
                                                    {staff.image ? <img src={staff.image} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><Users className="w-6 h-6 text-slate-400" /></div>}
                                                </div>
                                                <div>
                                                    <div className={`font-bold text-base ${selectedRouteStaffId === staff.id ? 'text-blue-700' : 'text-slate-800'}`}>{index + 1}. {staff.name}</div>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-sm font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1"><MapPin className="w-3 h-3" /> {staff.distance.toFixed(1)} กม.</span>
                                                        <span className="text-sm font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded flex items-center gap-1"><Clock className="w-3 h-3" /> {staff.time.toFixed(0)} นาที</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 py-4 text-sm">ไม่พบพนักงานในบริเวณใกล้เคียง</div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'admin' && (
                <div className="p-4 h-full">
                    {!isAdminAuthenticated ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4 py-10">
                            <div className="bg-slate-200 p-3 rounded-full"><Lock className="w-6 h-6 text-slate-500" /></div>
                            <form onSubmit={handleAdminLogin} className="w-full px-4 text-center">
                                <div className="mb-4 text-sm font-medium text-slate-600">Admin PIN (210406)</div>
                                <input type="password" className="w-full text-center text-xl tracking-[0.5em] border rounded-lg py-2" maxLength={6} value={pinInput} onChange={(e) => setPinInput(e.target.value)} disabled={isSubmitting} />
                                {authError && <div className="text-red-500 text-xs mt-2">{authError}</div>}
                                <button className="mt-4 w-full bg-slate-800 text-white py-2 rounded-lg text-sm disabled:opacity-50" disabled={isSubmitting}>
                                    {isSubmitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-green-50 p-2 rounded border border-green-200">
                                <span className="text-xs font-bold text-green-700 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Admin Mode</span>
                                <button onClick={handleLogout} className="text-xs text-red-500 flex items-center gap-1"><LogOut className="w-3 h-3" /> ออก</button>
                            </div>
                            <button onClick={openAddModal} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> เพิ่มพนักงาน</button>
                            <div className="space-y-2 pb-10">
                                {isLoading && <div className="text-center py-4 text-slate-400">กำลังโหลดข้อมูล...</div>}
                                {staffList.map(staff => (
                                    <div key={staff.id} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                                                {staff.image ? <img src={staff.image} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-slate-400 m-auto h-full" />}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-slate-800">{staff.name}</div>
                                                <div className="text-xs text-slate-500">{staff.phone}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditClick(staff)} className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200"><Edit2 className="w-4 h-4" /></button>
                                            <button onClick={() => handleDeleteClick(staff.id)} className="p-2 bg-red-100 rounded-lg text-red-600 hover:bg-red-200 transition-colors" title="ลบพนักงาน"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
         </div>
         <div className="p-2 border-t border-slate-200 bg-white text-[10px] text-center text-slate-400">
            KT Monitor v5.1 {isUsingMock ? '(Offline/Preview Mode)' : '(Real DB Connected)'}
         </div>
      </div>

      {/* 4. MAP CONTROLS */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
         <div className="bg-white rounded shadow-md p-1 flex">
            <button onClick={() => { setMapType('roadmap'); }} className={`px-3 py-1 text-xs font-medium rounded ${mapType === 'roadmap' ? 'bg-blue-100 text-blue-700' : 'text-slate-600'}`}>แผนที่</button>
            <button onClick={() => { setMapType('satellite'); }} className={`px-3 py-1 text-xs font-medium rounded ${mapType === 'satellite' ? 'bg-blue-100 text-blue-700' : 'text-slate-600'}`}>ดาวเทียม</button>
         </div>
      </div>

      {/* ADMIN MODAL */}
      {isModalOpen && isAdminAuthenticated && (
        <div className="absolute inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden">
              <div className="bg-slate-800 p-3 flex justify-between items-center text-white">
                 <h3 className="font-bold text-sm">{editingStaff ? 'แก้ไข' : 'เพิ่ม'} พนักงาน</h3>
                 <button onClick={closeModal}><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3">
                 <div className="flex flex-col items-center justify-center mb-4">
                    <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden mb-2 relative group">
                        {newStaff.image ? <img src={newStaff.image} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-400" />}
                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"><Upload className="w-6 h-6 text-white" /><input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleImageChange} /></label>
                    </div>
                    <span className="text-[10px] text-slate-400">อัพโหลดรูปภาพ</span>
                 </div>
                 <input type="text" placeholder="ชื่อ-นามสกุล" className="w-full border p-2 rounded text-sm" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} />
                 <input type="text" placeholder="เบอร์โทร" className="w-full border p-2 rounded text-sm" value={newStaff.phone} onChange={e => setNewStaff({...newStaff, phone: e.target.value})} />
                 <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border">
                    <div className="flex items-center gap-2 mb-2"><MapPin className="w-3 h-3 text-blue-500" /><span className="font-bold text-slate-700">ระบุพิกัด (คลิกแผนที่ หรือ กรอกเอง)</span></div>
                    <div className="relative">
                        <input type="text" placeholder="วางพิกัด หรือ ลิงก์ Google Maps..." className="w-full border border-slate-300 rounded p-2 pl-8 text-xs mb-2 font-mono focus:border-blue-500 outline-none" value={newStaff.coordsInput} onChange={(e) => setNewStaff({...newStaff, coordsInput: e.target.value})} />
                        <LinkIcon className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>
                    <div className="text-[10px] text-slate-400 pl-1">{newStaff.lat ? `พิกัด: ${newStaff.lat}, ${newStaff.lng}` : 'ยังไม่ได้ระบุตำแหน่ง'}</div>
                 </div>
                 <button onClick={handleSaveStaff} disabled={isSubmitting} className="w-full bg-blue-600 text-white py-2 rounded text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                 </button>
              </div>
           </div>
        </div>
      )}

      <style>{`
        .leaflet-container { background: #e5e7eb; width: 100%; height: 100%; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
        @keyframes dash-flow { to { stroke-dashoffset: -30; } }
        .flowing-dash { animation: dash-flow 1s linear infinite; }
        @keyframes flash { 0% { opacity: 1; transform: scale(1); box-shadow: 0 0 10px red; } 50% { opacity: 0.5; transform: scale(0.9); box-shadow: 0 0 2px red; } 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 15px red; } }
      `}</style>
    </div>
  );
}