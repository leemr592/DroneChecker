/**
 * DRONE SKYGUARD - Main Application JS
 * Real-time Airspace and Weather Decision Engine (Vanilla JS + CDN Libraries)
 */

// Global App State
const state = {
    coords: { lat: 37.5665, lon: 126.9780 }, // Default: Seoul City Hall
    address: '서울특별시 중구 태평로1가',
    weather: null,
    drone: {
        preset: 'custom',
        weight: 249,
        maxWind: 8,
        tempMin: -10,
        tempMax: 40,
        waterproof: false
    },
    config: {
        weatherKey: '',
        vworldKey: ''
    },
    cachedWeather: {},
    // Simulation state management
    sim: {
        isDrawing: false,
        waypoints: [],
        polyline: null,
        isPlaying: false,
        isPaused: false,
        droneMarker: null,
        speed: 5, // m/s
        defaultAltitude: 50, // m
        currentStep: 0,
        progress: 0,
        accumulatedDist: 0,
        batteryLevel: 100,
        animationFrameId: null,
        lastTime: 0
    }
};

// UI Element Selector References
const el = {
    search: document.getElementById('input-search'),
    searchClear: document.getElementById('btn-clear-search'),
    suggestions: document.getElementById('search-suggestions'),
    selectPreset: document.getElementById('select-preset'),
    specWeight: document.getElementById('spec-weight'),
    specWind: document.getElementById('spec-wind'),
    specTempMin: document.getElementById('spec-temp-min'),
    specTempMax: document.getElementById('spec-temp-max'),
    specWaterproof: document.getElementById('spec-waterproof'),
    displayCoords: document.getElementById('display-coords'),
    btnCopyCoords: document.getElementById('btn-copy-coords'),
    btnApiConfig: document.getElementById('btn-api-config'),
    modalApiConfig: document.getElementById('modal-api-config'),
    btnSaveApi: document.getElementById('btn-save-api'),
    btnCancelApi: document.getElementById('btn-cancel-api'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    apiKeyWeather: document.getElementById('api-key-weather'),
    apiKeyVworld: document.getElementById('api-key-vworld'),
    weatherTemp: document.getElementById('weather-temp'),
    weatherWind: document.getElementById('weather-wind'),
    windArrow: document.getElementById('wind-direction-arrow'),
    windDegText: document.getElementById('weather-wind-deg-text'),
    weatherRain: document.getElementById('weather-rain'),
    weatherHumidity: document.getElementById('weather-humidity'),
    weatherSunrise: document.getElementById('weather-sunrise'),
    weatherSunset: document.getElementById('weather-sunset'),
    decisionPanel: document.getElementById('decision-panel'),
    decisionIndicator: document.getElementById('decision-pulse-indicator'),
    decisionGlow: document.getElementById('decision-pulse-glow'),
    decisionIcon: document.getElementById('decision-icon'),
    decisionStatusText: document.getElementById('decision-status-text'),
    decisionReasonsList: document.getElementById('decision-reasons-list'),
    layerVworld: document.getElementById('layer-vworld'),
    layerCustomRadius: document.getElementById('layer-custom-radius'),
    tabMap: document.getElementById('tab-map'),
    tabSpecs: document.getElementById('tab-specs'),
    sidebarPanel: document.getElementById('sidebar-panel'),
    mapSection: document.querySelector('main > section'),
    // Simulator DOM Selectors
    btnDrawMode: document.getElementById('btn-draw-mode'),
    btnResetPath: document.getElementById('btn-reset-path'),
    inputDefaultAlt: document.getElementById('input-default-alt'),
    displayDefaultAlt: document.getElementById('display-default-alt'),
    inputSimSpeed: document.getElementById('input-sim-speed'),
    displaySimSpeed: document.getElementById('display-sim-speed'),
    btnPlaySim: document.getElementById('btn-play-sim'),
    btnPauseSim: document.getElementById('btn-pause-sim'),
    simStatusBadge: document.getElementById('sim-status-badge'),
    simTelemetry: document.getElementById('sim-telemetry'),
    telemetryDist: document.getElementById('telemetry-dist'),
    telemetryWind: document.getElementById('telemetry-wind'),
    telemetryBatt: document.getElementById('telemetry-batt'),
    telemetryBattBar: document.getElementById('telemetry-batt-bar'),
    altProfileSvg: document.getElementById('alt-profile-svg'),
    altChartPlaceholder: document.getElementById('alt-chart-placeholder')
};

// Predefined Drone Presets
const dronePresets = {
    'custom': { weight: 249, maxWind: 8, tempMin: -10, tempMax: 40, waterproof: false },
    'dji-mini': { weight: 249, maxWind: 8.0, tempMin: -10, tempMax: 40, waterproof: false },
    'dji-air': { weight: 720, maxWind: 10.7, tempMin: -10, tempMax: 40, waterproof: false },
    'dji-mavic': { weight: 895, maxWind: 12.0, tempMin: -10, tempMax: 40, waterproof: false },
    'dji-inspire': { weight: 3950, maxWind: 12.0, tempMin: -20, tempMax: 40, waterproof: false }
};

// Leaflet Map Variables
let map = null;
let marker = null;
let safetyRadiusCircle = null;
let vworldWmsLayer = null;

// Demo GeoJSON Features (대한민국 비행금지구역 / 주요 공항 관제권)
// API Key가 없거나 통신이 불가능할 때 Turf.js 공간 연산 fallback으로 사용
let demoAirspaces = {
    type: 'FeatureCollection',
    features: []
};

// Application Initialize
window.addEventListener('DOMContentLoaded', () => {
    loadSavedSettings();
    initMap();
    initDemoAirspaces();
    initEventListeners();
    refreshAllData();
    lucide.createIcons();
});

// Load Settings from LocalStorage
function loadSavedSettings() {
    state.config.weatherKey = localStorage.getItem('skyguard_weather_key') || '';
    state.config.vworldKey = localStorage.getItem('skyguard_vworld_key') || '';
    
    el.apiKeyWeather.value = state.config.weatherKey;
    el.apiKeyVworld.value = state.config.vworldKey;

    const savedDrone = localStorage.getItem('skyguard_drone_spec');
    if (savedDrone) {
        try {
            state.drone = JSON.parse(savedDrone);
            updateDroneInputsUI();
        } catch (e) {
            console.error('드론 세이브 데이터 로드 실패:', e);
        }
    }
}

// Initialize Leaflet Map
function initMap() {
    // 맵 객체 생성 (다크 모드 타일 설정용 Canvas Renderer 적용)
    map = L.map('map', {
        center: [state.coords.lat, state.coords.lon],
        zoom: 12,
        minZoom: 6,
        maxZoom: 18,
        renderer: L.canvas()
    });

    // Dark Theme Leaflet Tile Layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Click Marker Setup
    const droneIcon = L.divIcon({
        className: 'custom-drone-marker',
        html: '<div class="w-6 h-6 bg-emerald-500 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-slate-950"><i data-lucide="crosshair" class="w-3.5 h-3.5"></i></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    marker = L.marker([state.coords.lat, state.coords.lon], {
        draggable: true,
        icon: droneIcon
    }).addTo(map);

    // 비행 한계 반경 가이드라인 (150m 원)
    safetyRadiusCircle = L.circle([state.coords.lat, state.coords.lon], {
        radius: 150,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.1,
        weight: 1.5,
        dashArray: '4, 4'
    }).addTo(map);

    // VWorld WMS 공역 레이어 추가 (키가 있는 경우만 추가)
    updateVworldWmsLayer();

    // Marker Drag Event
    marker.on('dragend', (e) => {
        const position = marker.getLatLng();
        updateLocation(position.lat, position.lng);
    });

    // Map Click Event
    map.on('click', (e) => {
        if (state.sim.isDrawing) {
            handleMapClickForPath(e);
        } else {
            updateLocation(e.latlng.lat, e.latlng.lng);
        }
    });
}

// VWorld WMS 비행제한구역 오버레이 토글/갱신
function updateVworldWmsLayer() {
    if (vworldWmsLayer) {
        map.removeLayer(vworldWmsLayer);
        vworldWmsLayer = null;
    }

    if (state.config.vworldKey && el.layerVworld.checked) {
        // VWorld API Key가 입력되었을 때 비행금지(lt_c_aisspz), 비행제한(lt_c_aisua) 영역 WMS 타일 추가
        vworldWmsLayer = L.tileLayer.wms('https://api.vworld.kr/req/wms', {
            key: state.config.vworldKey,
            service: 'WMS',
            version: '1.3.0',
            request: 'GetMap',
            layers: 'lt_c_aisspz,lt_c_aisua',
            styles: 'lt_c_aisspz,lt_c_aisua',
            format: 'image/png',
            transparent: true,
            opacity: 0.4,
            styles: 'lt_c_aisspz,lt_c_aisua'
        }).addTo(map);
    }
}

// 주요 비행제한구역 데모 공간 데이터 빌드 (API 미작동 대비 Fallback)
function initDemoAirspaces() {
    const locations = [
        { name: '인천국제공항 관제권', coords: [37.4602, 126.4407], radiusKm: 9.3, type: 'airport' },
        { name: '김포국제공항 관제권', coords: [37.5583, 126.7906], radiusKm: 9.3, type: 'airport' },
        { name: '제주국제공항 관제권', coords: [33.5113, 126.4930], radiusKm: 9.3, type: 'airport' },
        { name: '김해국제공항 관제권', coords: [35.1795, 128.9382], radiusKm: 9.3, type: 'airport' },
        { name: '서울 중심부 비행금지구역 (P73A)', coords: [37.5825, 126.9770], radiusKm: 3.8, type: 'nofly' },
        { name: '서울 외곽 비행제한구역 (P73B)', coords: [37.5825, 126.9770], radiusKm: 8.3, type: 'restrict' }
    ];

    locations.forEach(loc => {
        // Turf.js를 사용해 원형 폴리곤 생성 후 GeoJSON에 주입
        const center = turf.point([loc.coords[1], loc.coords[0]]);
        const options = { steps: 32, units: 'kilometers' };
        const circlePolygon = turf.circle(center, loc.radiusKm, options);
        
        circlePolygon.properties = {
            name: loc.name,
            type: loc.type,
            radius: loc.radiusKm
        };
        
        demoAirspaces.features.push(circlePolygon);

        // 지도상에도 반투명한 시각적 가이드라인 폴리곤 추가 (VWorld 키가 없을 때도 직관적으로 보여주기 위함)
        const color = loc.type === 'nofly' ? '#ef4444' : (loc.type === 'airport' ? '#f59e0b' : '#3b82f6');
        L.geoJSON(circlePolygon, {
            style: {
                color: color,
                weight: 1.5,
                fillColor: color,
                fillOpacity: 0.1,
                interactive: false
            }
        }).addTo(map);
    });
}

// Update State Coords & Re-render Map UI
function updateLocation(lat, lng) {
    state.coords.lat = parseFloat(lat.toFixed(6));
    state.coords.lon = parseFloat(lng.toFixed(6));

    // Marker & Circle Position Move
    marker.setLatLng([state.coords.lat, state.coords.lon]);
    safetyRadiusCircle.setLatLng([state.coords.lat, state.coords.lon]);

    // Update Latitude/Longitude UI Text
    el.displayCoords.innerText = `위도: ${state.coords.lat}, 경도: ${state.coords.lon}`;
    
    // 주소 역지오코딩 & 기상/공역 데이터 새로고침
    reverseGeocode(state.coords.lat, state.coords.lon);
    refreshAllData();
}

// OpenStreetMap Nominatim API 역지오코딩 (위경도 -> 주소명)
async function reverseGeocode(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&accept-language=ko`, {
            headers: { 'User-Agent': 'DroneSkyguardApp/1.0' }
        });
        if (response.ok) {
            const data = await response.json();
            state.address = data.display_name || '알 수 없는 주소';
            el.search.value = data.address.road || data.address.suburb || data.address.city || state.address;
            el.searchClear.classList.remove('hidden');
        }
    } catch (e) {
        console.error('역지오코딩 실패:', e);
    }
}

// Event Listeners Set
function initEventListeners() {
    // API Modal Handlers
    el.btnApiConfig.addEventListener('click', () => {
        el.modalApiConfig.classList.remove('hidden');
    });

    el.btnCancelApi.addEventListener('click', closeModal);
    el.btnCloseModal.addEventListener('click', closeModal);
    
    el.btnSaveApi.addEventListener('click', () => {
        state.config.weatherKey = el.apiKeyWeather.value.trim();
        state.config.vworldKey = el.apiKeyVworld.value.trim();
        
        localStorage.setItem('skyguard_weather_key', state.config.weatherKey);
        localStorage.setItem('skyguard_vworld_key', state.config.vworldKey);
        
        closeModal();
        updateVworldWmsLayer();
        refreshAllData();
    });

    // Preset Select Dropdown Handler
    el.selectPreset.addEventListener('change', (e) => {
        const value = e.target.value;
        state.drone.preset = value;
        if (value !== 'custom') {
            const spec = dronePresets[value];
            state.drone = { preset: value, ...spec };
            updateDroneInputsUI();
        }
        saveDroneSpecs();
        refreshAllData();
    });

    // Drone Inputs Specific Listeners
    const inputs = [el.specWeight, el.specWind, el.specTempMin, el.specTempMax];
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            el.selectPreset.value = 'custom';
            state.drone.preset = 'custom';
            state.drone.weight = parseInt(el.specWeight.value) || 249;
            state.drone.maxWind = parseFloat(el.specWind.value) || 8;
            state.drone.tempMin = parseInt(el.specTempMin.value) || -10;
            state.drone.tempMax = parseInt(el.specTempMax.value) || 40;
            saveDroneSpecs();
            refreshAllData();
        });
    });

    el.specWaterproof.addEventListener('change', (e) => {
        state.drone.waterproof = e.target.checked;
        saveDroneSpecs();
        refreshAllData();
    });

    // Address Search Debouncing Event
    let debounceTimer = null;
    el.search.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        if (query.length > 0) {
            el.searchClear.classList.remove('hidden');
        } else {
            el.searchClear.classList.add('hidden');
            el.suggestions.classList.add('hidden');
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAddressSuggestions(query);
        }, 500);
    });

    // Clear Search Input
    el.searchClear.addEventListener('click', () => {
        el.search.value = '';
        el.searchClear.classList.add('hidden');
        el.suggestions.classList.add('hidden');
    });

    // Layer Controls Toggle Handlers
    el.layerVworld.addEventListener('change', () => {
        updateVworldWmsLayer();
    });

    el.layerCustomRadius.addEventListener('change', (e) => {
        if (e.target.checked) {
            safetyRadiusCircle.addTo(map);
        } else {
            map.removeLayer(safetyRadiusCircle);
        }
    });

    // Copy Coordinates Button
    el.btnCopyCoords.addEventListener('click', () => {
        const text = `${state.coords.lat}, ${state.coords.lon}`;
        navigator.clipboard.writeText(text).then(() => {
            const icon = el.btnCopyCoords.querySelector('i');
            el.btnCopyCoords.classList.add('text-emerald-400');
            setTimeout(() => {
                el.btnCopyCoords.classList.remove('text-emerald-400');
            }, 1000);
        });
    });

    // Mobile Tabs Switching Action
    if (el.tabMap && el.tabSpecs) {
        el.tabMap.addEventListener('click', () => {
            // Show Map, Hide Sidebar
            el.sidebarPanel.classList.add('hidden');
            el.sidebarPanel.classList.remove('flex');
            el.mapSection.classList.add('flex');
            el.mapSection.classList.remove('hidden');

            // Style Active Tab
            el.tabMap.classList.add('text-emerald-400', 'border-emerald-500');
            el.tabMap.classList.remove('text-slate-400', 'border-transparent');
            el.tabSpecs.classList.add('text-slate-400', 'border-transparent');
            el.tabSpecs.classList.remove('text-emerald-400', 'border-emerald-500');

            // Recalculate Map container layout size (Leaflet mobile rendering fix)
            if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                }, 100);
            }
        });

        el.tabSpecs.addEventListener('click', () => {
            // Hide Map, Show Sidebar
            el.mapSection.classList.add('hidden');
            el.mapSection.classList.remove('flex');
            el.sidebarPanel.classList.add('flex');
            el.sidebarPanel.classList.remove('hidden');

            // Style Active Tab
            el.tabSpecs.classList.add('text-emerald-400', 'border-emerald-500');
            el.tabSpecs.classList.remove('text-slate-400', 'border-transparent');
            el.tabMap.classList.add('text-slate-400', 'border-transparent');
            el.tabMap.classList.remove('text-emerald-400', 'border-emerald-500');
        });
    }

    // Path Simulator Control Listeners
    if (el.btnDrawMode) {
        el.btnDrawMode.addEventListener('click', toggleDrawMode);
        el.btnResetPath.addEventListener('click', resetPath);
        
        el.inputDefaultAlt.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.sim.defaultAltitude = val;
            el.displayDefaultAlt.innerText = `${val} m`;
            
            // 아직 개별 고도가 지정되지 않은 모든 웨이포인트 고도를 기본 고도로 일괄 업데이트
            state.sim.waypoints.forEach(wp => {
                if (!wp.isCustomAlt) {
                    wp.alt = val;
                }
            });
            refreshAllData();
        });

        el.inputSimSpeed.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.sim.speed = val;
            el.displaySimSpeed.innerText = `${val} m/s`;
        });

        el.btnPlaySim.addEventListener('click', startSimulation);
        el.btnPauseSim.addEventListener('click', pauseSimulation);
    }

    // Leaflet 팝업 슬라이더에서 호출할 수 있도록 글로벌 범위에 고도 변경 함수 노출
    window.updateWaypointAlt = (index, value) => {
        const alt = parseInt(value);
        if (state.sim.waypoints[index]) {
            state.sim.waypoints[index].alt = alt;
            state.sim.waypoints[index].isCustomAlt = true;
            
            const badge = document.getElementById(`pop-alt-val-${index}`);
            if (badge) badge.innerText = `${alt}m`;
            
            // 툴팁 팝업이 닫힐 때 마커 툴팁 레이블 등을 최신화
            const marker = state.sim.waypoints[index].marker;
            if (marker) {
                marker.setTooltipContent(`지점 #${index + 1}<br><span class="text-emerald-400 font-bold">${alt}m</span>`);
            }
            refreshAllData();
        }
    };
}

// Close Modal API Setup
function closeModal() {
    el.modalApiConfig.classList.add('hidden');
}

// Update UI forms based on State Spec Values
function updateDroneInputsUI() {
    el.specWeight.value = state.drone.weight;
    el.specWind.value = state.drone.maxWind;
    el.specTempMin.value = state.drone.tempMin;
    el.specTempMax.value = state.drone.tempMax;
    el.specWaterproof.checked = state.drone.waterproof;
}

// Save Drone Spec data in LocalStorage
function saveDroneSpecs() {
    localStorage.setItem('skyguard_drone_spec', JSON.stringify(state.drone));
}

// OSM Nominatim Suggestions Query
async function fetchAddressSuggestions(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=ko`, {
            headers: { 'User-Agent': 'DroneSkyguardApp/1.0' }
        });
        if (response.ok) {
            const data = await response.json();
            renderSuggestions(data);
        }
    } catch (e) {
        console.error('검색 데이터 로드 실패:', e);
    }
}

// Render Suggestions Dropdown list
function renderSuggestions(items) {
    el.suggestions.innerHTML = '';
    
    if (items.length === 0) {
        el.suggestions.classList.add('hidden');
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'px-4 py-3 border-b border-slate-800/60 cursor-pointer search-suggestion-item transition-all text-sm font-medium';
        div.innerText = item.display_name;
        
        div.addEventListener('click', () => {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            
            el.search.value = item.display_name;
            el.suggestions.classList.add('hidden');
            
            map.setView([lat, lon], 14);
            updateLocation(lat, lon);
        });

        el.suggestions.appendChild(div);
    });

    el.suggestions.classList.remove('hidden');
}

// Refresh Weather, Airspace, and Decision Panel
async function refreshAllData() {
    // 1. Weather Update
    await fetchWeatherData();
    
    // 2. Airspace & Rule Engine Run
    evaluateFlightConditions();
}

// Fetch Weather with 15-min Local Cache System (Cost/Quota Protection)
async function fetchWeatherData() {
    if (!state.config.weatherKey) {
        // API Key가 등록되지 않았을 경우, 데모모드로 작동하기 위한 가짜 데이터 공급
        state.weather = {
            temp: 22.5,
            windSpeed: 3.4,
            windDeg: 210,
            humidity: 60,
            weatherName: '맑음',
            sunrise: '05:24',
            sunset: '19:48',
            isDemo: true
        };
        updateWeatherUI();
        return;
    }

    // 좌표 간소화: 약 100m 그리드로 캐시 키 매핑 (소수점 3자리까지 반올림)
    const latKey = state.coords.lat.toFixed(3);
    const lonKey = state.coords.lon.toFixed(3);
    const cacheKey = `weather_${latKey}_${lonKey}`;

    const cachedDataString = localStorage.getItem(cacheKey);
    const now = Date.now();

    if (cachedDataString) {
        try {
            const cache = JSON.parse(cachedDataString);
            // 15분(900,000ms) 미만 캐싱 데이터가 존재한다면 재사용
            if (now - cache.timestamp < 15 * 60 * 1000) {
                state.weather = cache.data;
                updateWeatherUI();
                return;
            }
        } catch (e) {
            console.error('기상 데이터 캐시 로드 실패:', e);
        }
    }

    // 캐시가 없거나 만료된 경우 OpenWeatherMap API 호출
    showWeatherSkeletons(true);
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${state.coords.lat}&lon=${state.coords.lon}&appid=${state.config.weatherKey}&units=metric&lang=kr`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            
            // 데이터 가공 및 일출/일몰 포맷 설정
            const formatTime = (timestamp) => {
                const date = new Date(timestamp * 1000);
                return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            };

            const weatherInfo = {
                temp: Math.round(data.main.temp * 10) / 10,
                windSpeed: Math.round(data.wind.speed * 10) / 10,
                windDeg: data.wind.deg,
                humidity: data.main.humidity,
                weatherName: data.weather[0] ? data.weather[0].description : '맑음',
                sunrise: formatTime(data.sys.sunrise),
                sunset: formatTime(data.sys.sunset),
                rawSunrise: data.sys.sunrise,
                rawSunset: data.sys.sunset,
                timestamp: data.dt,
                isDemo: false
            };

            // 상태 업데이트 및 캐시에 보관
            state.weather = weatherInfo;
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: now,
                data: weatherInfo
            }));

            updateWeatherUI();
        } else {
            throw new Error('API 응답 에러');
        }
    } catch (e) {
        console.error('날씨 데이터 조회 에러:', e);
        // 장애 발생 시 Fallback 데모 값 세팅
        state.weather = {
            temp: 20.0,
            windSpeed: 4.0,
            windDeg: 90,
            humidity: 50,
            weatherName: '정보 없음 (장애)',
            sunrise: '--:--',
            sunset: '--:--',
            isDemo: true
        };
        updateWeatherUI();
    } finally {
        showWeatherSkeletons(false);
    }
}

// Skeleton Loader Toggle for Weather
function showWeatherSkeletons(show) {
    const fields = [el.weatherTemp, el.weatherWind, el.weatherRain, el.weatherSunrise, el.weatherSunset];
    fields.forEach(field => {
        if (show) {
            field.classList.add('skeleton', 'text-transparent');
        } else {
            field.classList.remove('skeleton', 'text-transparent');
        }
    });
}

// Render Weather values on Sidebar UI
function updateWeatherUI() {
    if (!state.weather) return;

    el.weatherTemp.innerText = state.weather.temp;
    el.weatherWind.innerText = state.weather.windSpeed;
    el.weatherRain.innerText = state.weather.weatherName;
    el.weatherHumidity.innerText = `습도: ${state.weather.humidity}%`;
    el.weatherSunrise.innerText = state.weather.sunrise;
    el.weatherSunset.innerText = state.weather.sunset;

    // Wind Direction Compass Arrow rotate
    const deg = state.weather.windDeg || 0;
    el.windArrow.style.transform = `rotate(${deg}deg)`;
    el.windDegText.innerText = `${getWindDirectionK(deg)} (${deg}°)`;
}

// Convert Degrees to Korean Wind Directions
function getWindDirectionK(deg) {
    if (deg >= 337.5 || deg < 22.5) return '북풍';
    if (deg >= 22.5 && deg < 67.5) return '북동풍';
    if (deg >= 67.5 && deg < 112.5) return '동풍';
    if (deg >= 112.5 && deg < 157.5) return '남동풍';
    if (deg >= 157.5 && deg < 202.5) return '남풍';
    if (deg >= 202.5 && deg < 247.5) return '남서풍';
    if (deg >= 247.5 && deg < 292.5) return '서풍';
    if (deg >= 292.5 && deg < 337.5) return '북서풍';
    return '바람 없음';
}

// Core Rules Engine - Flight Suitability Evaluator
function evaluateFlightConditions() {
    if (!state.weather) return;

    const reasons = [];
    let status = 'GREEN'; // Default: Flyable

    // 1. 공역(Airspace) 공간 정보 분석 (Turf.js Point-in-Polygon)
    const userPoint = turf.point([state.coords.lon, state.coords.lat]);
    let isInNoFlyZone = false;
    let isInAirportZone = false;
    let activeZoneName = '';

    demoAirspaces.features.forEach(feature => {
        const isInside = turf.booleanPointInPolygon(userPoint, feature);
        if (isInside) {
            const props = feature.properties;
            if (props.type === 'nofly') {
                isInNoFlyZone = true;
                activeZoneName = props.name;
            } else if (props.type === 'airport') {
                isInAirportZone = true;
                activeZoneName = props.name;
            }
        }
    });

    if (isInNoFlyZone) {
        status = 'RED';
        reasons.push({
            type: 'danger',
            text: `[공역 제한] 비행금지구역(${activeZoneName}) 내부입니다. 군/정부 승인 없이 비행 시 처벌 대상입니다.`
        });
    } else if (isInAirportZone) {
        status = 'RED';
        reasons.push({
            type: 'danger',
            text: `[공역 제한] 관제권(공항 반경 9.3km 이내, ${activeZoneName})입니다. 비행 승인 허가 없이는 일체의 드론 비행이 금지됩니다.`
        });
    }

    // 2. 풍량/풍속 분석
    const currentWind = state.weather.windSpeed;
    const maxWind = state.drone.maxWind;

    if (currentWind >= maxWind) {
        status = 'RED';
        reasons.push({
            type: 'danger',
            text: `[기상 악화] 실시간 풍속(${currentWind}m/s)이 드론 감내 한계(${maxWind}m/s)를 초과했습니다. 조종 불가 및 분실 위험이 매우 높습니다.`
        });
    } else if (currentWind >= maxWind * 0.7) {
        if (status !== 'RED') status = 'YELLOW';
        reasons.push({
            type: 'warning',
            text: `[기상 주의] 실시간 풍속(${currentWind}m/s)이 기체 감내 능력의 70%를 넘었습니다. 돌풍으로 인한 배터리 과소비 및 쏠림 현상에 주의하세요.`
        });
    }

    // 3. 온도 분석
    const currentTemp = state.weather.temp;
    const tempMin = state.drone.tempMin;
    const tempMax = state.drone.tempMax;

    if (currentTemp <= tempMin || currentTemp >= tempMax) {
        status = 'RED';
        reasons.push({
            type: 'danger',
            text: `[기상 악화] 현재 기온(${currentTemp}°C)이 기체 사양 범위를 초과했습니다. 배터리 급방전 또는 모터 손상이 발생할 수 있습니다.`
        });
    } else if (currentTemp <= tempMin + 3) {
        if (status !== 'RED') status = 'YELLOW';
        reasons.push({
            type: 'warning',
            text: `[저온 경고] 작동 최저 기온에 근접했습니다. 리튬 폴리머 배터리 셀이 조기 급방전될 수 있으니 충분히 예열 후 이륙하세요.`
        });
    }

    // 4. 강수/눈/우천 우천 상태 분석
    const weatherName = state.weather.weatherName;
    const isRaining = weatherName.includes('비') || weatherName.includes('소나기') || weatherName.includes('뇌우');
    const isSnowing = weatherName.includes('눈') || weatherName.includes('진눈깨비');

    if ((isRaining || isSnowing) && !state.drone.waterproof) {
        status = 'RED';
        reasons.push({
            type: 'danger',
            text: `[기상 악화] 현재 지역에 눈/비가 예보되어 있으나 기체 방수가 비활성화 상태입니다. 기기 내부 침수로 쇼트 및 추락의 우려가 있습니다.`
        });
    } else if ((isRaining || isSnowing) && state.drone.waterproof) {
        if (status !== 'RED') status = 'YELLOW';
        reasons.push({
            type: 'warning',
            text: `[우천 주의] 기체 방수가 지원되나, 카메라 렌즈 표면 가림, 센서 오작동 및 노면 미끄러짐으로 인한 조종 안정성 약화가 있을 수 있습니다.`
        });
    }

    // 5. 일출/일몰 야간 비행 검출
    const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });
    let isNight = false;

    if (state.weather.rawSunrise && state.weather.rawSunset) {
        const currentTime = Math.floor(Date.now() / 1000);
        isNight = (currentTime < state.weather.rawSunrise || currentTime > state.weather.rawSunset);
    } else {
        // Fallback 시간 파싱 비교
        isNight = (nowTimeStr < state.weather.sunrise || nowTimeStr > state.weather.sunset);
    }

    if (isNight) {
        if (status !== 'RED') status = 'YELLOW'; // 승인받은 불발광 기체 등 가능성은 있으나 주의 조치
        reasons.push({
            type: 'warning',
            text: `[야간 안전 주의] 현재 일몰 시간 이후 야간 비행 상태입니다. 야간 특별 비행 승인 보유 및 발광 장치(150m 이상 식별 가능) 부착 후 비행하십시오.`
        });
    }

    // 6. 무게 분류별 국내 항공법 적용 정보
    const w = state.drone.weight;
    if (w < 250) {
        reasons.push({
            type: 'info',
            text: `[항공안전법] 기체 무게 250g 미만인 경우 국토교통부 조종 자격 및 기체 신고 면제 대상입니다. 단, 비행 금지 구역과 관제권 내에서는 무게와 무관하게 비행 승인이 필요합니다.`
        });
    } else if (w >= 250 && w <= 2000) {
        reasons.push({
            type: 'info',
            text: `[항공안전법] 기체 무게 250g~2kg 구간은 4종 드론 온라인 교육 수료 자격증이 필수입니다. 비행 신청(드론 원스톱 민원)이 필요할 수 있습니다.`
        });
    } else {
        reasons.push({
            type: 'info',
            text: `[항공안전법] 2kg 초과 대형 드론은 기체 신고 및 필기/실기 면허 소지가 의무화되어 있습니다. 항시 비행 승인 및 촬영 허가를 완료 후 이륙하십시오.`
        });
    }

    // API 키 미제공 시 데모 모드 표시 추가
    if (state.weather.isDemo) {
        reasons.unshift({
            type: 'warning',
            text: `[데모 모드] 날씨 API Key 설정이 없어 데모 모드로 동작 중입니다. 실시간 데이터 기반 작동을 위해 상단 'API 설정'에서 날씨 키를 입력하세요.`
        });
    }

    // Update Decision UI Dashboard Panels
    updateDecisionPanelUI(status, reasons);
}

// Render Results on the bottom status board
function updateDecisionPanelUI(status, reasons) {
    // Reset status styles
    el.decisionIndicator.className = 'w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-500 relative bg-slate-950';
    el.decisionGlow.className = 'absolute inset-0 rounded-full scale-100 opacity-0 transition-all duration-500';

    let colorClass = '';
    let glowClass = '';
    let iconName = '';
    let statusText = '';

    switch (status) {
        case 'GREEN':
            colorClass = 'glow-pass';
            glowClass = 'pulse-glow-pass';
            iconName = 'check-circle';
            statusText = '비행 안전 가능';
            el.decisionStatusText.className = 'text-2xl font-bold font-outfit tracking-tight text-emerald-400';
            break;
        case 'YELLOW':
            colorClass = 'glow-warning';
            glowClass = 'pulse-glow-warning';
            iconName = 'alert-triangle';
            statusText = '주의비행 요망';
            el.decisionStatusText.className = 'text-2xl font-bold font-outfit tracking-tight text-amber-500';
            break;
        case 'RED':
            colorClass = 'glow-danger';
            glowClass = 'pulse-glow-danger';
            iconName = 'slash';
            statusText = '비행 절대 불가';
            el.decisionStatusText.className = 'text-2xl font-bold font-outfit tracking-tight text-red-500';
            break;
    }

    el.decisionIndicator.classList.add(colorClass);
    el.decisionGlow.classList.add(glowClass);
    el.decisionStatusText.innerText = statusText;

    // Change Lucide Icon dynamically
    el.decisionIcon.setAttribute('data-lucide', iconName);
    
    // Render list elements
    el.decisionReasonsList.innerHTML = '';
    reasons.forEach(reason => {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-2.5';
        
        let iconHtml = '';
        if (reason.type === 'danger') {
            li.classList.add('text-red-400');
            iconHtml = '<i data-lucide="shield-alert" class="w-4 h-4 shrink-0 mt-0.5"></i>';
        } else if (reason.type === 'warning') {
            li.classList.add('text-amber-400');
            iconHtml = '<i data-lucide="alert-circle" class="w-4 h-4 shrink-0 mt-0.5"></i>';
        } else if (reason.type === 'info') {
            li.classList.add('text-slate-400');
            iconHtml = '<i data-lucide="info" class="w-4 h-4 shrink-0 mt-0.5"></i>';
        }

        li.innerHTML = `${iconHtml}<span>${reason.text}</span>`;
        el.decisionReasonsList.appendChild(li);
    });

    // Re-create icons for dynamically inserted elements
    lucide.createIcons();
    triggerWindParticles();
}

// Map Dynamic Wind Particle Animations
function triggerWindParticles() {
    // Clean old wind lines
    const oldParticles = document.querySelectorAll('.wind-particle');
    oldParticles.forEach(p => p.remove());

    if (!state.weather || state.weather.windSpeed < 1.0) return;

    // Create particles based on wind speed
    const mapContainer = document.getElementById('map');
    const containerWidth = mapContainer.clientWidth;
    const containerHeight = mapContainer.clientHeight;
    
    // Wind properties
    const speed = Math.max(1, 15 - Math.round(state.weather.windSpeed * 1.5)); // speed indicator
    const angle = state.weather.windDeg || 0;
    
    // Drift distances (Math.cos/sin trigonometry for direction)
    const driftX = Math.round(Math.sin(angle * Math.PI / 180) * 300);
    const driftY = Math.round(-Math.cos(angle * Math.PI / 180) * 300);

    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        p.className = 'wind-particle';
        
        // Random positioning
        p.style.top = `${Math.random() * containerHeight}px`;
        p.style.left = `${Math.random() * containerWidth}px`;
        
        // Animation variables (Custom CSS Property variables)
        p.style.setProperty('--wind-deg', `${angle}deg`);
        p.style.setProperty('--drift-x', `${driftX}px`);
        p.style.setProperty('--drift-y', `${driftY}px`);
        p.style.setProperty('--speed', `${speed}s`);
        
        // Random delay to break linear pattern
        p.style.animationDelay = `${Math.random() * 5}s`;

        mapContainer.appendChild(p);
    }
}

// ==========================================
// 🧪 교과 융합 수학적/물리학적 모델 공식 엔진
// ==========================================

/**
 * 1. [화학II] 아레니우스 식(Arrhenius Equation) 기반 온도별 배터리 화학 효율 연산
 * 기온에 따른 화학 반응속도 변화율을 적분 모델에 반영
 */
function calcBatteryEfficiency(temp) {
    const Ea_over_R = 1500; // 활성화 에너지 상수 (드론 배터리 방전 특성 대입값)
    const T0 = 25 + 273.15; // 기준 온도 25°C (절대온도 298.15 K)
    const T = temp + 273.15; // 현재 기온의 절대온도 K

    // 아레니우스 공식 적용
    let efficiency = Math.exp(-Ea_over_R * (1 / T - 1 / T0));
    
    // 배터리 최고 효율 100% 및 최저 방전 한계선 설정 (안전 한계선 약 30%)
    efficiency = Math.min(1.0, Math.max(0.3, efficiency));
    return efficiency;
}

/**
 * 2. [물리학] 윈드 시어 파워 로(Wind Shear Power Law) 고도별 풍속 보정 연산
 * 지면 거칠기를 고려해 고도 상승 시 상공 풍속의 증가 추이 계산
 */
function calcWindShear(baseWind, altitude) {
    const alpha = 0.22; // 지면 거칠기 지수 (도심 외곽 복합 지표면 표준값)
    const z0 = 10; // 지상 기본 측정 고도 (10m)
    
    // Wind Shear Power Law 공식
    const correctedWind = baseWind * Math.pow(altitude / z0, alpha);
    return Math.round(correctedWind * 10) / 10;
}

// ==========================================
// 🗺️ Leaflet 경로 드로잉 & 웨이포인트 매니저
// ==========================================

// 경로 그리기 모드 온/오프 토글
function toggleDrawMode() {
    if (state.sim.isPlaying) {
        alert('시뮬레이션이 동작 중일 때는 경로를 수정할 수 없습니다.');
        return;
    }

    state.sim.isDrawing = !state.sim.isDrawing;
    
    if (state.sim.isDrawing) {
        el.btnDrawMode.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> 그리기 완료';
        el.btnDrawMode.classList.add('bg-slate-800', 'border-emerald-500/50');
        el.simStatusBadge.innerText = '경로 편집 중';
        el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20';
        map.getContainer().style.cursor = 'crosshair';
        
        // 안내 팝업 메시지
        L.popup()
            .setLatLng(map.getCenter())
            .setContent('<div class="p-1.5 text-xs font-semibold text-slate-300">지도를 차례대로 클릭하여 비행 경로(Waypoint)를 생성해 주세요.</div>')
            .openOn(map);
    } else {
        el.btnDrawMode.innerHTML = '<i data-lucide="edit-3" class="w-3.5 h-3.5 text-emerald-400"></i> 경로 그리기 모드';
        el.btnDrawMode.classList.remove('bg-slate-800', 'border-emerald-500/50');
        el.simStatusBadge.innerText = state.sim.waypoints.length > 0 ? '경로 대기 중' : '대기 중';
        el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400';
        map.getContainer().style.cursor = '';
        map.closePopup();
    }
    lucide.createIcons();
}

// 경로 그리기 모드일 때 지도를 클릭하면 좌표 점 추가
function handleMapClickForPath(e) {
    const latlng = e.latlng;
    addWaypoint(latlng);
}

// Waypoint 데이터 생성 및 맵 마커/팝업 바인딩
function addWaypoint(latlng) {
    const index = state.sim.waypoints.length;
    const alt = state.sim.defaultAltitude;

    // 커스텀 숫자 웨이포인트 마커 아이콘 설정
    const wpIcon = L.divIcon({
        className: 'waypoint-marker',
        html: `<div>${index + 1}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const wpMarker = L.marker(latlng, {
        draggable: true,
        icon: wpIcon
    }).addTo(map);

    // 마커 툴팁 설정 (마우스 호버 시 고도 정보 간략 표출)
    wpMarker.bindTooltip(`지점 #${index + 1}<br><span class="text-emerald-400 font-bold">${alt}m</span>`, {
        permanent: false,
        direction: 'top'
    });

    // 마커 클릭 시 팝업 설정 (개별 고도 조절용 슬라이더 UI 렌더링)
    const popupContent = `
        <div class="p-3 text-xs w-48 alt-popup select-none">
            <div class="flex justify-between font-bold mb-1.5 border-b border-slate-800 pb-1">
                <span class="text-slate-400">지점 #${index + 1} 고도 설정</span>
                <span class="text-emerald-400 font-bold" id="pop-alt-val-${index}">${alt}m</span>
            </div>
            <div class="space-y-2">
                <input type="range" min="10" max="150" value="${alt}" step="5" 
                       class="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                       oninput="window.updateWaypointAlt(${index}, this.value)">
                <span class="text-[9px] text-slate-500 block leading-tight">고도에 따라 Wind Shear에 의해 풍속 보정이 실시간으로 가해집니다.</span>
            </div>
        </div>
    `;
    
    wpMarker.bindPopup(popupContent, {
        className: 'alt-popup'
    });

    // 드래그 마커 이동 시 폴리라인 재렌더링
    wpMarker.on('drag', () => {
        state.sim.waypoints[index].lat = wpMarker.getLatLng().lat;
        state.sim.waypoints[index].lon = wpMarker.getLatLng().lng;
        renderPolyline();
    });

    // 새 웨이포인트 정보 배열 저장
    state.sim.waypoints.push({
        lat: latlng.lat,
        lon: latlng.lng,
        alt: alt,
        isCustomAlt: false,
        marker: wpMarker
    });

    renderPolyline();
}

// 획적 선(Polyline) 다시 그리기 및 상태 업데이트
function renderPolyline() {
    const latlngs = state.sim.waypoints.map(wp => [wp.lat, wp.lon]);

    if (state.sim.polyline) {
        state.sim.polyline.setLatLngs(latlngs);
    } else {
        state.sim.polyline = L.polyline(latlngs, {
            color: '#10b981',
            weight: 3,
            opacity: 0.6,
            className: 'neon-path-line'
        }).addTo(map);
    }

    // 웨이포인트 2개 이상일 때 시뮬레이션 시작 가능
    if (state.sim.waypoints.length >= 2) {
        el.btnPlaySim.disabled = false;
        el.btnPlaySim.classList.remove('opacity-30');
    } else {
        el.btnPlaySim.disabled = true;
    }

    // 하단 고도 프로필 차트 실시간 갱신
    renderAltitudeChart();
}

// 경로 에디터 전체 상태 초기화 및 맵 클린업
function resetPath() {
    stopSimulationLoop();
    
    // Remove Waypoints Markers
    state.sim.waypoints.forEach(wp => {
        if (wp.marker) map.removeLayer(wp.marker);
    });
    state.sim.waypoints = [];

    // Remove Polyline
    if (state.sim.polyline) {
        map.removeLayer(state.sim.polyline);
        state.sim.polyline = null;
    }

    // Remove Simulation Drone
    if (state.sim.droneMarker) {
        map.removeLayer(state.sim.droneMarker);
        state.sim.droneMarker = null;
    }

    // Reset simulator states
    state.sim.isPlaying = false;
    state.sim.isPaused = false;
    state.sim.currentStep = 0;
    state.sim.progress = 0;
    state.sim.accumulatedDist = 0;
    state.sim.batteryLevel = 100;

    // Reset UI
    el.btnPlaySim.disabled = true;
    el.btnPlaySim.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> 시뮬레이션 시작';
    el.btnPauseSim.classList.add('hidden');
    el.simTelemetry.classList.add('hidden');
    el.simStatusBadge.innerText = '대기 중';
    el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400';
    
    if (state.sim.isDrawing) {
        toggleDrawMode();
    }
    
    lucide.createIcons();
    renderAltitudeChart(); // 차트 초기화 (플레이스홀더 다시 표출)
    refreshAllData();
}

// ==========================================
// 🚀 실시간 가상 비행 시뮬레이터 구동 엔진
// ==========================================

// 시뮬레이터 주행 시작
function startSimulation() {
    if (state.sim.waypoints.length < 2) return;
    
    if (state.sim.isDrawing) {
        toggleDrawMode(); // 그리기 모드가 켜져있다면 끎
    }

    state.sim.isPlaying = true;
    state.sim.isPaused = false;
    el.simStatusBadge.innerText = '비행 주행 중';
    el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    
    el.btnPlaySim.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> 비행 중';
    el.btnPlaySim.disabled = true;
    el.btnPauseSim.classList.remove('hidden');
    el.simTelemetry.classList.remove('hidden');

    // 첫 주행 시작 시 배터리 및 누적거리 리셋
    if (state.sim.currentStep === 0 && state.sim.progress === 0) {
        state.sim.batteryLevel = 100;
        state.sim.accumulatedDist = 0;
        
        // 기존 드론 마커 제거 후 신규 가상드론 생성
        if (state.sim.droneMarker) map.removeLayer(state.sim.droneMarker);
        
        const startPt = state.sim.waypoints[0];
        const droneIcon = L.divIcon({
            className: 'sim-drone-marker',
            html: '<i data-lucide="navigation" class="w-4 h-4 text-emerald-400 rotate-45"></i>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        state.sim.droneMarker = L.marker([startPt.lat, startPt.lon], {
            icon: droneIcon,
            zIndexOffset: 1000
        }).addTo(map);
    }

    state.sim.lastTime = performance.now();
    state.sim.animationFrameId = requestAnimationFrame(runSimulationStep);
    
    lucide.createIcons();
}

// 시뮬레이터 일시 정지
function pauseSimulation() {
    state.sim.isPaused = true;
    stopSimulationLoop();
    
    el.btnPlaySim.disabled = false;
    el.btnPlaySim.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> 시뮬레이션 재개';
    el.btnPauseSim.classList.add('hidden');
    el.simStatusBadge.innerText = '일시 정지';
    el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20';
    lucide.createIcons();
}

// 애니메이션 루프 중지
function stopSimulationLoop() {
    if (state.sim.animationFrameId) {
        cancelAnimationFrame(state.sim.animationFrameId);
        state.sim.animationFrameId = null;
    }
}

// requestAnimationFrame 루프 콜백 (비행 틱)
function runSimulationStep(timestamp) {
    if (!state.sim.isPlaying || state.sim.isPaused) return;

    const dt = (timestamp - state.sim.lastTime) / 1000; // 초 단위 델타 타임
    state.sim.lastTime = timestamp;

    const waypoints = state.sim.waypoints;
    const currentIdx = state.sim.currentStep;

    if (currentIdx >= waypoints.length - 1) {
        // 비행 완료 처리
        finishSimulation();
        return;
    }

    const ptA = waypoints[currentIdx];
    const ptB = waypoints[currentIdx + 1];

    // 두 점 사이의 실제 물리적 거리 구하기 (L.LatLng의 distanceTo 함수 활용, m 단위)
    const latlngA = L.latLng(ptA.lat, ptA.lon);
    const latlngB = L.latLng(ptB.lat, ptB.lon);
    const segmentDistance = latlngA.distanceTo(latlngB);

    // 가상 주행 속도와 프레임 타임을 곱해 프레임당 이동 비율 누적
    const stepSpeed = state.sim.speed; // m/s
    const progressDelta = (stepSpeed * dt) / segmentDistance;
    state.sim.progress += progressDelta;

    // 실시간 이동 거리 누적 가산
    const frameDistance = stepSpeed * dt;
    state.sim.accumulatedDist += frameDistance;

    // 노드 이동 한계 도달 체크
    if (state.sim.progress >= 1.0) {
        state.sim.progress = 0;
        state.sim.currentStep++;
        state.sim.animationFrameId = requestAnimationFrame(runSimulationStep);
        return;
    }

    // 1. 드론 위치 보간 계산 (Interpolation)
    const curLat = ptA.lat + (ptB.lat - ptA.lat) * state.sim.progress;
    const curLon = ptA.lon + (ptB.lon - ptA.lon) * state.sim.progress;
    state.sim.droneMarker.setLatLng([curLat, curLon]);

    // 2. 고도 보간 및 실시간 기상 연산 (Wind Shear)
    const curAlt = ptA.alt + (ptB.alt - ptA.alt) * state.sim.progress;
    const baseWind = state.weather ? state.weather.windSpeed : 3.4;
    const shearWind = calcWindShear(baseWind, curAlt);

    // 3. 화학적 아레니우스 식 배터리 실시간 방전률 연산
    const temp = state.weather ? state.weather.temp : 20.0;
    const chemicalEfficiency = calcBatteryEfficiency(temp); // 저온 배터리 노화 효율 (0.3 ~ 1.0)
    
    // 바람에 저항하기 위해 드론이 소모하는 모터 전력 추가 계수 산출 (풍속에 정비례해 배터리 소모 가중)
    const windLoadFactor = 1.0 + (shearWind / state.drone.maxWind) * 0.4;
    
    // 기본 소모율: 5m/s 이동 시 초당 약 0.15% 기본 감소
    const baseDischargeRate = 0.15; 
    
    // 종합 소모율 = (기본 소모율 / 화학 효율) * 바람 부하 계수 * 시간 델타
    const battDrain = (baseDischargeRate / chemicalEfficiency) * windLoadFactor * dt;
    state.sim.batteryLevel = Math.max(0, state.sim.batteryLevel - battDrain);

    // 4. 실시간 위험 구역 충돌 검증 (Turf.js)
    const dronePoint = turf.point([curLon, curLat]);
    let collisionDetected = false;
    let collisionZoneName = '';

    demoAirspaces.features.forEach(feature => {
        if (turf.booleanPointInPolygon(dronePoint, feature)) {
            collisionDetected = true;
            collisionZoneName = feature.properties.name;
        }
    });

    // 5. 실시간 UI 텔레메트리 갱신
    el.telemetryDist.innerText = `${Math.round(state.sim.accumulatedDist)} m`;
    el.telemetryWind.innerText = `${shearWind} m/s (고도: ${Math.round(curAlt)}m)`;
    el.telemetryBatt.innerText = `${Math.round(state.sim.batteryLevel)} %`;
    el.telemetryBattBar.style.width = `${state.sim.batteryLevel}%`;

    // 하단 고도 프로필 차트에 현재 시뮬레이터 실시간 비행 위치 연동
    updateSimulationIndicator(state.sim.accumulatedDist);

    // 배터리 잔량에 따른 상태 색상 변화
    if (state.sim.batteryLevel < 20) {
        el.telemetryBatt.className = 'text-red-500 font-bold';
        el.telemetryBattBar.className = 'h-full bg-red-500 transition-all duration-200';
    } else if (state.sim.batteryLevel < 50) {
        el.telemetryBatt.className = 'text-amber-500 font-bold';
        el.telemetryBattBar.className = 'h-full bg-amber-500 transition-all duration-200';
    } else {
        el.telemetryBatt.className = 'text-emerald-400 font-bold';
        el.telemetryBattBar.className = 'h-full bg-emerald-500 transition-all duration-200';
    }

    // 6. 충돌 경고 및 배터리 방전 시 강제 비상 착륙 중단
    if (collisionDetected) {
        stopSimulationLoop();
        updateDecisionPanelUI('RED', [
            { type: 'danger', text: `[시뮬레이션 중단] 비행 제한/금지구역 침범 감지: ${collisionZoneName}` }
        ]);
        el.simStatusBadge.innerText = '침범 비상착륙';
        el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20';
        el.btnPlaySim.disabled = true;
        el.btnPauseSim.classList.add('hidden');
        return;
    }

    if (state.sim.batteryLevel <= 0) {
        stopSimulationLoop();
        updateDecisionPanelUI('RED', [
            { type: 'danger', text: '[시뮬레이션 중단] 배터리가 완전히 방전되어 기체가 추락했습니다.' }
        ]);
        el.simStatusBadge.innerText = '배터리 추락';
        el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20';
        el.btnPlaySim.disabled = true;
        el.btnPauseSim.classList.add('hidden');
        return;
    }

    // 다음 프레임 예약
    state.sim.animationFrameId = requestAnimationFrame(runSimulationStep);
}

// 시뮬레이션 성공적 완료 리포트 발행
function finishSimulation() {
    stopSimulationLoop();
    state.sim.isPlaying = false;
    state.sim.isPaused = false;
    
    // UI 재설정
    el.btnPlaySim.disabled = false;
    el.btnPlaySim.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i> 시뮬레이션 완료';
    el.btnPauseSim.classList.add('hidden');
    el.simStatusBadge.innerText = '주행 완료';
    el.simStatusBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

    // 종합 판단 대시보드 리포트에 최종 시뮬레이션 결과 표출
    const batt = Math.round(state.sim.batteryLevel);
    const dist = Math.round(state.sim.accumulatedDist);
    const temp = state.weather ? state.weather.temp : 20.0;
    
    const battEff = Math.round(calcBatteryEfficiency(temp) * 100);

    const reports = [
        { type: 'info', text: `[시뮬레이션 성공] 총 비행 거리 ${dist}m 주행 완료. 잔여 배터리: ${batt}%` },
        { type: 'info', text: `[배터리 분석] 화학적 아레니우스 식에 의한 저온 배터리 내부 효율은 기준치(25°C) 대비 ${battEff}% 수준으로 산출되었습니다.` }
    ];

    if (batt < 25) {
        updateDecisionPanelUI('YELLOW', [
            ...reports,
            { type: 'warning', text: '[위험 요인] 최종 목적지 도착 시 배터리가 안전 임계값(25%) 미만입니다. 복귀 비행을 감안해 배터리 팩을 용량이 큰 것으로 변경하거나 경로를 단축하세요.' }
        ]);
    } else {
        updateDecisionPanelUI('GREEN', reports);
    }
    
    // 드론 시뮬레이터 상태 0으로 복귀 (재시동 가능하도록)
    state.sim.currentStep = 0;
    state.sim.progress = 0;
    
    lucide.createIcons();
}

// ==========================================
// 📈 비행 고도 단면 프로필 그래프 에디터 엔진
// ==========================================

// SVG 기반 고도 단면 차트 실시간 드로잉
function renderAltitudeChart() {
    const waypoints = state.sim.waypoints;

    // 웨이포인트 2개 미만일 시 차트 비활성화
    if (waypoints.length < 2) {
        el.altProfileSvg.classList.add('hidden');
        el.altChartPlaceholder.classList.remove('hidden');
        return;
    }

    el.altProfileSvg.classList.remove('hidden');
    el.altChartPlaceholder.classList.add('hidden');

    // 차트 크기 가져오기 ( display: none 일 때 0으로 인식하는 문제 방지 )
    const rect = el.altProfileSvg.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    // 크기가 0일 경우, 부모 컨테이너 크기를 기반으로 Fallback 스케일 부여
    if (width === 0 || height === 0) {
        const parentRect = document.getElementById('alt-chart-container').getBoundingClientRect();
        width = parentRect.width ? (parentRect.width - 24) : 380;
        height = 68; // 기본 고도 차트 높이 Fallback
    }

    // 차트 여백 설정
    const margin = { top: 12, right: 18, bottom: 18, left: 24 };
    const plotWidth = Math.max(50, width - margin.left - margin.right);
    const plotHeight = Math.max(30, height - margin.top - margin.bottom);

    // 각 Waypoint 간 누적 거리 계산
    let totalDist = 0;
    const distances = [0];
    for (let i = 1; i < waypoints.length; i++) {
        const latlngA = L.latLng(waypoints[i-1].lat, waypoints[i-1].lon);
        const latlngB = L.latLng(waypoints[i].lat, waypoints[i].lon);
        totalDist += latlngA.distanceTo(latlngB);
        distances.push(totalDist);
    }
    
    // 비행 총거리가 0일 때 방지
    const safeTotalDist = totalDist || 1;

    // 각 지점별 SVG x, y 좌표 산출 (고도 0m ~ 160m 기준 스케일링)
    const coords = waypoints.map((wp, idx) => {
        const x = margin.left + (distances[idx] / safeTotalDist) * plotWidth;
        const y = height - margin.bottom - (wp.alt / 160) * plotHeight;
        return { x, y, alt: wp.alt };
    });

    // 1. Defs 그라디언트 정의
    const defs = `
        <defs>
            <linearGradient id="alt-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ef4444" stop-opacity="0.45" />
                <stop offset="100%" stop-color="#ef4444" stop-opacity="0.0" />
            </linearGradient>
        </defs>
    `;

    // 2. 가로 고도 축 레이블 및 수평 가이드선 그리기
    const altTicks = [50, 100, 150];
    let horizLines = '';
    altTicks.forEach(tickAlt => {
        const y = height - margin.bottom - (tickAlt / 160) * plotHeight;
        horizLines += `
            <line class="alt-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" />
            <text class="alt-axis-label" x="${margin.left - 4}" y="${y + 3}" text-anchor="end">${tickAlt}m</text>
        `;
    });

    // 3. 지상 기준선 (Base Line)
    const baseLineY = height - margin.bottom;
    const baseLine = `<line class="alt-base-line" x1="${margin.left}" y1="${baseLineY}" x2="${width - margin.right}" y2="${baseLineY}" />`;

    // 4. 세로 웨이포인트 점선 눈금 및 하단 레이블
    let vertLines = '';
    coords.forEach((coord, idx) => {
        vertLines += `
            <line class="alt-grid-line" x1="${coord.x}" y1="${margin.top}" x2="${coord.x}" y2="${baseLineY}" />
            <text class="alt-node-label" x="${coord.x}" y="${height - 4}">W${idx + 1}</text>
        `;
    });

    // 5. 고도 붉은 곡선(Polyline) 및 채우기 영역 데이터 조립
    const pathD = 'M ' + coords.map(c => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' L ');
    const fillD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${baseLineY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${baseLineY.toFixed(1)} Z`;

    const fillArea = `<path class="alt-fill-area" d="${fillD}" />`;
    const altCurve = `<path class="alt-curve" d="${pathD}" />`;

    // 6. 드래그 가능 노드 점(Circles) 렌더링
    let nodes = '';
    coords.forEach((coord, idx) => {
        nodes += `
            <circle class="alt-control-node" cx="${coord.x.toFixed(1)}" cy="${coord.y.toFixed(1)}" r="5" data-index="${idx}" />
        `;
    });

    // 7. 실시간 시뮬레이션 탐침선(Indicator Line/Circle)
    const indicator = `
        <line id="sim-indicator-line" class="alt-indicator-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${baseLineY}" style="display: none;" />
        <circle id="sim-indicator-circle" class="alt-indicator-circle" cx="${margin.left}" cy="${baseLineY}" style="display: none;" />
    `;

    // SVG 컨텐츠 주입
    el.altProfileSvg.innerHTML = defs + horizLines + baseLine + vertLines + fillArea + altCurve + nodes + indicator;

    // 드래그 마우스 및 터치 이벤트 바인딩
    initAltitudeChartDragEvents(margin, plotHeight, height);
}

// SVG 드래그 인터랙션 모듈 (마우스 & 터치 대응)
function initAltitudeChartDragEvents(margin, plotHeight, height) {
    let activeIndex = null;

    const getEventY = (e) => {
        const rect = el.altProfileSvg.getBoundingClientRect();
        if (e.touches && e.touches[0]) {
            return e.touches[0].clientY - rect.top;
        }
        return e.clientY - rect.top;
    };

    const startDrag = (e) => {
        const target = e.target;
        if (target.classList.contains('alt-control-node')) {
            activeIndex = parseInt(target.getAttribute('data-index'));
            state.sim.dragNodeIndex = activeIndex;
            target.classList.add('dragging');
            map.dragging.disable(); // 드래그 중에는 Leaflet 맵 드래그 방지
        }
    };

    const doDrag = (e) => {
        if (activeIndex === null) return;
        e.preventDefault();

        const y = getEventY(e);
        
        // Y좌표 역산출 -> 고도(10m ~ 150m) 매핑
        const zeroAltY = height - margin.bottom;
        const relativeY = zeroAltY - y;
        let alt = Math.round((relativeY / plotHeight) * 160);
        
        // 고도 범위 강제 클램핑 (10m ~ 150m)
        alt = Math.min(150, Math.max(10, alt));

        // 해당 웨이포인트 고도 값 실시간 업데이트
        if (state.sim.waypoints[activeIndex]) {
            state.sim.waypoints[activeIndex].alt = alt;
            state.sim.waypoints[activeIndex].isCustomAlt = true;

            // 지도상의 마커 툴팁 동기화 갱신
            const marker = state.sim.waypoints[activeIndex].marker;
            if (marker) {
                marker.setTooltipContent(`지점 #${activeIndex + 1}<br><span class="text-emerald-400 font-bold">${alt}m</span>`);
            }
            
            // 실시간 날씨 기반 룰 연산 갱신
            refreshAllData();
            
            // 차트 부드럽게 재렌더링
            renderAltitudeChart();
            
            // 드래그 중인 노드 스타일 유지
            const activeNode = el.altProfileSvg.querySelector(`.alt-control-node[data-index="${activeIndex}"]`);
            if (activeNode) activeNode.classList.add('dragging');
        }
    };

    const stopDrag = () => {
        if (activeIndex !== null) {
            const activeNode = el.altProfileSvg.querySelector(`.alt-control-node[data-index="${activeIndex}"]`);
            if (activeNode) activeNode.classList.remove('dragging');
            
            activeIndex = null;
            state.sim.dragNodeIndex = null;
            map.dragging.enable(); // 지도 드래그 원상복구
        }
    };

    // 마우스 이벤트 등록
    el.altProfileSvg.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);

    // 모바일 터치 이벤트 등록
    el.altProfileSvg.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', doDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);
}

// 시뮬레이션 비행 중 하단의 노란 탐침선 및 위치 동그라미 실시간 이동 처리
function updateSimulationIndicator(accumulatedDist) {
    const line = document.getElementById('sim-indicator-line');
    const circle = document.getElementById('sim-indicator-circle');
    
    if (!line || !circle || state.sim.waypoints.length < 2) return;

    // 보이기 처리
    line.style.display = 'block';
    circle.style.display = 'block';

    // 총 거리 계산
    let totalDist = 0;
    const distances = [0];
    for (let i = 1; i < state.sim.waypoints.length; i++) {
        const latlngA = L.latLng(state.sim.waypoints[i-1].lat, state.sim.waypoints[i-1].lon);
        const latlngB = L.latLng(state.sim.waypoints[i].lat, state.sim.waypoints[i].lon);
        totalDist += latlngA.distanceTo(latlngB);
        distances.push(totalDist);
    }
    const safeTotalDist = totalDist || 1;
    
    // 차트 레이아웃 픽셀 수치
    const rect = el.altProfileSvg.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 90;
    const margin = { top: 12, right: 18, bottom: 18, left: 24 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // 현재 진행률 비율에 맞는 X좌표 산출
    const ratio = Math.min(1.0, accumulatedDist / safeTotalDist);
    const curX = margin.left + ratio * plotWidth;

    // 현재 지점의 고도 선형 보간값 산출 (탐침 동그라미의 Y좌표 싱크용)
    let curAlt = state.sim.defaultAltitude;
    for (let i = 1; i < distances.length; i++) {
        if (accumulatedDist <= distances[i]) {
            const segDist = distances[i] - distances[i-1];
            const progress = segDist > 0 ? (accumulatedDist - distances[i-1]) / segDist : 0;
            const altA = state.sim.waypoints[i-1].alt;
            const altB = state.sim.waypoints[i].alt;
            curAlt = altA + (altB - altA) * progress;
            break;
        }
    }
    const curY = height - margin.bottom - (curAlt / 160) * plotHeight;

    // 탐침선 위치 업데이트
    line.setAttribute('x1', curX.toFixed(1));
    line.setAttribute('x2', curX.toFixed(1));
    
    // 탐침 동그라미 위치 업데이트
    circle.setAttribute('cx', curX.toFixed(1));
    circle.setAttribute('cy', curY.toFixed(1));
}


