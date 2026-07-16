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
    cachedWeather: {}
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
    layerCustomRadius: document.getElementById('layer-custom-radius')
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
        updateLocation(e.latlng.lat, e.latlng.lng);
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
