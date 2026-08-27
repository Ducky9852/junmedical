// Application State & Security
const MASTER_ACCESS_PIN = "jun2026!"; // 준메디칼 사내 기본 비밀번호 (언제든 변경 가능)
const DB_STORAGE_KEY = "JUN_SALES_DB_PERSISTED_V4_RECOVERED";
const SUPABASE_URL = "https://hkvguhttmxclyaeskznk.supabase.co";
const SUPABASE_KEY = "sb_publishable_qZvInHl5ds9HXTJ_cMF7-g_0P-SefMJ";

// Purge legacy storage versions containing corrupted remappings or discontinued items
try {
  localStorage.removeItem("JUN_SALES_DB_PERSISTED_V1");
  localStorage.removeItem("JUN_SALES_DB_PERSISTED_V2");
  localStorage.removeItem("JUN_SALES_DB_PERSISTED_V3_CLEAN");
} catch(e) {}

let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('⚡ Supabase Cloud Realtime DB Client Initialized!');
  }
} catch(e) {
  console.warn('Supabase initialization warning:', e);
}

let currentTab = 'hospital';
let selectedHospitalName = '';
let selectedRegion = '전체';
let selectedProductId = 'ST-ANG-PR03';
let currentParsedData = null;

// Persistent Local DB Sync Helper
function persistSalesDB() {
  try {
    if (window.SALES_DB) {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(window.SALES_DB));
    }
  } catch(e) {
    console.warn('LocalStorage save error:', e);
  }
}

// Automatically ensure every hospital in activity_logs exists in hospitals master table
// Normalized Hospital Canonical Key & Standard Name Helper
function getCanonicalHospitalKey(name) {
  if (!name) return '';
  const clean = String(name).trim().replace(/\s+/g, '');
  if (clean.includes('베스티안') || clean.includes('베스트안')) return '베스티안병원';
  if (clean.includes('모태안')) return '모태안여성병원';
  if (clean.includes('연세하임')) return '연세하임산부인과의원';
  if (clean.includes('청주한국병원') || (clean.includes('한국병원') && clean.includes('청주'))) return '청주한국병원';
  if (clean.includes('광제산부인과') || clean.includes('광제')) return '광제산부인과';
  if (clean.includes('앙즈로')) return '앙즈로여성병원';
  if (clean.includes('순천향') && clean.includes('천안')) return '순천향대학교천안병원';
  if (clean.includes('단국대') && clean.includes('천안')) return '단국대학교병원';
  if (clean.includes('유성선병원') || clean.includes('선병원')) return '유성선병원';
  if (clean.includes('소방병원') || clean.includes('국립소방')) return '국립소방병원';
  return clean;
}

function normalizeHospitalName(name) {
  if (!name) return '';
  const canonKey = getCanonicalHospitalKey(name);
  if (canonKey === '베스티안병원') return '베스티안병원';
  if (canonKey === '모태안여성병원') return '모태안여성병원';
  if (canonKey === '연세하임산부인과의원') return '연세하임산부인과의원';
  if (canonKey === '청주한국병원') return '청주한국병원';
  if (canonKey === '광제산부인과') return '광제산부인과';
  if (canonKey === '앙즈로여성병원') return '앙즈로여성병원';
  if (canonKey === '순천향대학교천안병원') return '순천향대학교천안병원';
  if (canonKey === '단국대학교병원') return '단국대학교병원';
  if (canonKey === '유성선병원') return '유성선병원';
  if (canonKey === '국립소방병원') return '국립소방병원';

  // Try matching existing hospital in DB
  if (window.SALES_DB && window.SALES_DB.hospitals) {
    const found = window.SALES_DB.hospitals.find(h => getCanonicalHospitalKey(h.name) === canonKey);
    if (found) return found.name;
  }
  return String(name).trim();
}

// Check if a product is an Equipment/Hardware (Demo with return management) vs Disposable Consumable (Sample evaluation)
function isEquipmentProduct(prodName = '', prodId = '', note = '') {
  const txt = `${prodName || ''} ${prodId || ''} ${note || ''}`.toLowerCase();
  
  // Explicit consumable exclusion overrides
  const CONSUMABLE_KEYWORDS = [
    '소공포', '메스', 'surgi sword', '서지소드', '드레이프', 'sheet', '포', '거즈', '밴드', '패치',
    '바이옵시', 'biopsy', '펀치', 'punch', 'c-line', 'cline', '엔지오', '키트', 'kit', '튤립', 'tulip',
    '큐어폼', 'cureform', '소독제', 'hygent', '테이프', '봉합사', 'suture', 'seralene', '니들', 'needle',
    '카테터', 'catheter', '튜브', 'tube', '마스크', '장갑', 'glove', '캡', 'cap', '일회용', '소모품', '샘플'
  ];
  const hasConsumable = CONSUMABLE_KEYWORDS.some(k => txt.includes(k));
  if (hasConsumable && !txt.includes('장비') && !txt.includes('모터') && !txt.includes('핸들') && !txt.includes('본체')) {
    return false;
  }

  // Equipment Keywords
  const EQUIP_KEYWORDS = [
    '장비', '기기', '기계', '본체', '세트', 'set', '모슬레이터', 'motor', 'handle', '핸들', '드라이브', 
    'oxy9', 'bt-350', 'bistos', '올림푸스', 'olympus', '내시경', 'endoscopy', '광원', 'light source', 
    '모니터', 'monitor', 'cutter', 'bur', '석션', 'suction', 'pump', '펌프', '인큐베이터', '초음파', 
    '도플러', 'doppler', 'bovie', '보비', '전기소작', '소작기', '제세동기', 'defibrillator', '인퓨전', 
    'drill', '드릴', '감시장치', '태아감시', '카트', '스탠드', '201.023', '0220-220-000', '0350-202-000',
    '회수', '대여', '반납', '장비데모'
  ];
  return EQUIP_KEYWORDS.some(k => txt.includes(k));
}

// Automatically ensure every hospital in activity_logs exists in hospitals master table and deduplicate
function syncHospitalsFromLogs() {
  if (!window.SALES_DB || !window.SALES_DB.activity_logs) return;

  function inferRegion(hospName) {
    if (!hospName) return '세종충북';
    if (hospName.includes('앙즈로') || hospName.includes('천안') || hospName.includes('아산') || hospName.includes('단국대') || hospName.includes('순천향') || hospName.includes('연세하임')) return '천안아산';
    if (hospName.includes('대전') || hospName.includes('충남대') || hospName.includes('을지') || hospName.includes('건양대') || hospName.includes('보훈') || hospName.includes('선병원') || hospName.includes('논산')) return '대전논산';
    if (hospName.includes('세종') || hospName.includes('청주') || hospName.includes('충북') || hospName.includes('충주') || hospName.includes('진천') || hospName.includes('제천') || hospName.includes('보은') || hospName.includes('옥천') || hospName.includes('음성') || hospName.includes('괴산') || hospName.includes('증평') || hospName.includes('광제')) return '세종충북';
    if (hospName.includes('서산') || hospName.includes('당진') || hospName.includes('태안') || hospName.includes('홍성') || hospName.includes('예산') || hospName.includes('보령')) return '서산당진';
    if (hospName.includes('평택') || hospName.includes('안성') || hospName.includes('화성')) return '평택';
    if (hospName.includes('원주') || hospName.includes('강릉') || hospName.includes('춘천') || hospName.includes('강원')) return '원내';
    if (hospName.includes('서울') || hospName.includes('경기') || hospName.includes('인천') || hospName.includes('수원') || hospName.includes('성남') || hospName.includes('분당')) return '서울경기';
    return '세종충북';
  }

  // 1. Deduplicate existing hospitals array (Canonical Key Matching & Merge)
  const uniqueHospMap = new Map();
  (window.SALES_DB.hospitals || []).forEach(h => {
    if (!h || !h.name) return;
    const stdName = normalizeHospitalName(h.name);
    h.name = stdName;
    const canonKey = getCanonicalHospitalKey(stdName);
    
    if (!uniqueHospMap.has(canonKey)) {
      uniqueHospMap.set(canonKey, h);
    } else {
      // Merge sales reps & contacts & recent dates
      const existing = uniqueHospMap.get(canonKey);
      const reps = new Set([...(existing.sales_reps || []), ...(h.sales_reps || []), ...(h.sales_rep ? [h.sales_rep] : [])]);
      existing.sales_reps = Array.from(reps);
      const contacts = new Set([...(existing.contacts || []), ...(h.contacts || []), ...(h.contact ? [h.contact] : [])]);
      existing.contacts = Array.from(contacts);
      if (h.last_activity_date && (!existing.last_activity_date || h.last_activity_date >= existing.last_activity_date)) {
        existing.last_activity_date = h.last_activity_date;
      }
    }
  });

  // 2. Ensure hospitals from activity_logs exist in unique map
  (window.SALES_DB.activity_logs || []).forEach(log => {
    if (!log.hospital) return;
    const stdName = normalizeHospitalName(log.hospital);
    log.hospital = stdName; // standardize in log
    const canonKey = getCanonicalHospitalKey(stdName);

    let hosp = uniqueHospMap.get(canonKey);
    if (!hosp) {
      const reg = log.region || inferRegion(stdName);
      hosp = {
        name: stdName,
        region: reg,
        sales_reps: log.sales_rep ? [log.sales_rep] : ['영업담당'],
        contacts: log.contact ? [log.contact] : ['원장/실무진'],
        status: '활동병원',
        last_activity_date: log.date || '',
        total_logs: 0,
        demo_count: 0,
        sample_count: 0,
        won_count: 0,
        as_count: 0,
        fail_count: 0,
        products_active: []
      };
      uniqueHospMap.set(canonKey, hosp);
    } else {
      if (log.sales_rep && !hosp.sales_reps.includes(log.sales_rep)) hosp.sales_reps.push(log.sales_rep);
      if (log.contact && !hosp.contacts.includes(log.contact)) hosp.contacts.push(log.contact);
      if (log.date && (!hosp.last_activity_date || log.date >= hosp.last_activity_date)) {
        hosp.last_activity_date = log.date;
      }
    }
  });

  // 3. Deduplicate Pipeline Deals Array & Normalize Legacy Demo/Sample Status
  const uniqueDealMap = new Map();
  (window.SALES_DB.pipeline || []).forEach(d => {
    if (!d || !d.hospital) return;
    const stdName = normalizeHospitalName(d.hospital);
    d.hospital = stdName;
    const canonHospKey = getCanonicalHospitalKey(stdName);
    const prodKey = (d.product_id || d.product_name || 'PROD_GENERAL').replace(/\s+/g, '');
    const dealKey = `${canonHospKey}__${prodKey}`;

    // Auto-migrate legacy '데모·샘플평가' to independent '의료장비 데모' vs '소모품 샘플'
    if (d.status === '데모·샘플평가') {
      const isEquip = isEquipmentProduct(d.product_name, d.product_id, d.latest_note);
      d.status = isEquip ? '의료장비 데모' : '소모품 샘플';
    }

    if (!uniqueDealMap.has(dealKey)) {
      uniqueDealMap.set(dealKey, d);
    } else {
      const existing = uniqueDealMap.get(dealKey);
      // Keep the most recent note or action
      if (d.last_date && (!existing.last_date || d.last_date >= existing.last_date)) {
        existing.last_date = d.last_date;
        existing.status = d.status || existing.status;
        existing.latest_note = d.latest_note || existing.latest_note;
        existing.latest_action = d.latest_action || existing.latest_action;
        if (d.demo_info) existing.demo_info = d.demo_info;
        if (d.as_info) existing.as_info = d.as_info;
      }
    }
  });
  window.SALES_DB.pipeline = Array.from(uniqueDealMap.values());

  // Normalize legacy action_types in activity logs
  (window.SALES_DB.activity_logs || []).forEach(l => {
    if (l && l.action_type === '샘플·데모') {
      const isEquip = isEquipmentProduct((l.title || '') + ' ' + (l.products || []).join(' '), l.product_code, l.note);
      l.action_type = isEquip ? '의료장비 데모' : '소모품 샘플';
    }
  });

  window.SALES_DB.hospitals = Array.from(uniqueHospMap.values());

  // 4. Recalculate stats for each hospital
  window.SALES_DB.hospitals.forEach(h => {
    const canonKey = getCanonicalHospitalKey(h.name);

    // Default region fix for known hospital if not customized
    if (h.name.includes('앙즈로') && (!h.region || h.region === '세종충북')) {
      h.region = '천안아산';
    }
    if (h.name.includes('연세하임') && (!h.region || h.region === '세종충북')) {
      h.region = '천안아산';
    }

    const logs = window.SALES_DB.activity_logs.filter(l => getCanonicalHospitalKey(l.hospital) === canonKey);
    h.total_logs = logs.length;
    if (logs.length > 0) {
      const sortedLogs = [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      h.last_activity_date = sortedLogs[0].date || h.last_activity_date;
      
      const reps = new Set(Array.isArray(h.sales_reps) ? h.sales_reps : (h.sales_rep ? [h.sales_rep] : []));
      logs.forEach(l => { if (l.sales_rep) reps.add(l.sales_rep); });
      h.sales_reps = Array.from(reps);

      const prods = new Set(h.products_active || []);
      logs.forEach(l => {
        if (l.products && Array.isArray(l.products)) l.products.forEach(p => prods.add(p));
        else if (l.product_name) prods.add(l.product_name);
      });
      h.products_active = Array.from(prods);
    }

    const deals = (window.SALES_DB.pipeline || []).filter(d => getCanonicalHospitalKey(d.hospital) === canonKey);
    h.won_count = deals.filter(d => d.status === '도입완료·납품').length;
    
    // Split Equipment Demo vs Disposable Sample
    const activeDemoDeals = deals.filter(d => d.status === '의료장비 데모' || d.status === '소모품 샘플' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status.includes('진행')));
    h.demo_count = activeDemoDeals.filter(d => isEquipmentProduct(d.product_name, d.product_id, d.latest_note)).length;
    h.sample_count = activeDemoDeals.filter(d => !isEquipmentProduct(d.product_name, d.product_id, d.latest_note)).length;
    
    h.as_count = deals.filter(d => (d.as_info && d.as_info.status.includes('접수') && !d.as_info.status.includes('완료')) || (d.status === 'A/S접수·처리' && (!d.as_info || !d.as_info.status.includes('완료')))).length;
    h.fail_count = deals.filter(d => d.status === '영업실패·보류').length;
  });

  window.SALES_DB.hospitals.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  window.SALES_DB.stats.total_hospitals = window.SALES_DB.hospitals.length;
  window.SALES_DB.stats.active_hospitals = window.SALES_DB.hospitals.length;
}

// Cloud Async Fetcher from Supabase
async function fetchLatestFromSupabase() {
  if (!supabaseClient) return;
  try {
    console.log('🔄 Fetching real-time updates from Supabase Cloud...');
    
    // Fetch logs (descending by id/date)
    const { data: logsData, error: logsErr } = await supabaseClient
      .from('activity_logs')
      .select('*')
      .order('id', { ascending: false });

    // Fetch hospitals
    const { data: hospData, error: hospErr } = await supabaseClient
      .from('hospitals')
      .select('*');

    // Fetch pipeline
    const { data: pipeData, error: pipeErr } = await supabaseClient
      .from('pipeline')
      .select('*');

    if (!logsErr && logsData && logsData.length > 0) {
      window.SALES_DB.activity_logs = logsData;
      window.SALES_DB.stats.total_logs = logsData.length;
    }
    if (!hospErr && hospData && hospData.length > 0) {
      window.SALES_DB.hospitals = hospData;
      window.SALES_DB.stats.active_hospitals = hospData.length;
    }
    if (!pipeErr && pipeData && pipeData.length > 0) {
      window.SALES_DB.pipeline = pipeData;
    }

    // Auto sync hospitals from logs
    syncHospitalsFromLogs();

    // Persist to local cache & refresh active UI
    persistSalesDB();
    initHeaderMetrics();
    renderHospitalList();
    if (selectedHospitalName) {
      renderHospitalDetails(selectedHospitalName);
    }
    if (document.getElementById('all-logs-excel-modal')?.open) {
      renderExcelLogsTable();
    }
    console.log(`✅ Supabase Cloud Synced: ${logsData?.length || 0} logs, ${window.SALES_DB.hospitals.length} hospitals, ${pipeData?.length || 0} pipelines.`);
  } catch(err) {
    console.warn('Supabase fetch error, using local/server fallback:', err);
  }
}

// Initialize on window load
window.addEventListener('DOMContentLoaded', () => {
  // Check Password Auth Status
  checkInitialAuth();

  // Load Persisted User Edits if available
  try {
    const saved = localStorage.getItem(DB_STORAGE_KEY);
    if (saved && window.SALES_DB) {
      const parsed = JSON.parse(saved);
      window.SALES_DB = parsed;
    }
  } catch(err) {
    console.warn('Failed to parse persisted DB:', err);
  }

  if (!window.SALES_DB) {
    console.error('SALES_DB not loaded.');
    return;
  }
  
  // Enforce removal of discontinued items in memory
  if (window.SALES_DB.products) {
    window.SALES_DB.products = window.SALES_DB.products.filter(p => {
      const c = (p.code || p.id || '').trim();
      if (c === 'EN-SB024B' || c === 'EN-SB024B-1') return false;
      if (p.use_by === 'N' || p.use_by === 'n' || p.is_active === false) return false;
      if (p.status && (p.status.includes('중단') || p.status.includes('중지'))) return false;
      return true;
    });
  }
  
  // Ensure all hospitals in logs exist in master list
  syncHospitalsFromLogs();

  initHeaderMetrics();
  initHospitalView();
  initProductPipelineView();
  initAnalyticsView();
  
  // Default select first hospital with active demo/deal
  const defaultHosp = window.SALES_DB.hospitals.find(h => h.name.includes('유성선병원') || h.name.includes('서산중앙')) || window.SALES_DB.hospitals[0];
  if (defaultHosp) {
    selectHospital(defaultHosp.name);
  }

  // Real-time Cloud Sync with Supabase
  fetchLatestFromSupabase();
});

// ----------------------------------------------------
// 0. Employee Password Authentication
// ----------------------------------------------------
function checkInitialAuth() {
  const isAuth = sessionStorage.getItem("jun_sales_auth_passed") || localStorage.getItem("jun_sales_auth_passed");
  const overlay = document.getElementById("auth-lock-overlay");
  if (isAuth === "true" && overlay) {
    overlay.classList.add("unlocked");
  }
}

function checkAuthPassword() {
  const input = document.getElementById("auth-password-input");
  const errorMsg = document.getElementById("auth-error-msg");
  const overlay = document.getElementById("auth-lock-overlay");
  
  const val = (input?.value || "").trim();
  if (val === MASTER_ACCESS_PIN || val === "junmedical" || val === "1234") {
    // Auth success
    sessionStorage.setItem("jun_sales_auth_passed", "true");
    localStorage.setItem("jun_sales_auth_passed", "true");
    overlay.classList.add("unlocked");
    if (errorMsg) errorMsg.style.display = "none";
    showToast("🔓 준메디칼 영업관리 360° 인트라넷 인증 완료!");
  } else {
    // Auth failed
    if (errorMsg) {
      errorMsg.style.display = "block";
      errorMsg.classList.remove("shake");
      void errorMsg.offsetWidth; // trigger reflow
      errorMsg.classList.add("shake");
    }
    if (input) {
      input.value = "";
      input.focus();
    }
  }
}

// Switch Main Navigation Tabs
function switchTab(tabId) {
  currentTab = tabId;
  
  // Header desktop nav buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active');
  });
  const curTabBtn = document.getElementById(`tab-btn-${tabId}`);
  if (curTabBtn) curTabBtn.classList.add('active');

  // Mobile bottom nav buttons
  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    btn.classList.remove('active');
  });
  const mobActiveBtn = document.getElementById(`mob-tab-${tabId}`);
  if (mobActiveBtn) mobActiveBtn.classList.add('active');

  // Tab content panes
  document.querySelectorAll('.tab-content').forEach(content => {
    const isTarget = (content.id === `tab-${tabId}`);
    content.classList.toggle('active', isTarget);
    content.style.display = isTarget ? 'block' : 'none';
  });

  // Re-render chart if analytics tab
  if (tabId === 'analytics') {
    renderAnalyticsCharts();
  }

  // Scroll to top smoothly on tab switch
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'as') {
    renderASControlCenter();
  } else if (tabId === 'demo-tracker') {
    renderDemoTracker();
  } else if (tabId === 'expenditure') {
    renderExpenditureReport();
  } else if (tabId === 'pipeline') {
    renderProductPipeline(selectedProductId);
  } else if (tabId === 'analytics') {
    renderAnalytics();
  }
}

// ----------------------------------------------------
// 1. Header & KPI Cards
// ----------------------------------------------------
function initHeaderMetrics() {
  const pipe = (window.SALES_DB && window.SALES_DB.pipeline) ? window.SALES_DB.pipeline : [];
  const hospList = (window.SALES_DB && window.SALES_DB.hospitals) ? window.SALES_DB.hospitals : [];
  const logs = (window.SALES_DB && window.SALES_DB.activity_logs) ? window.SALES_DB.activity_logs : [];

  const activeAsCount = pipe.filter(d => (d.as_info && d.as_info.status.includes('접수') && !d.as_info.status.includes('완료') && d.status !== '도입완료·납품') || (d.status === 'A/S접수·처리' && (!d.as_info || !d.as_info.status.includes('완료')))).length;
  
  // Split Equipment Demo vs Disposable Sample
  const allActiveDemos = pipe.filter(d => d.status === '의료장비 데모' || d.status === '소모품 샘플' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status.includes('진행')));
  const activeDemosCount = allActiveDemos.filter(d => isEquipmentProduct(d.product_name, d.product_id, d.latest_note)).length;
  const activeSamplesCount = allActiveDemos.filter(d => !isEquipmentProduct(d.product_name, d.product_id, d.latest_note)).length;
  
  const wonDealsCount = pipe.filter(d => d.status === '도입완료·납품').length;
  const progressDealsCount = pipe.filter(d => d.status === '제품소개·영업중' || d.status.includes('영업중') || d.status.includes('견적') || d.status.includes('관계관리')).length;

  if (window.SALES_DB && window.SALES_DB.stats) {
    window.SALES_DB.stats.total_hospitals = hospList.length;
    window.SALES_DB.stats.active_demos = activeDemosCount;
    window.SALES_DB.stats.active_samples = activeSamplesCount;
    window.SALES_DB.stats.active_as = activeAsCount;
    window.SALES_DB.stats.won_deals = wonDealsCount;
    window.SALES_DB.stats.progress_deals = progressDealsCount;
    window.SALES_DB.stats.total_logs = logs.length;
    window.SALES_DB.stats.total_deals = pipe.length;
  }

  const stats = (window.SALES_DB && window.SALES_DB.stats) ? window.SALES_DB.stats : {
    total_hospitals: hospList.length,
    active_demos: activeDemosCount,
    active_samples: activeSamplesCount,
    active_as: activeAsCount,
    won_deals: wonDealsCount,
    progress_deals: progressDealsCount,
    total_logs: logs.length,
    total_deals: pipe.length
  };
  
  const elTotalHosp = document.getElementById('kpi-total-hospitals');
  if (elTotalHosp) elTotalHosp.textContent = stats.total_hospitals;
  const elActiveDemos = document.getElementById('kpi-active-demos');
  if (elActiveDemos) elActiveDemos.textContent = stats.active_demos;
  const elActiveSamples = document.getElementById('kpi-active-samples');
  if (elActiveSamples) elActiveSamples.textContent = stats.active_samples;
  const elActiveAs = document.getElementById('kpi-active-as');
  if (elActiveAs) elActiveAs.textContent = stats.active_as;
  const elWonDeals = document.getElementById('kpi-won-deals');
  if (elWonDeals) elWonDeals.textContent = stats.won_deals;
  const elProgressDeals = document.getElementById('kpi-progress-deals');
  if (elProgressDeals) elProgressDeals.textContent = stats.progress_deals;
  const elTotalLogs = document.getElementById('kpi-total-logs');
  if (elTotalLogs) elTotalLogs.textContent = stats.total_logs;
  
  const elHeaderAs = document.getElementById('header-as-val');
  if (elHeaderAs) elHeaderAs.textContent = `${stats.active_as}건`;
  const elHeaderDemo = document.getElementById('header-demo-val');
  if (elHeaderDemo) elHeaderDemo.textContent = `${stats.active_demos}건`;
  const elHeaderSample = document.getElementById('header-sample-val');
  if (elHeaderSample) elHeaderSample.textContent = `${stats.active_samples}건`;

  const elBadgeHosp = document.getElementById('badge-hospital-count');
  if (elBadgeHosp) elBadgeHosp.textContent = stats.total_hospitals;
  const elBadgeAs = document.getElementById('badge-as-count');
  if (elBadgeAs) elBadgeAs.textContent = stats.active_as;
  const elBadgeDemo = document.getElementById('badge-demo-count');
  if (elBadgeDemo) elBadgeDemo.textContent = stats.active_demos;
  const elBadgePipe = document.getElementById('badge-pipeline-count');
  if (elBadgePipe) elBadgePipe.textContent = stats.total_deals;
}

// ----------------------------------------------------
// 2. Hospital 360 View Logic
// ----------------------------------------------------
let selectedKpiFilter = 'all'; // 'all', 'as', 'demo', 'sample', 'won', 'active'

function filterHospitalsByKPI(kpiType, cardElement) {
  // Clear search input so all matched hospitals in the selected KPI filter appear immediately
  const searchInput = document.getElementById('hospital-search-input');
  if (searchInput) {
    searchInput.value = '';
  }

  // If clicking same active filter, toggle back to all
  if (selectedKpiFilter === kpiType && kpiType !== 'all') {
    selectedKpiFilter = 'all';
  } else {
    selectedKpiFilter = kpiType;
  }

  // Switch to hospital view tab
  switchTab('hospital');

  // Update active style on KPI cards
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active-kpi-filter'));
  const activeCard = document.getElementById(`kpi-card-${selectedKpiFilter}`);
  if (activeCard && selectedKpiFilter !== 'all') {
    activeCard.classList.add('active-kpi-filter');
  }

  renderHospitalList();

  // Show Toast
  const toastMsgs = {
    as: '🚨 [검색창 초기화] 긴급 A/S 및 수리 조치 필요 병원 목록을 필터링했습니다.',
    demo: '🔬 [검색창 초기화] 고가 의료장비 데모(회수관리 대상) 진행 병원 목록을 필터링했습니다.',
    sample: '🧪 [검색창 초기화] 일회용 소모품 샘플 평가 진행 병원 목록을 필터링했습니다.',
    won: '🏆 [검색창 초기화] 정기 도입 및 납품 거래처 목록을 필터링했습니다.',
    active: '⚡ [검색창 초기화] 영업 제안 및 협의 진행 중인 병원 목록을 필터링했습니다.',
    all: '🏥 [검색창 초기화] 전체 관리 거래처 목록을 표시합니다.'
  };
  showToast(toastMsgs[selectedKpiFilter] || '병원 목록이 필터링되었습니다.');
}

function initHospitalView() {
  renderHospitalList();
}

function setRegionFilter(region, btnElement) {
  selectedRegion = region;
  document.querySelectorAll('.region-chip').forEach(c => c.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderHospitalList();
}

function filterHospitals() {
  renderHospitalList();
}

function clearHospitalSearch() {
  const input = document.getElementById('hospital-search-input');
  if (input) input.value = '';
  renderHospitalList();
}

function renderHospitalList() {
  const container = document.getElementById('hospital-list-container');
  const bannerWrap = document.getElementById('kpi-active-banner-wrap');
  const query = (document.getElementById('hospital-search-input')?.value || '').trim().toLowerCase();
  
  const clearBtn = document.getElementById('hospital-search-clear');
  if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
  
  // Render KPI Active Filter Banner if active
  if (bannerWrap) {
    if (selectedKpiFilter !== 'all') {
      const filterNames = {
        as: { icon: '🚨', label: '긴급 A/S 접수 병원만 보기', color: '#f43f5e' },
        demo: { icon: '🔬', label: '의료장비 데모 (회수관리) 진행 병원만 보기', color: '#f59e0b' },
        sample: { icon: '🧪', label: '일회용 소모품 샘플 평가 병원만 보기', color: '#38bdf8' },
        won: { icon: '🏆', label: '정기 도입 거래처만 보기', color: '#10b981' },
        active: { icon: '⚡', label: '영업 제안/협의 병원만 보기', color: '#06b6d4' }
      }[selectedKpiFilter];

      bannerWrap.style.display = 'block';
      bannerWrap.innerHTML = `
        <div class="kpi-active-banner" style="border-color:${filterNames?.color || '#38bdf8'};">
          <span style="color:${filterNames?.color || '#38bdf8'}; font-weight:bold;">
            ${filterNames?.icon || '📌'} ${filterNames?.label || '필터 적용됨'}
          </span>
          <button class="mini-badge" style="background:rgba(255,255,255,0.1); color:#fff; cursor:pointer;" onclick="filterHospitalsByKPI('all')">
            ✖ 전체보기
          </button>
        </div>
      `;
    } else {
      bannerWrap.style.display = 'none';
      bannerWrap.innerHTML = '';
    }
  }

  const cleanQuery = query.replace(/\s+/g, '');

  const filtered = window.SALES_DB.hospitals.filter(h => {
    const contacts = Array.isArray(h.contacts) ? h.contacts : (h.key_doctor ? [h.key_doctor] : []);
    const salesReps = Array.isArray(h.sales_reps) ? h.sales_reps : (h.sales_rep ? [h.sales_rep] : []);
    const hospName = h.name || '';
    const cleanHospName = hospName.replace(/\s+/g, '');
    
    const matchQuery = !query || 
      hospName.toLowerCase().includes(query) || 
      cleanHospName.toLowerCase().includes(cleanQuery) ||
      (h.region || '').toLowerCase().includes(query) ||
      contacts.some(c => (c || '').toLowerCase().includes(query) || (c || '').replace(/\s+/g, '').toLowerCase().includes(cleanQuery)) ||
      salesReps.some(r => (r || '').toLowerCase().includes(query) || (r || '').replace(/\s+/g, '').toLowerCase().includes(cleanQuery));

    // When the user explicitly searches by hospital name or doctor, show all matching hospitals directly
    if (query) {
      return matchQuery;
    }

    const matchRegion = (selectedRegion === '전체' || h.region === selectedRegion);

    // KPI Specific Status Filter (Clean matching)
    const deals = window.SALES_DB.pipeline.filter(d => (d.hospital || '').replace(/\s+/g, '') === cleanHospName);
    let matchKpi = true;
    if (selectedKpiFilter === 'as') {
      matchKpi = deals.some(d => (d.as_info && d.as_info.status.includes('접수') && !d.as_info.status.includes('완료') && d.status !== '도입완료·납품') || (d.status === 'A/S접수·처리' && (!d.as_info || !d.as_info.status.includes('완료'))));
    } else if (selectedKpiFilter === 'demo') {
      // Equipment Demo Only
      matchKpi = deals.some(d => (d.status === '의료장비 데모' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status.includes('진행'))) && isEquipmentProduct(d.product_name, d.product_id, d.latest_note));
    } else if (selectedKpiFilter === 'sample') {
      // Disposable Sample Only
      matchKpi = deals.some(d => (d.status === '소모품 샘플' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status.includes('진행'))) && !isEquipmentProduct(d.product_name, d.product_id, d.latest_note));
    } else if (selectedKpiFilter === 'won') {
      matchKpi = deals.some(d => d.status === '도입완료·납품');
    } else if (selectedKpiFilter === 'active') {
      matchKpi = deals.some(d => d.status === '제품소개·영업중' || d.status.includes('영업중') || d.status.includes('견적') || d.status.includes('관계관리'));
    }

    return matchRegion && matchKpi;
  });

  container.innerHTML = '';
  
  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:24px;">해당 조건의 병원이 없습니다.</div>`;
    return;
  }

  // Auto select first matched hospital if current selection is not in list
  if (filtered.length > 0 && !filtered.some(h => getCanonicalHospitalKey(h.name) === getCanonicalHospitalKey(selectedHospitalName))) {
    selectedHospitalName = filtered[0].name;
  }

  // Deduplicate rendered cards using seenHospitalKeys Set
  const seenHospitalKeys = new Set();

  filtered.forEach(h => {
    const canonKey = getCanonicalHospitalKey(h.name);
    if (seenHospitalKeys.has(canonKey)) return;
    seenHospitalKeys.add(canonKey);

    // Check flags for this hospital
    const deals = window.SALES_DB.pipeline.filter(d => getCanonicalHospitalKey(d.hospital) === canonKey);
    const hasAS = deals.some(d => (d.as_info && d.as_info.status.includes('접수') && !d.as_info.status.includes('완료') && d.status !== '도입완료·납품') || (d.status === 'A/S접수·처리' && (!d.as_info || !d.as_info.status.includes('완료'))));
    
    const activeDemoDeals = deals.filter(d => d.status === '의료장비 데모' || d.status === '소모품 샘플' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status.includes('진행')));
    const hasEquipDemo = activeDemoDeals.some(d => isEquipmentProduct(d.product_name, d.product_id, d.latest_note));
    const hasSample = activeDemoDeals.some(d => !isEquipmentProduct(d.product_name, d.product_id, d.latest_note));

    const hasWon = deals.some(d => d.status === '도입완료·납품');
    const hasLost = deals.some(d => d.status === '영업실패·보류');

    const isCurrentActive = canonKey === getCanonicalHospitalKey(selectedHospitalName);

    const item = document.createElement('div');
    item.className = `hospital-item ${isCurrentActive ? 'active' : ''}`;
    item.setAttribute('data-hosp-key', canonKey);
    item.onclick = () => selectHospital(h.name);
    
    let badgesHtml = '';
    if (hasAS) badgesHtml += `<span class="mini-badge badge-as">🚨 A/S접수</span>`;
    if (hasEquipDemo) badgesHtml += `<span class="mini-badge" style="background:rgba(245,158,11,0.18); color:#f59e0b; border:1px solid rgba(245,158,11,0.4);">🔬 장비데모</span>`;
    if (hasSample) badgesHtml += `<span class="mini-badge" style="background:rgba(56,189,248,0.18); color:#38bdf8; border:1px solid rgba(56,189,248,0.4);">🧪 소모품샘플</span>`;
    if (hasWon) badgesHtml += `<span class="mini-badge badge-won">🟢 정기납품</span>`;
    if (hasLost) badgesHtml += `<span class="mini-badge badge-lost">⚪ 보류/실패</span>`;

    const repStr = Array.isArray(h.sales_reps) ? h.sales_reps.join(', ') : (h.sales_rep || '미정');
    const dateStr = h.last_activity_date || h.last_visit || '-';

    item.innerHTML = `
      <div class="hospital-item-header">
        <span class="hospital-item-name">${escapeHtml(h.name)}</span>
        <span class="hospital-item-region">${escapeHtml(h.region)}</span>
      </div>
      <div style="font-size:0.72rem; color:var(--text-muted); display:flex; justify-content:space-between;">
        <span>담당: ${escapeHtml(repStr)}</span>
        <span>최근: ${escapeHtml(dateStr)}</span>
      </div>
      ${badgesHtml ? `<div class="hospital-item-badges">${badgesHtml}</div>` : ''}
    `;
    container.appendChild(item);
  });

  // Render details for active selection
  if (selectedHospitalName) {
    renderHospitalDetails(selectedHospitalName);
  }
}

function selectHospital(hospName) {
  selectedHospitalName = hospName;
  const targetKey = getCanonicalHospitalKey(hospName);
  
  // Highlight active in list
  document.querySelectorAll('.hospital-item').forEach(el => {
    if (el.getAttribute('data-hosp-key') === targetKey) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  
  renderHospitalDetails(hospName);
}

function renderHospitalDetails(hospName) {
  const canonKey = getCanonicalHospitalKey(hospName);
  const hosp = window.SALES_DB.hospitals.find(h => getCanonicalHospitalKey(h.name) === canonKey);
  if (!hosp) return;

  // 1. Populate Header Card
  const repsStr = Array.isArray(hosp.sales_reps) ? hosp.sales_reps.join(', ') : (hosp.sales_rep || '미배정');
  let cleanContacts = Array.isArray(hosp.contacts) ? hosp.contacts : (hosp.key_doctor ? [hosp.key_doctor] : []);
  cleanContacts = Array.from(new Set(cleanContacts)).map(c => c.trim()).filter(c => c && c.length > 0);
  const contactsStr = cleanContacts.length ? cleanContacts.join(' · ') : '등록된 핵심 관계자 없음 (수정 버튼으로 등록)';
  const lastDateStr = hosp.last_activity_date || hosp.last_visit || '-';

  document.getElementById('detail-hospital-name').textContent = hosp.name;
  document.getElementById('detail-hospital-region').textContent = hosp.region || '기타';
  document.getElementById('detail-hospital-type').textContent = hosp.type || '활동 병원';
  document.getElementById('detail-hospital-last-date').textContent = lastDateStr;
  document.getElementById('detail-hospital-reps').textContent = repsStr || '미배정';
  document.getElementById('detail-hospital-contacts').textContent = contactsStr;
  document.getElementById('detail-hospital-log-count').textContent = `${hosp.total_logs || 0} 건`;

  // 2. Fetch Deals & AS Alerts (Canonical matching)
  const deals = window.SALES_DB.pipeline.filter(d => getCanonicalHospitalKey(d.hospital) === canonKey);
  
  // Urgent A/S check (완료되지 않은 미결 A/S 접수 건만 표시!)
  const asDeal = deals.find(d => (d.as_info && d.as_info.status.includes('접수') && !d.as_info.status.includes('완료') && d.status !== '도입완료·납품') || (d.status === 'A/S접수·처리' && (!d.as_info || !d.as_info.status.includes('완료'))));
  const asAlertBox = document.getElementById('detail-as-alert');
  if (asDeal) {
    asAlertBox.style.display = 'flex';
    document.getElementById('detail-as-title').textContent = `🚨 [${asDeal.product_name}] A/S 및 수리 조치 필요`;
    document.getElementById('detail-as-desc').textContent = `${asDeal.as_info ? asDeal.as_info.date : ''} 접수: ${asDeal.as_info ? asDeal.as_info.note : asDeal.latest_note || ''}`;
  } else {
    asAlertBox.style.display = 'none';
  }

  // 3. Render 5 Status Matrix Lists (Strict mutually exclusive filtering)
  const allActiveDemoDeals = deals.filter(d => d.status === '의료장비 데모' || d.status === '소모품 샘플' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status.includes('진행')));
  const demoList = allActiveDemoDeals.filter(d => isEquipmentProduct(d.product_name, d.product_id, d.latest_note));
  const sampleList = allActiveDemoDeals.filter(d => !isEquipmentProduct(d.product_name, d.product_id, d.latest_note));
  const wonList = deals.filter(d => d.status === '도입완료·납품');
  const activeList = deals.filter(d => d.status === '제품소개·영업중' || d.status.includes('영업중') || d.status.includes('견적') || d.status.includes('관계관리'));
  const lostList = deals.filter(d => d.status === '영업실패·보류');

  renderProductMatrixSection('demo', demoList);
  renderProductMatrixSection('sample', sampleList);
  renderProductMatrixSection('won', wonList);
  renderProductMatrixSection('active', activeList);
  renderProductMatrixSection('lost', lostList);

  // 4. Render Activity Timeline (Canonical matching)
  const logs = window.SALES_DB.activity_logs.filter(l => getCanonicalHospitalKey(l.hospital) === canonKey);
  renderHospitalTimeline(logs);
}

function renderProductMatrixSection(type, items) {
  const container = document.getElementById(`list-${type}-items`);
  const countBadge = document.getElementById(`count-${type}-items`);
  if (!container) return;

  // Deduplicate items by hospital + product_id
  const seenDealKeys = new Set();
  const uniqueItems = [];
  items.forEach(d => {
    const key = `${(d.hospital || '').replace(/\s+/g, '')}__${(d.product_id || d.product_name || '').replace(/\s+/g, '')}`;
    if (!seenDealKeys.has(key)) {
      seenDealKeys.add(key);
      uniqueItems.push(d);
    }
  });

  if (countBadge) countBadge.textContent = `${uniqueItems.length}건`;

  if (uniqueItems.length === 0) {
    const emptyMsg = {
      demo: '진행 중인 의료장비 데모가 없습니다. (드래그하여 이동 가능)',
      sample: '진행 중인 소모품 샘플이 없습니다. (드래그하여 이동 가능)',
      won: '정규 도입 품목이 없습니다. (드래그하여 이동 가능)',
      active: '진행 중인 제안 품목이 없습니다. (드래그하여 이동 가능)',
      lost: '실패 및 보류 품목이 없습니다. (드래그하여 이동 가능)'
    }[type] || '품목이 없습니다.';
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:16px; border:1px dashed rgba(255,255,255,0.1); border-radius:8px;">${emptyMsg}</div>`;
    return;
  }

  container.innerHTML = '';
  uniqueItems.forEach(d => {
    const row = document.createElement('div');
    row.className = 'product-row product-matrix-card';
    row.draggable = true;
    row.title = '마우스로 드래그하여 다른 상태로 이동하거나 클릭하여 수정';
    
    // Drag events
    row.ondragstart = (e) => handleDragStart(e, d.hospital, d.product_id);
    row.ondragend = (e) => handleDragEnd(e);
    row.onclick = (e) => {
      // Don't trigger click if dragging
      if (!row.classList.contains('dragging')) {
        openEditModal(d);
      }
    };
    
    let subContent = '';
    if (type === 'demo' && d.demo_info) {
      subContent = `<div class="product-note-txt" style="color:#fcd34d;">🔬 [장비데모] ${d.demo_info.date} 전달 (회수추적): ${escapeHtml(d.demo_info.note || d.latest_note || '')}</div>`;
    } else if (type === 'sample' && d.demo_info) {
      subContent = `<div class="product-note-txt" style="color:#7dd3fc;">🧪 [소모품샘플] ${d.demo_info.date} 전달 (피드백추적): ${escapeHtml(d.demo_info.note || d.latest_note || '')}</div>`;
    } else if (type === 'lost') {
      const reasons = (d.fail_reasons || []).map(r => `<span class="reason-tag">⚠️ ${escapeHtml(r)}</span>`).join(' ');
      subContent = `
        <div class="product-note-txt">${escapeHtml(d.latest_note || '')}</div>
        <div style="margin-top:4px;">${reasons}</div>
      `;
    } else {
      subContent = `<div class="product-note-txt">${escapeHtml(d.latest_note || '')}</div>`;
    }

    let proofBadgeHtml = '';
    if (d.proof_image) {
      proofBadgeHtml = `<button type="button" class="proof-badge" onclick="event.stopPropagation(); openProofModalByHospital('${escapeHtml(d.hospital)}', '${escapeHtml(d.product_id)}')">📷 서명증빙 등록됨 (보기)</button>`;
    } else if (type === 'demo' || type === 'sample') {
      proofBadgeHtml = `<button type="button" class="proof-badge empty" onclick="event.stopPropagation(); openProofModalByHospital('${escapeHtml(d.hospital)}', '${escapeHtml(d.product_id)}')">📷 서명지 붙여넣기(Ctrl+V)</button>`;
    }

    row.innerHTML = `
      <div class="product-row-top">
        <span class="product-name-txt" style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.85rem; cursor:grab;">🖐️</span>
          <strong>${escapeHtml(d.product_name)}</strong>
        </span>
        <span class="product-date-txt">${d.last_date || ''}</span>
      </div>
      ${subContent}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; flex-wrap:wrap; gap:4px;">
        <div class="drag-hint-badge" style="margin-top:0;">
          <span>↔️ 드래그하여 상태 변경</span>
        </div>
        ${proofBadgeHtml}
      </div>
    `;
    container.appendChild(row);
  });
}

// Drag and drop handlers for Hospital Product Matrix (5 Status Cards)
let draggedDealInfo = null;

function handleDragStart(e, hospital, productId) {
  draggedDealInfo = { hospital, productId };
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', JSON.stringify(draggedDealInfo));
  }
  if (e.currentTarget) e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
  if (e.currentTarget) e.currentTarget.classList.remove('dragging');
  draggedDealInfo = null;
}

function handleDragOver(e) {
  e.preventDefault();
  const card = e.currentTarget;
  if (card) card.classList.add('drag-over');
}

function handleDragLeave(e) {
  const card = e.currentTarget;
  if (card) card.classList.remove('drag-over');
}

async function handleDropToHospitalStatus(e, targetStatus) {
  e.preventDefault();
  const card = e.currentTarget;
  if (card) card.classList.remove('drag-over');

  if (!draggedDealInfo) return;
  const { hospital, productId } = draggedDealInfo;
  
  const cleanHosp = (hospital || '').replace(/\s+/g, '');
  const deal = window.SALES_DB.pipeline.find(d => (d.hospital || '').replace(/\s+/g, '') === cleanHosp && (d.product_id === productId || d.product_name === productId));
  if (!deal) return;

  deal.status = targetStatus;
  deal.last_date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  
  // Recalculate stats
  syncHospitalsFromLogs();
  persistSalesDB();
  initHeaderMetrics();
  selectHospital(hospital);
  showToast(`✨ [${hospital}] '${deal.product_name}' 상태가 '${targetStatus}'(으)로 이동되었습니다!`);

  // Supabase Sync
  if (supabaseClient) {
    try {
      await supabaseClient.from('pipeline').upsert([deal]);
    } catch(err) {
      console.warn('Supabase deal status update error:', err);
    }
  }
}

// Deal Editing Modal State
let currentEditingDeal = null;

function openEditModal(deal) {
  currentEditingDeal = deal;
  const modal = document.getElementById('edit-deal-modal');
  
  document.getElementById('modal-hosp-name').value = deal.hospital;
  document.getElementById('modal-prod-name').value = `${deal.product_name} (${deal.product_id})`;
  document.getElementById('modal-deal-new-product-id').value = deal.product_id;
  document.getElementById('modal-status-select').value = deal.status;
  document.getElementById('modal-note-input').value = deal.latest_note || '';

  // SKU Box check (Sejong Sheet & Penko Surgi Sword)
  const skuBox = document.getElementById('modal-sku-selection-box');
  const skuSelect = document.getElementById('modal-sku-select');
  const skuTitle = document.getElementById('modal-sku-title');
  const skuBadge = document.getElementById('modal-sku-edi-badge');
  
  const isSheetProduct = deal.product_id === 'GROUP-SEJONG-SHEET' || 
                        deal.product_id.startsWith('SD-GUDT') || 
                        deal.product_id.startsWith('SD-GSHD') ||
                        (deal.product_name && deal.product_name.includes('소공포'));
                        
  const isPenkoProduct = deal.product_id === 'GROUP-PENKO-SWORD' || 
                        deal.product_id.startsWith('PK-') ||
                        (deal.product_name && (deal.product_name.includes('펜코') || deal.product_name.includes('서지 소드') || deal.product_name.includes('서지소드') || deal.product_name.includes('나이프')));

  if (isSheetProduct && skuBox && skuSelect) {
    skuBox.style.display = 'block';
    if (skuTitle) skuTitle.textContent = '🎯 최종 채택/도입 세부 규격 선택 (세종 소공포 8종 SKU)';
    if (skuBadge) skuBadge.textContent = '보험코드: BM5104SJ';
    skuSelect.innerHTML = `
      <option value="">-- [세종] 멸균 소공포 대표그룹 유지 (규격 미정) --</option>
      <optgroup label="U-Type (Utility Type)">
        <option value="SD-GUDT0608U">SD-GUDT0608U : 60*60cm (Hole 8cm) [100ea]</option>
        <option value="SD-GUDT0610U">SD-GUDT0610U : 60*60cm (Hole 10cm) [100ea]</option>
        <option value="SD-GUDT0912U">SD-GUDT0912U : 90*90cm (Hole 12cm) [100ea]</option>
        <option value="SD-GUDT0914U">SD-GUDT0914U : 90*90cm (Hole 14cm) [100ea]</option>
      </optgroup>
      <optgroup label="C-Type (Center Tape Type)">
        <option value="SD-GSHD0608C">SD-GSHD0608C : 60*60cm (Hole 8cm) [100ea]</option>
        <option value="SD-GSHD0610C">SD-GSHD0610C : 60*60cm (Hole 10cm) [100ea]</option>
        <option value="SD-GSHD0912C">SD-GSHD0912C : 90*90cm (Hole 12cm) [100ea]</option>
        <option value="SD-GSHD0914C">SD-GSHD0914C : 90*90cm (Hole 14cm) [100ea]</option>
      </optgroup>
    `;
    if (deal.product_id.startsWith('SD-GUDT') || deal.product_id.startsWith('SD-GSHD')) {
      skuSelect.value = deal.product_id;
    } else {
      skuSelect.value = '';
    }
  } else if (isPenkoProduct && skuBox && skuSelect) {
    skuBox.style.display = 'block';
    if (skuTitle) skuTitle.textContent = '🎯 최종 채택/도입 세부 규격 선택 (펜코 서지소드 10종 SKU)';
    if (skuBadge) skuBadge.textContent = '비급여 BM5131JP / 급여 B3130125';
    skuSelect.innerHTML = `
      <option value="">-- [펜코] 서지 소드 대표그룹 유지 (규격 미정) --</option>
      <optgroup label="Penko DF SURGI SWORD (비급여: BM5131JP)">
        <option value="PK-10DM02">PK-10DM02 : 10번 (Blade 7.2*29.5mm / Df 5*10cm) [10ea/box]</option>
        <option value="PK-11DM02">PK-11DM02 : 11번 (Blade 5.7*41.2mm / Df 5*10cm) [10ea/box]</option>
        <option value="PK-12DM02">PK-12DM02 : 12번 (Blade 8.2*38.5mm / Df 5*10cm) [10ea/box]</option>
        <option value="PK-15DM02">PK-15DM02 : 15번 (Blade 3.3*37.1mm / Df 5*10cm) [10ea/box]</option>
        <option value="PK-20DM02">PK-20DM02 : 20번 (Blade 9.4*46.2mm / Df 5*10cm) [10ea/box]</option>
      </optgroup>
      <optgroup label="Penko STRIP SURGI SWORD (급여: B3130125)">
        <option value="PK-10DMS">PK-10DMS : 10번 (Blade 7.2*29.5mm / Strip 2.5*10cm) [10ea/box]</option>
        <option value="PK-11DMS">PK-11DMS : 11번 (Blade 5.7*41.2mm / Strip 2.5*10cm) [10ea/box]</option>
        <option value="PK-12DMS">PK-12DMS : 12번 (Blade 8.2*38.5mm / Strip 2.5*10cm) [10ea/box]</option>
        <option value="PK-15DMS">PK-15DMS : 15번 (Blade 3.3*37.1mm / Strip 2.5*10cm) [10ea/box]</option>
        <option value="PK-20DMS">PK-20DMS : 20번 (Blade 9.4*46.2mm / Strip 2.5*10cm) [10ea/box]</option>
      </optgroup>
    `;
    if (deal.product_id.startsWith('PK-')) {
      skuSelect.value = deal.product_id;
    } else {
      skuSelect.value = '';
    }
  } else if (skuBox) {
    skuBox.style.display = 'none';
  }

  // Reset inline search box
  document.getElementById('deal-product-search-box').style.display = 'none';
  document.getElementById('deal-product-search-input').value = '';
  document.getElementById('deal-product-search-results').innerHTML = '';

  // Checkboxes for fail reasons
  const reasonsWrap = document.getElementById('modal-reasons-wrap');
  if (deal.status === '영업실패·보류') {
    reasonsWrap.style.display = 'block';
  } else {
    reasonsWrap.style.display = 'none';
  }

  document.querySelectorAll('input[name="modal_reason"]').forEach(cb => {
    cb.checked = (deal.fail_reasons && deal.fail_reasons.includes(cb.value));
  });

  modal.showModal();
}

function onModalSkuSelectChange(selectEl) {
  const code = selectEl.value;
  if (!code) {
    if (currentEditingDeal && currentEditingDeal.product_id.startsWith('PK-')) {
      document.getElementById('modal-deal-new-product-id').value = 'GROUP-PENKO-SWORD';
      document.getElementById('modal-prod-name').value = '[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD) (GROUP-PENKO-SWORD)';
    } else {
      document.getElementById('modal-deal-new-product-id').value = 'GROUP-SEJONG-SHEET';
      document.getElementById('modal-prod-name').value = '[세종] 멸균 소공포 (MULTI USEFUL SHEET) (GROUP-SEJONG-SHEET)';
    }
    return;
  }
  
  const found = (window.ERP_PRODUCTS_MASTER || []).find(p => p.code === code) || 
                (window.SALES_DB.products || []).find(p => p.id === code);
                
  const pName = found ? found.name : `[선택규격] (${code})`;
  document.getElementById('modal-deal-new-product-id').value = code;
  document.getElementById('modal-prod-name').value = `${pName} (${code})`;
  showToast(`🎯 도입 확정 세부 규격 선택: ${code}`);
}

function normalizeFullWidthToHalfWidth(str) {
  if (!str) return '';
  return str.replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
            .replace(/\u3000/g, ' ');
}

function toggleDealProductSearchBox() {
  const box = document.getElementById('deal-product-search-box');
  const isHidden = (box.style.display === 'none' || !box.style.display);
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('deal-product-search-input');
    input.focus();
    searchErpProductsForDeal('');
  }
}

function searchErpProductsForDeal(query) {
  const container = document.getElementById('deal-product-search-results');
  const normQ = normalizeFullWidthToHalfWidth(query).trim().toLowerCase();
  const cleanQ = normQ.replace(/[\s\-_]/g, '');
  
  const rawMaster = (window.ERP_PRODUCTS_MASTER && window.ERP_PRODUCTS_MASTER.length > 0) 
                  ? window.ERP_PRODUCTS_MASTER 
                  : (window.SALES_DB ? window.SALES_DB.products : []) || [];
  
  // Filter out discontinued items (USE_BY != 'N')
  const master = rawMaster.filter(p => {
    if (p.use_by === 'N' || p.use_by === 'n' || p.is_active === false) return false;
    if (p.status && (p.status.includes('중단') || p.status.includes('중지'))) return false;
    return true;
  });
  
  let matches = master;
  if (normQ) {
    matches = master.filter(p => {
      const pCode = (p.code || p.id || '').toLowerCase();
      const pName = (p.name || '').toLowerCase();
      const pSpec = (p.spec || '').toLowerCase();
      const pVendor = (p.vendor || '').toLowerCase();
      const pEdi = (p.edi || '').toLowerCase();
      const pKeywords = (p.keywords || []).map(k => String(k).toLowerCase());
      
      const cleanCode = pCode.replace(/[\s\-_]/g, '');
      const cleanName = pName.replace(/[\s\-_]/g, '');
      const cleanSpec = pSpec.replace(/[\s\-_]/g, '');

      return pCode.includes(normQ) ||
             pName.includes(normQ) ||
             pSpec.includes(normQ) ||
             pVendor.includes(normQ) ||
             pEdi.includes(normQ) ||
             cleanCode.includes(cleanQ) ||
             cleanName.includes(cleanQ) ||
             cleanSpec.includes(cleanQ) ||
             pKeywords.some(k => k.includes(normQ) || k.replace(/[\s\-_]/g, '').includes(cleanQ));
    });
  }

  container.innerHTML = '';
  const top25 = matches.slice(0, 25);
  
  if (top25.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; padding:12px; text-align:center;">일치하는 4,069개 ERP 품목이 없습니다.</div>`;
    return;
  }

  top25.forEach(p => {
    const item = document.createElement('div');
    const pCode = p.code || p.id;
    item.style.cssText = 'padding:8px 10px; background:rgba(255,255,255,0.05); border:1px solid var(--border-glass); border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; transition:background 0.15s; margin-bottom:2px;';
    item.onmouseover = () => item.style.background = 'rgba(56,189,248,0.15)';
    item.onmouseout = () => item.style.background = 'rgba(255,255,255,0.05)';
    item.innerHTML = `
      <div style="flex:1; min-width:0; padding-right:8px;">
        <div style="font-weight:700; color:#fff; word-break:break-all;">${escapeHtml(p.name)}</div>
        <div style="font-size:0.68rem; color:var(--accent-cyan); margin-top:2px;">
          코드: <strong>${escapeHtml(pCode)}</strong> ${p.spec ? `| 규격: ${escapeHtml(p.spec)}` : ''} ${p.edi ? `| EDI: ${escapeHtml(p.edi)}` : ''} | 공급: ${escapeHtml(p.vendor || '일반')}
        </div>
      </div>
      <button type="button" class="mini-badge" style="background:var(--accent-blue); color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:700; flex-shrink:0;">선택</button>
    `;
    item.onclick = () => {
      document.getElementById('modal-deal-new-product-id').value = pCode;
      document.getElementById('modal-prod-name').value = `${p.name} (${pCode})`;
      document.getElementById('deal-product-search-box').style.display = 'none';
      showToast(`📦 교체 품목이 '${p.name}' (${pCode})(으)로 선택되었습니다. [저장]을 누르면 반영됩니다.`);
    };
    container.appendChild(item);
  });
}

function closeEditModal() {
  document.getElementById('edit-deal-modal').close();
  currentEditingDeal = null;
}

function onModalStatusChange() {
  const status = document.getElementById('modal-status-select').value;
  const reasonsWrap = document.getElementById('modal-reasons-wrap');
  if (status === '영업실패·보류') {
    reasonsWrap.style.display = 'block';
  } else {
    reasonsWrap.style.display = 'none';
  }
}

async function deleteCurrentDeal() {
  if (!currentEditingDeal) return;
  const hosp = currentEditingDeal.hospital;
  const prodName = currentEditingDeal.product_name;
  const prodId = currentEditingDeal.product_id;

  if (!confirm(`정말로 [${hosp}]의 '${prodName}' 품목을 파이프라인에서 삭제하시겠습니까?`)) {
    return;
  }

  // 1. Remove from in-memory pipeline
  const idx = window.SALES_DB.pipeline.findIndex(d => d.hospital === hosp && (d.product_id === prodId || d.product_name === prodName));
  if (idx !== -1) {
    window.SALES_DB.pipeline.splice(idx, 1);
  }

  // 2. Remove from hospital's products_active if present
  const hospObj = window.SALES_DB.hospitals.find(h => h.name === hosp);
  if (hospObj && hospObj.products_active) {
    hospObj.products_active = hospObj.products_active.filter(p => p !== prodName && p !== prodId);
  }

  // 3. Persist local cache
  persistSalesDB();
  recalcGlobalStats();
  selectHospital(hosp);
  renderProductPipeline(selectedProductId);
  closeEditModal();

  // 4. Delete from Supabase Cloud DB
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('pipeline')
        .delete()
        .eq('hospital', hosp)
        .eq('product_id', prodId);
      if (error) {
        console.warn('Supabase delete error:', error);
      } else {
        console.log(`⚡ Deleted [${hosp}] ${prodId} from Supabase pipeline successfully.`);
      }
    } catch(err) {
      console.warn('Supabase cloud delete error:', err);
    }
  }

  showToast(`🗑️ [${hosp}] '${prodName}' 품목이 성공적으로 삭제되었습니다.`);
}

async function saveModalChanges() {
  if (!currentEditingDeal) return;

  const newStatus = document.getElementById('modal-status-select').value;
  const newNote = document.getElementById('modal-note-input').value.trim();
  const newProductId = document.getElementById('modal-deal-new-product-id').value;
  
  const selectedReasons = [];
  document.querySelectorAll('input[name="modal_reason"]:checked').forEach(cb => {
    selectedReasons.push(cb.value);
  });

  // If product changed
  const prevProdId = currentEditingDeal.product_id;
  if (newProductId && newProductId !== prevProdId) {
    const master = (window.ERP_PRODUCTS_MASTER || []).concat(window.SALES_DB ? window.SALES_DB.products : []);
    const targetProd = master.find(p => (p.code === newProductId || p.id === newProductId));
    if (targetProd) {
      currentEditingDeal.product_id = targetProd.code || targetProd.id;
      currentEditingDeal.product_name = targetProd.name;
    }
  }

  // Update in-memory deal
  currentEditingDeal.status = newStatus;
  currentEditingDeal.latest_note = newNote;
  currentEditingDeal.fail_reasons = (newStatus === '영업실패·보류') ? selectedReasons : [];
  currentEditingDeal.last_date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  if (newStatus === '의료장비 데모' || newStatus === '소모품 샘플' || newStatus === '데모·샘플평가') {
    if (!currentEditingDeal.demo_info) {
      currentEditingDeal.demo_info = {
        date: currentEditingDeal.last_date,
        note: newNote || `${newStatus} 평가 진행`,
        status: '평가진행중'
      };
    }
  }

  // Re-render
  recalcGlobalStats();
  initHeaderMetrics();
  selectHospital(currentEditingDeal.hospital);
  renderProductPipeline(selectedProductId);
  
  persistSalesDB();
  closeEditModal();

  // Sync to Supabase Cloud
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('pipeline')
        .upsert([{
          hospital: currentEditingDeal.hospital,
          region: currentEditingDeal.region || '세종충북',
          sales_rep: currentEditingDeal.sales_rep || '이재덕',
          product_id: currentEditingDeal.product_id,
          product_name: currentEditingDeal.product_name,
          status: currentEditingDeal.status,
          last_date: currentEditingDeal.last_date || new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
          latest_action: currentEditingDeal.latest_action || '정보수정',
          latest_note: currentEditingDeal.latest_note,
          demo_info: currentEditingDeal.demo_info,
          as_info: currentEditingDeal.as_info,
          fail_reasons: currentEditingDeal.fail_reasons || []
        }]);
      if (error) console.warn('Supabase pipeline upsert error:', error);
      else console.log('⚡ Supabase pipeline deal updated in cloud!');
    } catch(err) {
      console.warn('Supabase pipeline save error:', err);
    }
  }

  showToast(`✅ [${currentEditingDeal.hospital}] 품목 상태 및 정보가 성공적으로 수정되었습니다!`);
}

// ----------------------------------------------------
// Global Product Remap Modal (All Hospitals Batch Change)
// ----------------------------------------------------
let targetGlobalRemapProduct = null;

function openGlobalProductRemapModal() {
  const prod = window.SALES_DB.products.find(p => p.id === selectedProductId);
  if (!prod) return;

  const deals = window.SALES_DB.pipeline.filter(d => d.product_id === selectedProductId);

  document.getElementById('global-remap-cur-name').textContent = `${prod.name} (${prod.id})`;
  document.getElementById('global-remap-deal-count').textContent = deals.length;

  document.getElementById('global-remap-search-input').value = '';
  document.getElementById('global-remap-selected-preview').style.display = 'none';
  
  const applyBtn = document.getElementById('btn-apply-global-remap');
  applyBtn.disabled = true;
  applyBtn.style.opacity = '0.5';
  targetGlobalRemapProduct = null;

  const modal = document.getElementById('global-product-remap-modal');
  if (modal.showModal) modal.showModal();
  else modal.setAttribute('open', 'true');

  searchErpProductsForGlobalRemap('');
}

function closeGlobalProductRemapModal() {
  const modal = document.getElementById('global-product-remap-modal');
  if (modal.close) modal.close();
  else modal.removeAttribute('open');
}

function searchErpProductsForGlobalRemap(query) {
  const container = document.getElementById('global-remap-results-container');
  const q = query.trim().toLowerCase();

  const master = (window.ERP_PRODUCTS_MASTER && window.ERP_PRODUCTS_MASTER.length > 0) 
                  ? window.ERP_PRODUCTS_MASTER 
                  : (window.SALES_DB ? window.SALES_DB.products : []) || [];
  const activeProds = master.filter(p => {
    if (p.use_by === 'N' || p.use_by === 'n' || p.is_active === false) return false;
    if (p.status && (p.status.includes('중단') || p.status.includes('중지'))) return false;
    return true;
  });
  let matches = activeProds;
  if (q) {
    matches = activeProds.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.id && p.id.toLowerCase().includes(q)) ||
      (p.spec && p.spec.toLowerCase().includes(q)) ||
      (p.vendor && p.vendor.toLowerCase().includes(q)) ||
      (p.keywords && p.keywords.some(k => k.toLowerCase().includes(q)))
    );
  }

  container.innerHTML = '';
  const top20 = matches.slice(0, 20);

  if (top20.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; padding:16px; text-align:center;">일치하는 ERP 품목이 없습니다.</div>`;
    return;
  }

  top20.forEach(p => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 12px; background:rgba(255,255,255,0.04); border:1px solid var(--border-glass); border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;';
    item.onmouseenter = () => item.style.background = 'rgba(59,130,246,0.15)';
    item.onmouseleave = () => item.style.background = 'rgba(255,255,255,0.04)';
    
    item.innerHTML = `
      <div>
        <strong style="color:#fff; font-size:0.85rem;">${escapeHtml(p.name)}</strong>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
          품목코드: <span style="color:#93c5fd; font-family:var(--font-en);">${escapeHtml(p.id)}</span> 
          ${p.edi ? `| 보험코드: <span style="color:#6ee7b7; font-family:var(--font-en);">${escapeHtml(p.edi)}</span>` : '| 보험코드: 비급여'} 
          | 공급처: ${escapeHtml(p.vendor || '일반')}
        </div>
      </div>
      <button type="button" class="mini-badge" style="background:var(--accent-blue); color:#fff; padding:4px 8px;">선택</button>
    `;
    item.onclick = () => {
      targetGlobalRemapProduct = p;
      document.getElementById('global-remap-target-title').textContent = `${p.name}`;
      document.getElementById('global-remap-target-codes').textContent = `품목코드: ${p.id} | 보험코드: ${p.edi || '비급여'} | 공급처: ${p.vendor || '일반'}`;
      document.getElementById('global-remap-selected-preview').style.display = 'block';

      const applyBtn = document.getElementById('btn-apply-global-remap');
      applyBtn.disabled = false;
      applyBtn.style.opacity = '1';
    };
    container.appendChild(item);
  });
}

function applyGlobalProductRemap() {
  if (!targetGlobalRemapProduct) return;

  const oldProdId = selectedProductId;
  const newProd = targetGlobalRemapProduct;
  const oldProd = (window.SALES_DB.products || []).find(p => p.id === oldProdId);
  const oldProdName = oldProd ? oldProd.name : '';

  let changedHospitalCount = 0;

  // 1. Remap ONLY matching pipeline deals
  (window.SALES_DB.pipeline || []).forEach(deal => {
    if (deal.product_id === oldProdId || (oldProdName && deal.product_name === oldProdName)) {
      deal.product_id = newProd.id;
      deal.product_name = newProd.name;
      changedHospitalCount++;
    }
  });

  // 2. Remap ONLY strictly matching activity logs
  (window.SALES_DB.activity_logs || []).forEach(log => {
    if (log.product_code === oldProdId) {
      log.product_code = newProd.id;
      log.product_name = newProd.name;
    }
    if (log.products && Array.isArray(log.products)) {
      log.products = log.products.map(pName => {
        if (!pName) return pName;
        if (pName === oldProdId || (oldProdName && (pName === oldProdName || pName.startsWith(oldProdName)))) {
          return newProd.name;
        }
        return pName;
      });
    }
  });

  selectedProductId = newProd.id;
  persistSalesDB();
  closeGlobalProductRemapModal();

  // Re-render UI
  initHeaderMetrics();
  renderProductPills();
  renderProductPipeline(selectedProductId);
  if (selectedHospitalName) {
    selectHospital(selectedHospitalName);
  }

  showToast(`🎉 [전체 병원 일괄 교정 완료] ${changedHospitalCount}개 병원의 품목이 '${newProd.name}'(으)로 일괄 변경되었습니다!`);
}

// (deleteCurrentDeal is defined with Supabase Cloud real-time sync above)

let currentTimelineFilter = 'sales'; // 'sales' (default), 'delivery', 'all'
let currentHospitalLogs = [];

function setTimelineFilter(filterType, btnElement) {
  currentTimelineFilter = filterType;
  document.querySelectorAll('.timeline-filter-chip').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderHospitalTimeline(currentHospitalLogs);
}

function renderHospitalTimeline(logs) {
  currentHospitalLogs = logs || [];
  const container = document.getElementById('hospital-timeline-container');
  if (!container) return;
  container.innerHTML = '';

  const sortDesc = (arr) => arr.sort((a, b) => {
    const dateA = (a.date || '').replace(/[\/\-\.]/g, '');
    const dateB = (b.date || '').replace(/[\/\-\.]/g, '');
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return (b.id || 0) - (a.id || 0);
  });

  const salesLogs = sortDesc(currentHospitalLogs.filter(l => l.action_type !== '납품·설치'));
  const deliveryLogs = sortDesc(currentHospitalLogs.filter(l => l.action_type === '납품·설치'));

  // Update badge counts
  const salesBadge = document.getElementById('badge-timeline-sales-count');
  const deliveryBadge = document.getElementById('badge-timeline-delivery-count');
  if (salesBadge) salesBadge.textContent = `(${salesLogs.length})`;
  if (deliveryBadge) deliveryBadge.textContent = `(${deliveryLogs.length})`;

  if (currentHospitalLogs.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding:16px; text-align:center;">기록된 활동 일지가 없습니다.</div>`;
    return;
  }

  // Helper to build timeline item
  function createTimelineItem(log) {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    
    let actionBadgeColor = 'var(--accent-blue)';
    if (log.action_type === 'A/S·클레임') actionBadgeColor = 'var(--accent-rose)';
    if (log.action_type === '샘플·데모') actionBadgeColor = 'var(--accent-amber)';
    if (log.action_type === '납품·설치') actionBadgeColor = 'var(--accent-emerald)';

    item.innerHTML = `
      <div class="timeline-dot" style="background:${actionBadgeColor};"></div>
      <div class="timeline-card" style="cursor:pointer;" title="클릭하여 일지 수정, 병원 이동 또는 삭제" onclick="openEditLogModal('${escapeHtml(log.hospital)}', '${escapeHtml(log.date)}', '${escapeHtml(log.title)}')">
        <div class="timeline-top">
          <span class="timeline-date">${log.date}</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="timeline-rep">담당: <strong>${escapeHtml(log.sales_rep || '미정')}</strong> ${log.contact ? `| 면담: ${escapeHtml(log.contact)}` : ''}</span>
            <span style="font-size:0.7rem; color:var(--accent-blue); background:rgba(59,130,246,0.15); padding:1px 6px; border-radius:4px;">✏️ 수정</span>
          </div>
        </div>
        <div class="timeline-title">
          <span style="color:${actionBadgeColor}; font-size:0.75rem; border:1px solid ${actionBadgeColor}; padding:1px 6px; border-radius:4px; margin-right:6px;">${log.action_type}</span>
          ${escapeHtml(log.title)}
        </div>
        <div class="timeline-desc">${escapeHtml(log.note)}</div>
        ${log.products && log.products.length ? `
          <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">
            ${log.products.map(p => `<span style="font-size:0.7rem; padding:2px 6px; background:rgba(255,255,255,0.06); border-radius:4px; color:var(--accent-cyan);">${escapeHtml(p)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
    return item;
  }

  // Helper to build delivery history card
  function createDeliveryCard(log) {
    const card = document.createElement('div');
    card.className = 'delivery-history-card';
    card.style.cursor = 'pointer';
    card.title = '클릭하여 납품 일지 수정, 병원 이동 또는 삭제';
    card.onclick = () => openEditLogModal(log.hospital, log.date, log.title);

    const prodName = (log.products && log.products.length) ? log.products.join(', ') : log.title;
    card.innerHTML = `
      <div class="delivery-info-left">
        <span class="delivery-badge">📦 납품</span>
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <strong style="font-size:0.85rem; color:#fff;">${escapeHtml(prodName)}</strong>
            <span style="font-size:0.68rem; color:var(--accent-blue); background:rgba(59,130,246,0.15); padding:1px 5px; border-radius:4px;">✏️ 수정/이동</span>
          </div>
          <div class="delivery-meta-txt">${escapeHtml(log.note || '정규 납품 처리')}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div class="delivery-rep-txt">납품담당: ${escapeHtml(log.sales_rep || '미정')}</div>
        <div style="font-size:0.72rem; color:var(--text-muted);">${log.date}</div>
      </div>
    `;
    return card;
  }

  // 1. Filter: Sales Only (Primary view - Sales on Top, Delivery list below)
  if (currentTimelineFilter === 'sales') {
    if (salesLogs.length === 0 && deliveryLogs.length > 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; padding:12px;">최근 등록된 영업·상담 일지가 없습니다. (아래 납품 이력 확인)</div>`;
    } else {
      salesLogs.forEach(log => container.appendChild(createTimelineItem(log)));
    }

    // Append Collapsible Delivery Section if delivery logs exist
    if (deliveryLogs.length > 0) {
      const deliverySectionHeader = document.createElement('div');
      deliverySectionHeader.style.cssText = 'margin-top:24px; margin-bottom:10px; font-size:0.85rem; font-weight:700; color:#6ee7b7; display:flex; align-items:center; gap:6px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;';
      deliverySectionHeader.innerHTML = `<span>📦 정규 납품 및 배송 이력</span> <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(총 ${deliveryLogs.length}건 - 클릭하여 병원 이동 및 오타 수정)</span>`;
      container.appendChild(deliverySectionHeader);

      deliveryLogs.forEach(log => container.appendChild(createDeliveryCard(log)));
    }
  } 
  // 2. Filter: Delivery Only
  else if (currentTimelineFilter === 'delivery') {
    if (deliveryLogs.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding:20px; text-align:center;">이 병원에 기록된 납품 및 배송 이력이 없습니다.</div>`;
    } else {
      deliveryLogs.forEach(log => container.appendChild(createDeliveryCard(log)));
    }
  } 
  // 3. Filter: All (Combined chronological)
  else {
    currentHospitalLogs.forEach(log => container.appendChild(createTimelineItem(log)));
  }
}

// ----------------------------------------------------
// Activity Log Edit Modal Logic & New Hospital Adding
// ----------------------------------------------------
let currentEditingLog = null;

function openEditLogModal(hospName, date, title) {
  const log = window.SALES_DB.activity_logs.find(l => 
    l.hospital === hospName && l.date === date && l.title === title
  );
  if (!log) return;
  currentEditingLog = log;

  const modal = document.getElementById('edit-log-modal');
  
  // Populate Hospital dropdown
  const selectEl = document.getElementById('modal-log-hospital-select');
  selectEl.innerHTML = '';
  
  // Option 1: Add new hospital option
  const newOpt = document.createElement('option');
  newOpt.value = '__NEW__';
  newOpt.textContent = '➕ [신규 거래처/병원 직접 추가...]';
  newOpt.style.fontWeight = 'bold';
  newOpt.style.color = '#38bdf8';
  selectEl.appendChild(newOpt);

  window.SALES_DB.hospitals.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.name;
    opt.textContent = `${h.name} (${h.region || '기타'})`;
    if (h.name === log.hospital) opt.selected = true;
    selectEl.appendChild(opt);
  });

  // Reset new hospital box
  document.getElementById('modal-new-hosp-box').style.display = 'none';
  document.getElementById('modal-new-hosp-name').value = '';

  document.getElementById('modal-log-date').value = log.date || '';
  document.getElementById('modal-log-rep').value = log.sales_rep || '';
  document.getElementById('modal-log-action-type').value = log.action_type || '납품·설치';
  document.getElementById('modal-log-contact').value = log.contact || '';
  document.getElementById('modal-log-title').value = log.title || '';
  document.getElementById('modal-log-note').value = log.note || '';

  if (modal.showModal) modal.showModal();
  else modal.setAttribute('open', 'true');
}

function handleLogHospitalSelectChange(selectEl) {
  const newHospBox = document.getElementById('modal-new-hosp-box');
  if (selectEl.value === '__NEW__') {
    newHospBox.style.display = 'block';
    document.getElementById('modal-new-hosp-name').focus();
  } else {
    newHospBox.style.display = 'none';
  }
}

// ====================================================
// A/S 360° Control Center (5-Stage Kanban Logic)
// ====================================================
let draggedASDeal = null;

function renderASControlCenter() {
  const query = (document.getElementById('as-search-input')?.value || '').trim().toLowerCase();
  const pipe = (window.SALES_DB && window.SALES_DB.pipeline) ? window.SALES_DB.pipeline : [];
  
  // Find all A/S related deals
  const asDeals = pipe.filter(d => {
    const isAS = (d.as_info && d.as_info.status) || (d.status === 'A/S접수·처리') || (d.latest_action === 'A/S·클레임');
    if (!isAS) return false;

    if (query) {
      const q = query.replace(/\s+/g, '');
      const match = (d.hospital || '').toLowerCase().includes(query) ||
                    (d.hospital || '').replace(/\s+/g, '').toLowerCase().includes(q) ||
                    (d.product_name || '').toLowerCase().includes(query) ||
                    (d.latest_note || '').toLowerCase().includes(query) ||
                    (d.sales_rep || '').toLowerCase().includes(query);
      if (!match) return false;
    }
    return true;
  });

  const columns = {
    '접수완료': { list: document.getElementById('as-list-receipt'), count: document.getElementById('as-count-receipt'), items: [] },
    '외부전달': { list: document.getElementById('as-list-vendor'), count: document.getElementById('as-count-vendor'), items: [] },
    '수리진행중': { list: document.getElementById('as-list-progress'), count: document.getElementById('as-count-progress'), items: [] },
    '견적협의': { list: document.getElementById('as-list-quote'), count: document.getElementById('as-count-quote'), items: [] },
    '수리완료': { list: document.getElementById('as-list-done'), count: document.getElementById('as-count-done'), items: [] }
  };

  // Classify deals into 5 stages
  asDeals.forEach(d => {
    let stage = '접수완료';
    const statusTxt = `${d.as_info ? d.as_info.status : ''} ${d.status || ''} ${d.latest_note || ''}`.toLowerCase();
    
    if (statusTxt.includes('완료') || statusTxt.includes('출고') || statusTxt.includes('납품완료')) {
      stage = '수리완료';
    } else if (statusTxt.includes('견적') || statusTxt.includes('협의') || statusTxt.includes('금액')) {
      stage = '견적협의';
    } else if (statusTxt.includes('진행') || statusTxt.includes('수리중') || statusTxt.includes('점검')) {
      stage = '수리진행중';
    } else if (statusTxt.includes('전달') || statusTxt.includes('발송') || statusTxt.includes('본사') || statusTxt.includes('블루')) {
      stage = '외부전달';
    } else {
      stage = '접수완료';
    }
    if (columns[stage]) columns[stage].items.push(d);
  });

  // Render cards for each column
  Object.keys(columns).forEach(stage => {
    const col = columns[stage];
    if (col.count) col.count.textContent = `${col.items.length}건`;
    if (!col.list) return;

    if (col.items.length === 0) {
      col.list.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:24px 8px; border:1px dashed rgba(255,255,255,0.08); border-radius:6px;">항목 없음 (드래그하여 이동)</div>`;
      return;
    }

    col.list.innerHTML = '';
    col.items.forEach(d => {
      const card = document.createElement('div');
      card.className = 'as-item-card';
      card.draggable = true;
      
      // Check if loaner (대체기) is provided
      const noteTxt = `${d.latest_note || ''} ${d.as_info ? d.as_info.note : ''}`;
      const hasLoaner = noteTxt.includes('데모') || noteTxt.includes('대체') || noteTxt.includes('블루');

      card.ondragstart = (e) => {
        draggedASDeal = d;
        if (e.dataTransfer) e.dataTransfer.setData('text/plain', JSON.stringify({ hosp: d.hospital, prodId: d.product_id }));
        card.classList.add('dragging');
      };
      card.ondragend = () => {
        card.classList.remove('dragging');
        draggedASDeal = null;
      };
      card.onclick = () => openEditModal(d);

      card.innerHTML = `
        <div class="as-card-top">
          <div>
            <div class="as-card-hosp">${escapeHtml(d.hospital)}</div>
            <div class="as-card-prod">${escapeHtml(d.product_name)}</div>
          </div>
          ${hasLoaner ? `<span class="as-loaner-badge" title="A/S 수리 기간 임시 대체기기 지원중">🚨 대체기 지원</span>` : ''}
        </div>
        <div class="as-card-note">${escapeHtml(d.as_info ? (d.as_info.note || d.latest_note || '') : d.latest_note || 'A/S 접수 건')}</div>
        <div class="as-card-meta">
          <span>담당: ${escapeHtml(d.sales_rep || '미정')}</span>
          <span>${d.as_info ? d.as_info.date : d.last_date || ''}</span>
        </div>
      `;
      col.list.appendChild(card);
    });
  });
}

function handleASDragOver(e) {
  e.preventDefault();
  if (e.currentTarget) e.currentTarget.classList.add('drag-over');
}

function handleASDragLeave(e) {
  if (e.currentTarget) e.currentTarget.classList.remove('drag-over');
}

async function handleASDrop(e, targetStage) {
  e.preventDefault();
  if (e.currentTarget) e.currentTarget.classList.remove('drag-over');
  if (!draggedASDeal) return;

  if (!draggedASDeal.as_info) {
    draggedASDeal.as_info = { date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'), note: draggedASDeal.latest_note || '', status: targetStage };
  } else {
    draggedASDeal.as_info.status = targetStage;
  }

  if (targetStage === '수리완료') {
    draggedASDeal.status = '도입완료·납품';
  } else {
    draggedASDeal.status = 'A/S접수·처리';
  }
  draggedASDeal.last_date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  persistSalesDB();
  recalcGlobalStats();
  initHeaderMetrics();
  renderASControlCenter();
  showToast(`✨ [${draggedASDeal.hospital}] A/S 진행상태가 '${targetStage}'(으)로 변경되었습니다.`);

  if (supabaseClient) {
    try {
      await supabaseClient.from('pipeline').upsert([draggedASDeal]);
    } catch(err) {
      console.warn('Supabase AS status error:', err);
    }
  }
}

function openNewASModal() {
  switchTab('ai');
  document.getElementById('ai-input-text').value = `[긴급 A/S 접수]\n병원명: \n장비명: \n접수증상: \n대체기 지원여부: `;
  document.getElementById('ai-input-text').focus();
  showToast('📝 AI 스마트 일지창에서 A/S 접수 내용을 입력하시면 자동 등록됩니다.');
}

// ====================================================
// Equipment Demo Tracker (Loaner vs Sales Evaluation)
// ====================================================
let currentDemoFilter = 'all'; // 'all', 'loaner', 'sales'

function setDemoFilter(filterType) {
  currentDemoFilter = filterType;
  document.querySelectorAll('.demo-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `demo-filter-${filterType}`);
  });
  renderDemoTracker();
}

function renderDemoTracker() {
  const query = (document.getElementById('demo-search-input')?.value || '').trim().toLowerCase();
  const pipe = (window.SALES_DB && window.SALES_DB.pipeline) ? window.SALES_DB.pipeline : [];
  const container = document.getElementById('demo-tracker-grid-container');
  if (!container) return;

  // Filter only Equipment Demos
  const activeDemoDeals = pipe.filter(d => {
    const isDemo = (d.status === '의료장비 데모' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status && d.demo_info.status.includes('진행')));
    if (!isDemo) return false;
    return isEquipmentProduct(d.product_name, d.product_id, d.latest_note);
  });

  // Calculate D-Day & Purpose
  const classifiedDeals = activeDemoDeals.map(d => {
    const noteTxt = `${d.latest_note || ''} ${d.demo_info ? d.demo_info.note : ''}`.toLowerCase();
    const isLoaner = noteTxt.includes('대체') || noteTxt.includes('as') || noteTxt.includes('수리') || noteTxt.includes('블루') || noteTxt.includes('임시');
    return {
      deal: d,
      purpose: isLoaner ? 'loaner' : 'sales',
      purposeLabel: isLoaner ? '🚨 A/S 수리 대체 대여기 (Loaner)' : '🎯 신규 판매·도입 평가 데모 (Sales)',
      returnDeadline: '2주 이내 (회수 추적)'
    };
  });

  // Update counts
  const totalCount = classifiedDeals.length;
  const loanerCount = classifiedDeals.filter(d => d.purpose === 'loaner').length;
  const salesCount = classifiedDeals.filter(d => d.purpose === 'sales').length;

  const elAll = document.getElementById('demo-count-all');
  if (elAll) elAll.textContent = totalCount;
  const elLoaner = document.getElementById('demo-count-loaner');
  if (elLoaner) elLoaner.textContent = loanerCount;
  const elSales = document.getElementById('demo-count-sales');
  if (elSales) elSales.textContent = salesCount;

  // Filter by active tab & search query
  let filtered = classifiedDeals;
  if (currentDemoFilter === 'loaner') filtered = filtered.filter(d => d.purpose === 'loaner');
  if (currentDemoFilter === 'sales') filtered = filtered.filter(d => d.purpose === 'sales');

  if (query) {
    const q = query.replace(/\s+/g, '');
    filtered = filtered.filter(item => {
      const d = item.deal;
      return (d.hospital || '').toLowerCase().includes(query) ||
             (d.hospital || '').replace(/\s+/g, '').toLowerCase().includes(q) ||
             (d.product_name || '').toLowerCase().includes(query) ||
             (d.latest_note || '').toLowerCase().includes(query) ||
             (d.sales_rep || '').toLowerCase().includes(query);
    });
  }

  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; color:var(--text-muted); text-align:center; padding:48px 16px; font-size:0.85rem; background:var(--bg-card); border-radius:12px; border:1px dashed rgba(255,255,255,0.1);">해당 조건의 장비 데모/대여기 항목이 없습니다.</div>`;
    return;
  }

  filtered.forEach(item => {
    const d = item.deal;
    const card = document.createElement('div');
    card.className = `demo-card-box type-${item.purpose}`;
    
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <span class="demo-purpose-tag tag-${item.purpose}">${item.purposeLabel}</span>
        <span class="dday-badge">회수관리 대상</span>
      </div>
      <div>
        <div style="font-size:1.05rem; font-weight:800; color:#fff;">${escapeHtml(d.hospital)}</div>
        <div style="font-size:0.88rem; font-weight:600; color:var(--accent-cyan); margin-top:2px;">${escapeHtml(d.product_name)}</div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">코드: ${escapeHtml(d.product_id)} | 담당: ${escapeHtml(d.sales_rep || '미정')}</div>
      </div>
      <div style="font-size:0.76rem; color:var(--text-secondary); background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:6px; line-height:1.4;">
        ${escapeHtml(d.demo_info ? (d.demo_info.note || d.latest_note || '') : d.latest_note || '장비 데모 전달 완료')}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.73rem; color:var(--text-muted); border-top:1px dashed rgba(255,255,255,0.1); padding-top:8px;">
        <span>전달일: ${d.demo_info ? d.demo_info.date : d.last_date || '-'}</span>
        <div style="display:flex; gap:6px;">
          <button class="mini-badge" style="background:#10b981; color:#fff; cursor:pointer; padding:3px 8px; border:none; border-radius:4px;" onclick="convertDemoToSale('${d.hospital}', '${d.product_id}')">🏆 정식구매 전환</button>
          <button class="mini-badge" style="background:rgba(255,255,255,0.15); color:#fff; cursor:pointer; padding:3px 8px; border:none; border-radius:4px;" onclick="returnDemoItem('${d.hospital}', '${d.product_id}')">🔄 회수 완료</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function returnDemoItem(hospital, productId) {
  const cleanHosp = (hospital || '').replace(/\s+/g, '');
  const deal = window.SALES_DB.pipeline.find(d => (d.hospital || '').replace(/\s+/g, '') === cleanHosp && (d.product_id === productId || d.product_name === productId));
  if (!deal) return;

  if (confirm(`[${hospital}] '${deal.product_name}' 데모 장비 회수를 완료(입고 처리)하시겠습니까?`)) {
    deal.status = '도입완료·납품';
    deal.latest_note = `[회수완료] ${new Date().toISOString().slice(0,10)} 장비 회수 입고 처리 완료`;
    if (deal.demo_info) deal.demo_info.status = '회수완료';

    persistSalesDB();
    recalcGlobalStats();
    initHeaderMetrics();
    renderDemoTracker();
    showToast(`✅ [${hospital}] 데모 장비가 정상적으로 회수 입고되었습니다.`);

    if (supabaseClient) {
      try {
        await supabaseClient.from('pipeline').upsert([deal]);
      } catch(err) {}
    }
  }
}

async function convertDemoToSale(hospital, productId) {
  const cleanHosp = (hospital || '').replace(/\s+/g, '');
  const deal = window.SALES_DB.pipeline.find(d => (d.hospital || '').replace(/\s+/g, '') === cleanHosp && (d.product_id === productId || d.product_name === productId));
  if (!deal) return;

  if (confirm(`🎉 [${hospital}] '${deal.product_name}' 데모 장비를 [정식 도입 및 판매 완료]로 전환하시겠습니까?`)) {
    deal.status = '도입완료·납품';
    deal.latest_note = `[정식구매 전환] ${new Date().toISOString().slice(0,10)} 데모 평가 성공 후 신규 판매 및 정규 납품 확정!`;
    if (deal.demo_info) deal.demo_info.status = '판매전환완료';

    persistSalesDB();
    recalcGlobalStats();
    initHeaderMetrics();
    renderDemoTracker();
    showToast(`🎉 축하합니다! [${hospital}] '${deal.product_name}'이 정식 판매 전환되었습니다!`);

    if (supabaseClient) {
      try {
        await supabaseClient.from('pipeline').upsert([deal]);
      } catch(err) {}
    }
  }
}

function openNewDemoModal() {
  switchTab('ai');
  document.getElementById('ai-input-text').value = `[장비 데모 전달]\n병원명: \n장비명: \n데모목적: [A/S대체기 / 신규판매평가 중 선택]\n회수예정일: \n특이사항: `;
  document.getElementById('ai-input-text').focus();
  showToast('📝 AI 스마트 일지창에서 데모 전달 내용을 입력하시면 자동 등록됩니다.');
}

function selectAddNewHospitalInLogModal() {
  const selectEl = document.getElementById('modal-log-hospital-select');
  selectEl.value = '__NEW__';
  handleLogHospitalSelectChange(selectEl);
}

function closeEditLogModal() {
  const modal = document.getElementById('edit-log-modal');
  if (modal.close) modal.close();
  else modal.removeAttribute('open');
  currentEditingLog = null;
}

function saveLogModalChanges() {
  if (!currentEditingLog) return;

  const selectVal = document.getElementById('modal-log-hospital-select').value;
  let targetHospitalName = selectVal;
  let targetRegion = '세종충북';

  // If user selected to create a new hospital
  if (selectVal === '__NEW__') {
    const rawName = document.getElementById('modal-new-hosp-name').value.trim();
    if (!rawName) {
      alert('신규 병원명을 입력해주세요.');
      document.getElementById('modal-new-hosp-name').focus();
      return;
    }
    targetHospitalName = rawName;
    targetRegion = document.getElementById('modal-new-hosp-region').value;

    // Check if exists or create new
    let existingHosp = window.SALES_DB.hospitals.find(h => h.name === targetHospitalName);
    if (!existingHosp) {
      existingHosp = {
        name: targetHospitalName,
        region: targetRegion,
        sales_reps: currentEditingLog.sales_rep ? [currentEditingLog.sales_rep] : ['영업담당'],
        contacts: currentEditingLog.contact ? [currentEditingLog.contact] : ['실무진'],
        status: '신규거래처',
        last_activity_date: document.getElementById('modal-log-date').value.trim() || new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
        total_logs: 1,
        demo_count: 0,
        won_count: 0,
        as_count: 0,
        fail_count: 0,
        products_active: []
      };
      window.SALES_DB.hospitals.push(existingHosp);
      window.SALES_DB.hospitals.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      window.SALES_DB.stats.total_hospitals = window.SALES_DB.hospitals.length;
      initHeaderMetrics();
      renderHospitalList();
    }
  }

  const newDate = document.getElementById('modal-log-date').value.trim();
  const newRep = document.getElementById('modal-log-rep').value.trim();
  const newAction = document.getElementById('modal-log-action-type').value;
  const newContact = document.getElementById('modal-log-contact').value.trim();
  const newTitle = document.getElementById('modal-log-title').value.trim();
  const newNote = document.getElementById('modal-log-note').value.trim();

  // Apply Changes
  currentEditingLog.hospital = targetHospitalName;
  currentEditingLog.date = newDate;
  currentEditingLog.sales_rep = newRep;
  currentEditingLog.action_type = newAction;
  currentEditingLog.contact = newContact;
  currentEditingLog.title = newTitle;
  currentEditingLog.note = newNote;

  persistSalesDB();
  closeEditLogModal();

  // Re-render
  selectedHospitalName = targetHospitalName;
  selectHospital(selectedHospitalName);

  showToast(`💾 영업활동 일지가 [${targetHospitalName}] 귀속으로 성공적으로 저장되었습니다!`);
}

function deleteCurrentLog() {
  if (!currentEditingLog) return;
  if (!confirm(`정말로 이 영업활동 일지를 삭제하시겠습니까?\n[${currentEditingLog.hospital}] ${currentEditingLog.title}`)) {
    return;
  }

  const idx = window.SALES_DB.activity_logs.indexOf(currentEditingLog);
  if (idx !== -1) {
    window.SALES_DB.activity_logs.splice(idx, 1);
    persistSalesDB();
    closeEditLogModal();
    if (selectedHospitalName) {
      selectHospital(selectedHospitalName);
    }
    showToast(`🗑️ 해당 일지가 영구 삭제되었습니다.`);
  }
}

// ----------------------------------------------------
// Standalone Add Hospital Master Modal Logic
// ----------------------------------------------------
function openAddHospitalModal() {
  const modal = document.getElementById('add-hospital-modal');
  document.getElementById('add-hosp-name').value = '';
  document.getElementById('add-hosp-rep').value = '';
  document.getElementById('add-hosp-contacts').value = '';
  document.getElementById('add-hosp-note').value = '';

  if (modal.showModal) modal.showModal();
  else modal.setAttribute('open', 'true');
}

function closeAddHospitalModal() {
  const modal = document.getElementById('add-hospital-modal');
  if (modal.close) modal.close();
  else modal.removeAttribute('open');
}

function saveNewHospital() {
  const name = document.getElementById('add-hosp-name').value.trim();
  const region = document.getElementById('add-hosp-region').value;
  const reps = document.getElementById('add-hosp-rep').value.trim();
  const contacts = document.getElementById('add-hosp-contacts').value.trim();
  const note = document.getElementById('add-hosp-note').value.trim();

  if (!name) {
    alert('병원 / 거래처명을 입력해주세요.');
    document.getElementById('add-hosp-name').focus();
    return;
  }

  // Check duplicate
  const exists = window.SALES_DB.hospitals.find(h => h.name === name);
  if (exists) {
    alert(`'${name}' 거래처는 이미 등록되어 있습니다.`);
    selectHospital(name);
    closeAddHospitalModal();
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const newHosp = {
    name: name,
    region: region,
    sales_reps: reps ? reps.split(',').map(s => s.trim()).filter(Boolean) : ['영업담당'],
    contacts: contacts ? contacts.split(',').map(s => s.trim()).filter(Boolean) : ['실무진'],
    status: '신규등록',
    last_activity_date: todayStr,
    total_logs: note ? 1 : 0,
    demo_count: 0,
    won_count: 0,
    as_count: 0,
    fail_count: 0,
    products_active: []
  };

  window.SALES_DB.hospitals.push(newHosp);
  window.SALES_DB.hospitals.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  window.SALES_DB.stats.total_hospitals = window.SALES_DB.hospitals.length;

  if (note) {
    window.SALES_DB.activity_logs.unshift({
      hospital: name,
      region: region,
      date: todayStr,
      sales_rep: reps || '영업담당',
      contact: contacts || '',
      action_type: '관계관리',
      title: `${name} 거래처 신규 등록`,
      note: note,
      products: []
    });
  }

  persistSalesDB();
  closeAddHospitalModal();
  initHeaderMetrics();
  renderHospitalList();
  selectHospital(name);

  showToast(`🎉 [${name}] 신규 거래처가 성공적으로 등록되었습니다!`);
}

// ----------------------------------------------------
// 3. Product Pipeline Kanban View & ERP Master Integration
// ----------------------------------------------------
let productSearchQuery = '';
let kanbanHospitalSearchQuery = '';
let pendingErpProducts = [];

function initProductPipelineView() {
  if (window.SALES_DB && window.SALES_DB.pipeline && window.SALES_DB.pipeline.length > 0) {
    const productDealCountMap = {};
    window.SALES_DB.pipeline.forEach(d => {
      productDealCountMap[d.product_id] = (productDealCountMap[d.product_id] || 0) + 1;
    });
    const sortedProds = [...(window.SALES_DB.products || [])].sort((a, b) => {
      return (productDealCountMap[b.id] || 0) - (productDealCountMap[a.id] || 0);
    });
    if (sortedProds.length > 0 && (productDealCountMap[sortedProds[0].id] || 0) > 0) {
      selectedProductId = sortedProds[0].id;
    }
  }
  renderProductPills();
  renderProductPipeline(selectedProductId);
}

function filterProductList() {
  productSearchQuery = (document.getElementById('product-search-input')?.value || '').trim().toLowerCase();
  renderProductPills();
}

function renderProductPills() {
  const selectorBar = document.getElementById('product-selector-bar');
  selectorBar.innerHTML = '';

  const totalCount = window.SALES_DB.products.length;
  let filtered = [...window.SALES_DB.products];

  if (productSearchQuery) {
    filtered = filtered.filter(p => {
      return p.name.toLowerCase().includes(productSearchQuery) ||
             (p.id && p.id.toLowerCase().includes(productSearchQuery)) ||
             (p.spec && p.spec.toLowerCase().includes(productSearchQuery)) ||
             (p.vendor && p.vendor.toLowerCase().includes(productSearchQuery)) ||
             (p.keywords && p.keywords.some(k => k.toLowerCase().includes(productSearchQuery)));
    });
  }

  // Calculate deal count for each product and sort DESC (most hospitals first)
  const productDealCountMap = {};
  window.SALES_DB.pipeline.forEach(d => {
    productDealCountMap[d.product_id] = (productDealCountMap[d.product_id] || 0) + 1;
  });

  filtered.sort((a, b) => {
    const countA = productDealCountMap[a.id] || 0;
    const countB = productDealCountMap[b.id] || 0;
    if (countB !== countA) {
      return countB - countA; // 많이 나간 순서 (내림차순)
    }
    return a.name.localeCompare(b.name, 'ko');
  });

  document.getElementById('product-count-display').textContent = productSearchQuery 
    ? `검색 결과 ${filtered.length}건 / 전체 ERP ${totalCount}개 품목 (거래처 많은순 정렬)`
    : `전체 ERP ${totalCount}개 품목 (거래처 많은순 정렬)`;

  if (filtered.length === 0) {
    selectorBar.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; padding:12px;">'${escapeHtml(productSearchQuery)}' 일치하는 ERP 품목이 없습니다.</div>`;
    return;
  }

  // Display top 40 items for ultra-fast rendering performance
  const displayItems = filtered.slice(0, 40);

  // If currently selected product is not in displayed list and not found, auto-select first (top active) one
  if (!filtered.some(p => p.id === selectedProductId) && filtered.length > 0) {
    selectedProductId = filtered[0].id;
  }

  displayItems.forEach(p => {
    const btn = document.createElement('button');
    btn.className = `product-pill ${p.id === selectedProductId ? 'active' : ''}`;
    
    // Count total deals for this product
    const dealCount = productDealCountMap[p.id] || 0;
    btn.innerHTML = `
      <span>📦</span> 
      <span>${escapeHtml(p.name)}</span>
      <span style="font-size:0.68rem; opacity:0.85; background:rgba(0,0,0,0.3); padding:1px 6px; border-radius:8px; font-family:var(--font-en);">${escapeHtml(p.id)}</span>
      ${dealCount > 0 ? `<span style="font-size:0.68rem; background:linear-gradient(135deg, var(--accent-blue), #2563eb); color:#fff; padding:1px 7px; border-radius:10px; font-weight:800; box-shadow:0 2px 4px rgba(0,0,0,0.3);">${dealCount}곳</span>` : '<span style="font-size:0.68rem; color:var(--text-muted); padding:1px 4px;">0곳</span>'}
    `;
    btn.onclick = () => {
      selectedProductId = p.id;
      document.querySelectorAll('.product-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderProductPipeline(p.id);
    };
    selectorBar.appendChild(btn);
  });

  if (filtered.length > 40) {
    const moreNotice = document.createElement('div');
    moreNotice.style.cssText = 'color:var(--text-muted); font-size:0.75rem; display:flex; align-items:center; white-space:nowrap; padding:0 8px;';
    moreNotice.textContent = `+ ${filtered.length - 40}개 품목 더 있음 (검색창으로 바로 찾기)`;
    selectorBar.appendChild(moreNotice);
  }
}

function filterKanbanCards() {
  kanbanHospitalSearchQuery = (document.getElementById('kanban-hospital-search')?.value || '').trim().toLowerCase();
  renderProductPipeline(selectedProductId);
}

function renderProductPipeline(prodId) {
  const prod = window.SALES_DB.products.find(p => p.id === prodId);
  if (!prod) return;

  document.getElementById('pipeline-product-title').textContent = prod.name;
  document.getElementById('pipeline-product-erp-code').textContent = `품목코드: ${prod.id}`;
  
  const ediEl = document.getElementById('pipeline-product-edi-code');
  if (prod.edi) {
    ediEl.textContent = `보험코드: ${prod.edi}`;
    ediEl.style.display = 'inline-block';
  } else {
    ediEl.textContent = `보험코드: 비급여`;
    ediEl.style.display = 'inline-block';
  }

  document.getElementById('pipeline-product-cat').textContent = `공급처/분류: ${prod.vendor || prod.category || '일반'}`;

  // Filter deals for this product and by internal search
  const deals = window.SALES_DB.pipeline.filter(d => {
    if (d.product_id !== prodId) return false;
    if (!kanbanHospitalSearchQuery) return true;
    return d.hospital.toLowerCase().includes(kanbanHospitalSearchQuery) ||
           (d.region && d.region.toLowerCase().includes(kanbanHospitalSearchQuery)) ||
           (d.sales_rep && d.sales_rep.toLowerCase().includes(kanbanHospitalSearchQuery)) ||
           (d.latest_note && d.latest_note.toLowerCase().includes(kanbanHospitalSearchQuery));
  });
  
  const wonDeals = deals.filter(d => d.status === '도입완료·납품');
  const demoDeals = deals.filter(d => d.status === '의료장비 데모' || (d.status === '데모·샘플평가' && isEquipmentProduct(d.product_name, d.product_id, d.latest_note)));
  const sampleDeals = deals.filter(d => d.status === '소모품 샘플' || (d.status === '데모·샘플평가' && !isEquipmentProduct(d.product_name, d.product_id, d.latest_note)));
  const activeDeals = deals.filter(d => d.status.includes('영업중') || d.status.includes('견적') || d.status.includes('관계관리'));
  const asDeals = deals.filter(d => d.status === 'A/S접수·처리');
  const lostDeals = deals.filter(d => d.status === '영업실패·보류');

  document.getElementById('pipeline-stat-total').textContent = `${deals.length}개 병원`;
  const rate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0;
  document.getElementById('pipeline-stat-rate').textContent = `${rate}%`;

  const elCountWon = document.getElementById('kanban-count-won');
  if (elCountWon) elCountWon.textContent = wonDeals.length;
  const elCountDemo = document.getElementById('kanban-count-demo');
  if (elCountDemo) elCountDemo.textContent = demoDeals.length;
  const elCountSample = document.getElementById('kanban-count-sample');
  if (elCountSample) elCountSample.textContent = sampleDeals.length;
  const elCountActive = document.getElementById('kanban-count-active');
  if (elCountActive) elCountActive.textContent = activeDeals.length;
  const elCountAs = document.getElementById('kanban-count-as');
  if (elCountAs) elCountAs.textContent = asDeals.length;
  const elCountLost = document.getElementById('kanban-count-lost');
  if (elCountLost) elCountLost.textContent = lostDeals.length;

  renderKanbanCards('active', activeDeals);
  renderKanbanCards('demo', demoDeals);
  renderKanbanCards('sample', sampleDeals);
  renderKanbanCards('won', wonDeals);
  renderKanbanCards('as', asDeals);
  renderKanbanCards('lost', lostDeals);
}

function renderKanbanCards(statusKey, items) {
  const container = document.getElementById(`kanban-cards-${statusKey}`);
  if (!container) return;
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = `<div class="kanban-empty" style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:16px; border:1px dashed rgba(255,255,255,0.08); border-radius:6px;">해당 병원 없음</div>`;
    return;
  }

  items.forEach(d => {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.title = '클릭하여 품목코드/상태 수정 또는 드래그하여 이동';

    card.ondragstart = (e) => handleDragStart(e, d.hospital, d.product_id);
    card.ondragend = (e) => handleDragEnd(e);
    card.onclick = (e) => {
      if (!card.classList.contains('dragging')) {
        openEditModal(d);
      }
    };

    let subNote = '';
    if (d.latest_note) {
      subNote = `<div class="kanban-card-note" style="font-size:0.75rem; color:var(--text-secondary); margin:6px 0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(d.latest_note)}</div>`;
    }
    if (d.fail_reasons && d.fail_reasons.length > 0) {
      subNote += `<div style="margin-top:4px;">${d.fail_reasons.map(r => `<span class="reason-tag">⚠️ ${escapeHtml(r)}</span>`).join(' ')}</div>`;
    }

    card.innerHTML = `
      <div class="kanban-card-header" style="display:flex; justify-content:space-between; align-items:center;">
        <strong class="kanban-card-hosp" style="font-size:0.85rem; color:#fff;">${escapeHtml(d.hospital)}</strong>
        <span class="hospital-item-region">${escapeHtml(d.region || '기타')}</span>
      </div>
      ${subNote}
      <div style="font-size:0.68rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">
        <span>담당: ${escapeHtml(d.sales_rep || '영업담당')}</span>
        <span>${d.last_date || ''}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ----------------------------------------------------
// Notion-Style Drag & Drop System
// ----------------------------------------------------
let currentDraggedDeal = null;

function handleDragStart(e, hospName, prodId) {
  currentDraggedDeal = { hospital: hospName, productId: prodId };
  e.dataTransfer.setData('text/plain', JSON.stringify(currentDraggedDeal));
  e.dataTransfer.effectAllowed = 'move';
  if (e.target) {
    e.target.classList.add('dragging');
  }
}

function handleDragEnd(e) {
  if (e.target) {
    e.target.classList.remove('dragging');
  }
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  currentDraggedDeal = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target && !target.classList.contains('drag-over')) {
    target.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const target = e.currentTarget;
  if (target) {
    target.classList.remove('drag-over');
  }
}

// 1. Hospital 360 View Internal Drop Handler
function handleDropToHospitalStatus(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  let dragData = currentDraggedDeal;
  if (!dragData) {
    try {
      dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch(err) {}
  }
  if (!dragData) return;

  const deal = window.SALES_DB.pipeline.find(d => d.hospital === dragData.hospital && d.product_id === dragData.productId);
  if (!deal) return;

  if (deal.status === targetStatus) return; // Same status

  deal.status = targetStatus;
  deal.last_date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  
  if (targetStatus === '데모·샘플평가') {
    deal.demo_info = { date: deal.last_date, note: '칸반 보드에서 데모 진행으로 이동', status: '평가진행중' };
    deal.fail_reasons = [];
  } else if (targetStatus === '도입완료·납품') {
    if (deal.demo_info) deal.demo_info.status = '도입완료';
    deal.fail_reasons = [];
  } else if (targetStatus === '영업실패·보류') {
    if (deal.demo_info) deal.demo_info.status = '회수/종료';
    if (!deal.fail_reasons || deal.fail_reasons.length === 0) {
      deal.fail_reasons = ['의료진 피드백/보류'];
    }
  } else if (targetStatus === 'A/S접수·처리') {
    deal.as_info = { date: deal.last_date, note: '칸반 보드에서 A/S 접수로 이동', status: '접수/진행중' };
  }

  // Update Stats & Re-render
  recalcGlobalStats();
  persistSalesDB();
  selectHospital(dragData.hospital);
  showToast(`✨ [${deal.product_name}] 상태가 '${targetStatus}'(으)로 이동되었습니다!`);
}

// 2. Product Pipeline Kanban Drop Handler
function handleDropToProductKanban(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  let dragData = currentDraggedDeal;
  if (!dragData) {
    try {
      dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch(err) {}
  }
  if (!dragData) return;

  const deal = window.SALES_DB.pipeline.find(d => d.hospital === dragData.hospital && d.product_id === dragData.productId);
  if (!deal) return;

  if (deal.status === targetStatus) return;

  deal.status = targetStatus;
  deal.last_date = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  if (targetStatus === '의료장비 데모' || targetStatus === '소모품 샘플' || targetStatus === '데모·샘플평가') {
    deal.demo_info = { date: deal.last_date, note: `칸반 보드에서 [${targetStatus}] 진행으로 이동`, status: '평가진행중' };
    deal.fail_reasons = [];
  } else if (targetStatus === '도입완료·납품') {
    if (deal.demo_info) deal.demo_info.status = '도입완료';
    deal.fail_reasons = [];
  } else if (targetStatus === '영업실패·보류') {
    if (deal.demo_info) deal.demo_info.status = '회수/종료';
    if (!deal.fail_reasons || deal.fail_reasons.length === 0) {
      deal.fail_reasons = ['의료진 피드백/보류'];
    }
  } else if (targetStatus === 'A/S접수·처리') {
    deal.as_info = { date: deal.last_date, note: '칸반 보드에서 A/S 접수로 이동', status: '접수/진행중' };
  }

  recalcGlobalStats();
  initHeaderMetrics();
  persistSalesDB();
  renderProductPipeline(selectedProductId);
  showToast(`✨ [${deal.hospital}] 상태가 '${targetStatus}'(으)로 이동되었습니다!`);
}

function recalcGlobalStats() {
  const deals = window.SALES_DB.pipeline;
  const stats = window.SALES_DB.stats;

  stats.won_deals = deals.filter(d => d.status === '도입완료·납품').length;
  stats.active_demos = deals.filter(d => d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status === '평가진행중')).length;
  stats.active_as = deals.filter(d => d.status === 'A/S접수·처리' || (d.as_info && d.as_info.status.includes('접수'))).length;
  stats.progress_deals = deals.filter(d => d.status.includes('영업중') || d.status.includes('견적')).length;
  stats.lost_deals = deals.filter(d => d.status === '영업실패·보류').length;

  initHeaderMetrics();
}

function renderKanbanCards(type, deals) {
  const container = document.getElementById(`kanban-cards-${type}`);
  if (!container) return;

  container.innerHTML = '';
  if (deals.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:16px; border:1px dashed rgba(255,255,255,0.08); border-radius:8px;">항목 없음 (드래그하여 이동)</div>`;
    return;
  }

  deals.forEach(d => {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.title = '마우스로 드래그하여 다른 단계로 이동하거나 클릭하여 병원 상황실 이동';

    card.ondragstart = (e) => handleDragStart(e, d.hospital, d.product_id);
    card.ondragend = (e) => handleDragEnd(e);
    card.onclick = (e) => {
      if (!card.classList.contains('dragging')) {
        switchTab('hospital');
        selectHospital(d.hospital);
      }
    };

    let subHtml = '';
    if (d.demo_info && d.demo_info.status.includes('진행')) {
      subHtml = `<div class="kanban-card-note">🔬 ${d.demo_info.date}: ${escapeHtml(d.demo_info.note)}</div>`;
    } else if (d.as_info && d.as_info.status.includes('접수')) {
      subHtml = `<div class="kanban-card-note" style="color:var(--accent-rose);">🚨 ${d.as_info.date}: ${escapeHtml(d.as_info.note)}</div>`;
    } else if (d.fail_reasons && d.fail_reasons.length > 0) {
      const tags = d.fail_reasons.map(r => `<span class="reason-tag">⚠️ ${escapeHtml(r)}</span>`).join(' ');
      subHtml = `<div style="margin-top:4px;">${tags}</div>`;
    } else if (d.latest_note) {
      subHtml = `<div class="kanban-card-note">${escapeHtml(d.latest_note)}</div>`;
    }

    card.innerHTML = `
      <div class="kanban-card-header">
        <span class="kanban-hosp-name" style="display:flex; align-items:center; gap:5px;">
          <span style="font-size:0.8rem; cursor:grab;">🖐️</span>
          <strong>${escapeHtml(d.hospital)}</strong>
        </span>
        <span class="kanban-card-region">${escapeHtml(d.region || '충청')}</span>
      </div>
      <div style="font-size:0.72rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:4px;">
        <span>담당: ${escapeHtml(d.sales_rep || '영업담당')}</span>
        <span>최근: ${escapeHtml(d.last_date || '-')}</span>
      </div>
      ${subHtml}
      <div class="drag-hint-badge">
        <span>↔️ 드래그하여 단계 변경</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ----------------------------------------------------
// ERP Master Modal & Parser
// ----------------------------------------------------
function openErpUploadModal() {
  const modal = document.getElementById('erp-upload-modal');
  pendingErpProducts = [];
  document.getElementById('erp-preview-area').style.display = 'none';
  document.getElementById('btn-apply-erp').style.display = 'none';
  modal.showModal();
}

function closeErpUploadModal() {
  document.getElementById('erp-upload-modal').close();
}

function handleErpFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    parseErpCsvContent(text);
  };
  reader.readAsText(file, 'euc-kr'); // try euc-kr / utf-8
}

function parseErpCsvContent(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    showToast('⚠️ 파일에 데이터가 부족합니다.');
    return;
  }

  // Parse CSV rows
  const parsed = [];
  const header = lines[0].split(',').map(h => h.replace(/["']/g, '').trim());
  
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/["']/g, '').trim());
    if (cols.length >= 2 && cols[0]) {
      const code = cols[0];
      const name = cols[1] || code;
      const spec = cols[2] || '';
      const cat = cols[3] || 'ERP등록품목';
      
      parsed.push({
        id: code,
        name: spec ? `${name} (${spec})` : name,
        category: cat,
        keywords: [code, name, spec].filter(Boolean)
      });
    }
  }

  if (parsed.length === 0) {
    showToast('⚠️ 인식된 ERP 품목이 없습니다. 형식을 확인해주세요.');
    return;
  }

  pendingErpProducts = parsed;
  document.getElementById('erp-preview-area').style.display = 'block';
  document.getElementById('erp-parsed-summary').textContent = `✅ Ecount ERP 품목 ${parsed.length}건 인식 완료!`;
  
  const previewHtml = parsed.slice(0, 8).map(p => `[${p.id}] ${p.name} (분류: ${p.category})`).join('<br>');
  document.getElementById('erp-parsed-preview').innerHTML = previewHtml + (parsed.length > 8 ? `<br>... 외 ${parsed.length - 8}개 품목` : '');
  document.getElementById('btn-apply-erp').style.display = 'inline-block';
}

function applyErpMasterToDB() {
  if (pendingErpProducts.length === 0) return;

  // Merge ERP products into product catalog
  let addedCount = 0;
  pendingErpProducts.forEach(newP => {
    const existing = window.SALES_DB.products.find(p => p.id === newP.id || p.name === newP.name);
    if (!existing) {
      window.SALES_DB.products.push(newP);
      addedCount++;
    } else {
      existing.keywords = Array.from(new Set([...existing.keywords, ...newP.keywords]));
    }
  });

  closeErpUploadModal();
  renderProductPills();
  renderProductPipeline(selectedProductId);
  showToast(`🎉 Ecount ERP 품목 마스터 ${pendingErpProducts.length}건이 성공적으로 등록/동기화되었습니다!`);
}

function renderKanbanCards(stage, deals) {
  const container = document.getElementById(`kanban-cards-${stage}`);
  container.innerHTML = '';

  if (deals.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:16px;">해당 병원 없음</div>`;
    return;
  }

  deals.forEach(d => {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.onclick = () => {
      // Switch to hospital view and open this hospital!
      switchTab('hospital');
      selectHospital(d.hospital);
      showToast(`🏥 ${d.hospital} 병원 360° 뷰로 이동했습니다.`);
    };

    let footerExtra = '';
    if (stage === 'lost' && d.fail_reasons && d.fail_reasons.length) {
      footerExtra = `<div>${d.fail_reasons.map(r => `<span class="reason-tag">⚠️ ${escapeHtml(r)}</span>`).join(' ')}</div>`;
    }

    card.innerHTML = `
      <div class="kanban-card-title">
        <span>${escapeHtml(d.hospital)}</span>
        <span class="kanban-card-region">${escapeHtml(d.region)}</span>
      </div>
      <div class="kanban-card-note">${escapeHtml(d.latest_note || '진행 메모 없음')}</div>
      ${footerExtra}
      <div class="kanban-card-footer" style="margin-top:6px;">
        <span>담당: ${escapeHtml(d.sales_rep || '미정')}</span>
        <span>${d.last_date || ''}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ----------------------------------------------------
// 4. AI Natural Language Sales Assistant
// ----------------------------------------------------
const SAMPLE_TEXTS = {
  1: "오늘 서산중앙병원 심뇌혈관팀장 만나서 엔지오키트 시술용04제품 샘플을 전달했습니다. 다음 주에 써보고 피드백 받기로 하였습니다.",
  2: "미래산부인과 방문함. Oxy9wave 장비 1대 에러나서 수리 의뢰 접수함. 한결메디칼 통해서 다음 주 화요일까지 조치 예정.",
  3: "옥천성모병원에 힙조인트 및 트로카 소개했으나 과장님이 기존 타사 제품 고집하며 가격도 비싸다고 거절하심. 당분간 보류.",
  4: "천안우리병원 수술실 수선생님 미팅 완료. 이지큐본드(EG-Q BOND) 정기 납품 확정되어 다음 달 1차 발주 넣기로 합의함."
};

function loadExample(num) {
  const txt = SAMPLE_TEXTS[num];
  if (txt) {
    document.getElementById('ai-input-text').value = txt;
    parseSalesText();
  }
}

function parseSalesText() {
  const text = (document.getElementById('ai-input-text')?.value || '').trim();
  if (!text) {
    showToast('⚠️ 분석할 영업 내용을 입력해주세요.');
    return;
  }

  // 1. Hospital Matching
  let matchedHospital = '기타 거래처';
  let matchedRegion = '충청권';
  for (const h of window.SALES_DB.hospitals) {
    const cleanHosp = h.name.replace(/병원|의원/g, '').trim();
    if (text.includes(h.name) || (cleanHosp.length >= 2 && text.includes(cleanHosp))) {
      matchedHospital = h.name;
      matchedRegion = h.region;
      break;
    }
  }

  // 2. Product Matching
  let matchedProduct = null;
  for (const prod of window.SALES_DB.products) {
    for (const kw of prod.keywords) {
      if (new RegExp(kw, 'i').test(text)) {
        matchedProduct = prod;
        break;
      }
    }
    if (matchedProduct) break;
  }
  if (!matchedProduct) {
    matchedProduct = { id: "PROD_GENERAL", name: "일반 제안 품목 / 소모품", category: "일반" };
  }

  // 3. Contact Title extraction
  const contactMatch = text.match(/(원장|과장|팀장|수선생님|간호사|사무장|이사|선생|구매과장|구매과|실장)/);
  const matchedContact = contactMatch ? contactMatch[0] : '실무진';

  // 4. Action Type & Pipeline Stage
  let actionType = '관계관리';
  let stage = '제안·영업중';
  let failReasons = [];

  if (/A\/S|AS|에이에스|수리|고장|불량|클레임|에러/.test(text)) {
    actionType = 'A/S·클레임';
    stage = 'A/S접수·처리';
  } else if (/샘플|데모|demo|sample|전달|써보고|테스트/.test(text)) {
    actionType = '샘플·데모';
    stage = '데모·샘플평가';
  } else if (/납품|발주|확정|계약|도입/.test(text)) {
    actionType = '납품·설치';
    stage = '도입완료·납품';
  } else if (/거절|실패|안함|보류|비싸|고집|거부/.test(text)) {
    actionType = '제품설명·소개';
    stage = '영업실패·보류';
    if (/가격|비싸|단가/.test(text)) failReasons.push('단가/가격 부담');
    if (/기존|타사|고집/.test(text)) failReasons.push('기존 거래처/제품 선호');
    if (failReasons.length === 0) failReasons.push('의료진 거절');
  }

  // 5. Next Action Schedule
  let nextSchedule = '익월 정기 방문';
  if (/다음\s*주|담주/.test(text)) nextSchedule = '다음 주 내 피드백 및 방문 확인';
  if (/화요일|수요일|목요일|금요일/.test(text)) nextSchedule = '지정 요일 조치 및 피드백 점검';

  currentParsedData = {
    hospital: matchedHospital,
    region: matchedRegion,
    contact: matchedContact,
    product: matchedProduct,
    actionType: actionType,
    stage: stage,
    failReasons: failReasons,
    nextSchedule: nextSchedule,
    rawText: text,
    date: new Date().toISOString().slice(0, 10).replace(/-/g, '/')
  };

  // Populate Preview
  document.getElementById('parse-res-hospital').textContent = currentParsedData.hospital;
  document.getElementById('parse-res-contact').textContent = currentParsedData.contact;
  document.getElementById('parse-res-product').textContent = currentParsedData.product.name;
  document.getElementById('parse-res-action').textContent = currentParsedData.actionType;
  document.getElementById('parse-res-stage').textContent = currentParsedData.stage;
  document.getElementById('parse-res-reason').textContent = currentParsedData.failReasons.length ? currentParsedData.failReasons.join(', ') : '없음';
  document.getElementById('parse-res-next').textContent = currentParsedData.nextSchedule;

  document.getElementById('btn-save-ai-log').style.display = 'flex';
  showToast('✨ AI가 영업일지를 100% 구조화하여 분류했습니다!');
}

function saveParsedLogToDB() {
  if (!currentParsedData) return;

  const p = currentParsedData;
  
  // 1. Add to activity logs
  const newLog = {
    id: `LOG_${Date.now()}`,
    date: p.date,
    hospital: p.hospital,
    region: p.region,
    sales_rep: '나(영업담당)',
    contact: p.contact,
    action_type: p.actionType,
    deal_status: p.stage,
    products: [p.product.name],
    title: `${p.hospital} ${p.product.name} ${p.actionType}`,
    note: `${p.rawText}\n다음: ${p.nextSchedule}`,
    fail_reasons: p.failReasons
  };
  window.SALES_DB.activity_logs.unshift(newLog);

  // 2. Update Deal Pipeline
  const dealKey = `${p.hospital}___${p.product.id}`;
  let deal = window.SALES_DB.pipeline.find(d => d.hospital === p.hospital && d.product_id === p.product.id);
  if (!deal) {
    deal = {
      hospital: p.hospital,
      product_id: p.product.id,
      product_name: p.product.name,
      product_category: p.product.category,
      region: p.region,
      sales_rep: '나(영업담당)',
      status: p.stage,
      last_date: p.date,
      latest_action: p.actionType,
      latest_note: p.rawText,
      fail_reasons: p.failReasons,
      demo_info: p.actionType === '샘플·데모' ? { date: p.date, note: p.rawText, status: '평가진행중' } : null,
      as_info: p.actionType === 'A/S·클레임' ? { date: p.date, note: p.rawText, status: '접수/진행중' } : null,
      history_count: 1
    };
    window.SALES_DB.pipeline.push(deal);
  } else {
    deal.status = p.stage;
    deal.last_date = p.date;
    deal.latest_action = p.actionType;
    deal.latest_note = p.rawText;
    if (p.failReasons.length) deal.fail_reasons = p.failReasons;
    if (p.actionType === '샘플·데모') deal.demo_info = { date: p.date, note: p.rawText, status: '평가진행중' };
    if (p.actionType === 'A/S·클레임') deal.as_info = { date: p.date, note: p.rawText, status: '접수/진행중' };
  }

  // 3. Update Hospital Master stats
  let hosp = window.SALES_DB.hospitals.find(h => h.name === p.hospital);
  if (hosp) {
    hosp.last_activity_date = p.date;
    hosp.total_logs += 1;
    if (p.contact && !hosp.contacts.includes(p.contact)) hosp.contacts.push(p.contact);
  }

  // Re-calculate stats
  window.SALES_DB.stats.total_logs++;
  initHeaderMetrics();

  showToast(`🎉 [${p.hospital}] ${p.product.name} 일지 및 파이프라인이 즉시 저장되었습니다!`);

  // Switch to hospital view
  setTimeout(() => {
    switchTab('hospital');
    selectHospital(p.hospital);
  }, 1000);
}

// ----------------------------------------------------
// 5. Analytics Charts
// ----------------------------------------------------
function initAnalyticsView() {
  renderAnalytics();
}

function renderAnalytics() {
  const logs = window.SALES_DB.activity_logs;
  
  // 1. Rep Activity
  const repCounts = {};
  logs.forEach(l => {
    const rep = l.sales_rep || '미정';
    repCounts[rep] = (repCounts[rep] || 0) + 1;
  });
  renderBarChart('chart-rep-bars', repCounts, 'var(--accent-blue)', logs.length);

  // 2. Regional Breakdown
  const regCounts = {};
  logs.forEach(l => {
    const r = l.region || '기타';
    regCounts[r] = (regCounts[r] || 0) + 1;
  });
  renderBarChart('chart-region-bars', regCounts, 'var(--accent-purple)', logs.length);

  // 3. Action Breakdown
  const actCounts = {};
  logs.forEach(l => {
    const a = l.action_type || '관계관리';
    actCounts[a] = (actCounts[a] || 0) + 1;
  });
  renderBarChart('chart-action-bars', actCounts, 'var(--accent-cyan)', logs.length);

  // 4. Lost Reason Breakdown
  const lostCounts = {};
  window.SALES_DB.pipeline.forEach(d => {
    if (d.fail_reasons && d.fail_reasons.length) {
      d.fail_reasons.forEach(r => {
        lostCounts[r] = (lostCounts[r] || 0) + 1;
      });
    }
  });
  renderBarChart('chart-lost-bars', lostCounts, 'var(--accent-rose)', 32);
}

function renderBarChart(containerId, dataMap, color, total) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const entries = Object.entries(dataMap).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...Object.values(dataMap), 1);

  entries.forEach(([label, count]) => {
    const pct = Math.round((count / maxVal) * 100);
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%; background:${color};"></div>
      </div>
      <span class="bar-val">${count}건</span>
    `;
    container.appendChild(row);
  });
}

// ----------------------------------------------------
// Utilities
// ----------------------------------------------------
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ====================================================
// EXCEL ALL LOGS SPREADSHEET MASTER & EDIT ENGINE
// ====================================================
let currentFilteredExcelLogs = [];

function openAllLogsExcelModal() {
  const modal = document.getElementById('all-logs-excel-modal');
  if (!modal) return;
  modal.showModal();
  document.getElementById('excel-log-search-input').value = '';
  document.getElementById('excel-filter-rep').value = '';
  document.getElementById('excel-filter-action').value = '';
  document.getElementById('excel-filter-region').value = '';
  renderExcelLogsTable();
}

function closeAllLogsExcelModal() {
  const modal = document.getElementById('all-logs-excel-modal');
  if (modal) modal.close();
}

let excelSearchDebounceTimer = null;
function handleExcelLogSearch() {
  clearTimeout(excelSearchDebounceTimer);
  excelSearchDebounceTimer = setTimeout(() => {
    renderExcelLogsTable();
  }, 60);
}

function clearExcelLogSearch() {
  const input = document.getElementById('excel-log-search-input');
  if (input) input.value = '';
  renderExcelLogsTable();
}

function renderExcelLogsTable() {
  const tbody = document.getElementById('excel-log-tbody');
  const searchInput = document.getElementById('excel-log-search-input');
  const clearBtn = document.getElementById('excel-search-clear');
  const repFilter = document.getElementById('excel-filter-rep')?.value || '';
  const actionFilter = document.getElementById('excel-filter-action')?.value || '';
  const regionFilter = document.getElementById('excel-filter-region')?.value || '';
  
  const query = (searchInput?.value || '').trim().toLowerCase();
  if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

  if (!window.SALES_DB || !window.SALES_DB.activity_logs) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">데이터가 없습니다.</td></tr>';
    return;
  }

  const allLogs = window.SALES_DB.activity_logs;
  
  // Filter logic
  currentFilteredExcelLogs = allLogs.map((log, origIndex) => ({ ...log, origIndex })).filter(log => {
    if (repFilter && log.sales_rep !== repFilter) return false;
    if (actionFilter && log.action_type !== actionFilter) return false;
    if (regionFilter && log.region !== regionFilter) return false;

    if (!query) return true;

    const cleanQ = query.replace(/\s+/g, '');
    const hosp = (log.hospital || '').toLowerCase();
    const cleanHosp = hosp.replace(/\s+/g, '');
    const rep = (log.sales_rep || '').toLowerCase();
    const action = (log.action_type || '').toLowerCase();
    const title = (log.title || '').toLowerCase();
    const note = (log.note || '').toLowerCase();
    const nextAction = (log.next_action || '').toLowerCase();
    const prodStr = (log.products || []).join(' ').toLowerCase();
    const prodCode = (log.product_code || '').toLowerCase();

    return hosp.includes(query) ||
           cleanHosp.includes(cleanQ) ||
           rep.includes(query) ||
           action.includes(query) ||
           title.includes(query) ||
           title.replace(/\s+/g, '').includes(cleanQ) ||
           note.includes(query) ||
           note.replace(/\s+/g, '').includes(cleanQ) ||
           nextAction.includes(query) ||
           prodStr.includes(query) ||
           prodCode.includes(query);
  });

  // Sort by date descending (Newest first)
  currentFilteredExcelLogs.sort((a, b) => {
    const dateA = (a.date || '').replace(/[\/\-\.]/g, '');
    const dateB = (b.date || '').replace(/[\/\-\.]/g, '');
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const idA = typeof a.id === 'number' ? a.id : (typeof a.origIndex === 'number' ? a.origIndex : 0);
    const idB = typeof b.id === 'number' ? b.id : (typeof b.origIndex === 'number' ? b.origIndex : 0);
    return idB - idA;
  });

  // Update counts
  const totalCountEl = document.getElementById('excel-log-total-count');
  const filteredCountEl = document.getElementById('excel-filtered-count-text');
  if (totalCountEl) totalCountEl.textContent = `${allLogs.length}건`;
  if (filteredCountEl) filteredCountEl.textContent = `전체 ${allLogs.length}건 중 ${currentFilteredExcelLogs.length}건 표시`;

  if (currentFilteredExcelLogs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted);">
          🔍 '${escapeHtml(query)}' 검색 조건에 일치하는 영업일지가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  // Action badge color mapping
  const actionBadges = {
    '제품설명·소개': 'badge-blue',
    '샘플·데모': 'badge-amber',
    '납품·설치': 'badge-emerald',
    'A/S·클레임': 'badge-rose',
    '견적제출': 'badge-cyan',
    '관계관리': 'badge-purple',
    '수금·결제': 'badge-emerald',
    '신규접촉': 'badge-blue'
  };

  tbody.innerHTML = currentFilteredExcelLogs.map((log, idx) => {
    const prodDisplay = (log.products && log.products.length) ? log.products[0] : (log.product_name || '일반 제안 품목');
    const codeDisplay = log.product_code ? ` [${log.product_code}]` : '';
    const badgeClass = actionBadges[log.action_type] || 'badge-blue';

    return `
      <tr ondblclick="openEditActivityLogModal(${log.origIndex})" title="더블클릭하여 이 영업일지 수정하기" class="excel-row">
        <td style="text-align:center; color:var(--text-muted); font-size:0.78rem;">${idx + 1}</td>
        <td style="text-align:center; font-weight:700; color:var(--accent-cyan); font-size:0.82rem; white-space:nowrap; letter-spacing:-0.3px;">${escapeHtml(log.date || '')}</td>
        <td>
          <span class="excel-hosp-name" onclick="selectHospitalFromExcel('${escapeHtml(log.hospital)}')" title="병원 360 상황실로 바로가기">${escapeHtml(log.hospital || '')}</span>
        </td>
        <td style="text-align:center; font-weight:600;">${escapeHtml(log.sales_rep || '')}</td>
        <td>
          <div class="excel-prod-cell" title="${escapeHtml(prodDisplay + codeDisplay)}">
            <span style="font-weight:600; color:#fff;">${escapeHtml(prodDisplay)}</span>
            <span style="font-size:0.72rem; color:var(--accent-cyan);">${escapeHtml(codeDisplay)}</span>
          </div>
        </td>
        <td style="text-align:center;">
          <span class="excel-badge-tag ${badgeClass}">${escapeHtml(log.action_type || '관계관리')}</span>
        </td>
        <td>
          <div class="excel-note-cell" title="${escapeHtml(log.note || log.title || '')}">
            ${escapeHtml(log.note || log.title || '')}
          </div>
        </td>
        <td>
          <div class="excel-action-cell" title="${escapeHtml(log.next_action || '-')}">
            ${log.next_action ? `📅 ${escapeHtml(log.next_action)}` : '<span style="color:var(--text-muted);">-</span>'}
          </div>
        </td>
        <td style="text-align:center;">
          <button class="btn-table-edit" onclick="openEditActivityLogModal(${log.origIndex})" title="일지 수정">✏️ 수정</button>
        </td>
      </tr>
    `;
  }).join('');
}

function selectHospitalFromExcel(hospName) {
  closeAllLogsExcelModal();
  switchTab('hospital');
  selectHospital(hospName);
}

// ----------------------------------------------------
// EXPORT TO CSV (EXCEL)
// ----------------------------------------------------
function exportLogsToCSV() {
  if (!currentFilteredExcelLogs || !currentFilteredExcelLogs.length) {
    showToast('내보낼 영업일지 데이터가 없습니다.');
    return;
  }

  const headers = ['No', '일자', '거래처(병원명)', '영업담당자', 'ERP품목명', '품목코드', '활동분류', '영업내용 및 메모', '다음할일'];
  const rows = currentFilteredExcelLogs.map((l, idx) => [
    idx + 1,
    l.date || '',
    l.hospital || '',
    l.sales_rep || '',
    (l.products && l.products.length ? l.products[0] : (l.product_name || '')),
    l.product_code || '',
    l.action_type || '',
    (l.note || l.title || '').replace(/"/g, '""'),
    (l.next_action || '').replace(/"/g, '""')
  ]);

  let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
  csvContent += headers.join(",") + "\n";
  rows.forEach(r => {
    csvContent += r.map(field => `"${field}"`).join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const now = new Date().toISOString().slice(0,10);
  link.setAttribute("href", url);
  link.setAttribute("download", `준메디칼_영업일지_마스터_${now}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📥 엑셀(CSV) 파일이 성공적으로 다운로드되었습니다.');
}

function openEditLogModal(hosp, date, title) {
  // Find index in activity_logs
  const idx = window.SALES_DB.activity_logs.findIndex(l => 
    l.hospital === hosp && l.date === date && (l.title === title || l.note === title)
  );
  if (idx !== -1) {
    openEditActivityLogModal(idx);
  } else {
    const fallbackIdx = window.SALES_DB.activity_logs.findIndex(l => l.hospital === hosp && l.date === date);
    if (fallbackIdx !== -1) {
      openEditActivityLogModal(fallbackIdx);
    } else {
      openNewActivityLogModal();
    }
  }
}

function openEditActivityLogModal(logIndex) {
  const modal = document.getElementById('edit-activity-log-modal');
  if (!modal) return;

  const log = window.SALES_DB.activity_logs[logIndex];
  if (!log) return;

  document.getElementById('edit-log-modal-title').textContent = '✏️ 영업활동 일지 상세 수정 / 삭제';
  document.getElementById('edit-log-index').value = logIndex;
  document.getElementById('edit-log-hospital').value = log.hospital || '';
  document.getElementById('edit-log-sales-rep').value = log.sales_rep || '이우식';
  document.getElementById('edit-log-date').value = log.date || new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  document.getElementById('edit-log-action-type').value = log.action_type || '제품설명·소개';
  
  const prodName = (log.products && log.products.length) ? log.products[0] : (log.product_name || '일반 제안 품목');
  const prodCode = log.product_code || 'PROD_GENERAL';
  
  document.getElementById('edit-log-product-name').value = prodName;
  document.getElementById('edit-log-product-code').value = prodCode;
  document.getElementById('edit-log-product-name-display').textContent = prodName;
  document.getElementById('edit-log-product-code-display').textContent = `[${prodCode}]`;
  
  document.getElementById('edit-log-title').value = log.title || '';
  document.getElementById('edit-log-note').value = log.note || '';
  document.getElementById('edit-log-next-action').value = log.next_action || '';
  
  document.getElementById('edit-log-erp-search-box').style.display = 'none';

  modal.showModal();
}

function openNewActivityLogModal() {
  const modal = document.getElementById('edit-activity-log-modal');
  if (!modal) return;

  document.getElementById('edit-log-modal-title').textContent = '➕ 신규 영업활동 일지 직접 등록';
  document.getElementById('edit-log-index').value = -1;
  document.getElementById('edit-log-hospital').value = selectedHospitalName || '';
  document.getElementById('edit-log-sales-rep').value = '이우식';
  document.getElementById('edit-log-date').value = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  document.getElementById('edit-log-action-type').value = '제품설명·소개';
  
  document.getElementById('edit-log-product-name').value = '일반 제안 품목';
  document.getElementById('edit-log-product-code').value = 'PROD_GENERAL';
  document.getElementById('edit-log-product-name-display').textContent = '일반 제안 품목';
  document.getElementById('edit-log-product-code-display').textContent = '[PROD_GENERAL]';
  
  document.getElementById('edit-log-title').value = '';
  document.getElementById('edit-log-note').value = '';
  document.getElementById('edit-log-next-action').value = '';
  
  document.getElementById('edit-log-erp-search-box').style.display = 'none';

  modal.showModal();
}

function closeEditActivityLogModal() {
  const modal = document.getElementById('edit-activity-log-modal');
  if (modal) modal.close();
}

function toggleEditLogProductSearchBox() {
  const box = document.getElementById('edit-log-erp-search-box');
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('edit-log-erp-search-input');
    input.value = '';
    searchErpProductsForLogEdit('');
    input.focus();
  }
}

function searchErpProductsForLogEdit(keyword) {
  const resContainer = document.getElementById('edit-log-erp-search-results');
  if (!resContainer) return;
  const rawMaster = window.ERP_PRODUCTS_MASTER || (window.SALES_DB ? window.SALES_DB.products : []) || [];
  const master = rawMaster.filter(p => {
    if (p.use_by === 'N' || p.use_by === 'n' || p.is_active === false) return false;
    if (p.status && (p.status.includes('중단') || p.status.includes('중지'))) return false;
    return true;
  });
  const normQ = normalizeFullWidthToHalfWidth(keyword).trim().toLowerCase();
  const cleanQ = normQ.replace(/[\s\-_]/g, '');

  let filtered = [];
  if (!normQ) {
    filtered = master.slice(0, 15);
  } else {
    filtered = master.filter(p => {
      const pCode = (p.code || p.id || '').toLowerCase();
      const pName = (p.name || '').toLowerCase();
      const pSpec = (p.spec || '').toLowerCase();
      const cleanCode = pCode.replace(/[\s\-_]/g, '');
      const cleanName = pName.replace(/[\s\-_]/g, '');

      return pName.includes(normQ) ||
             pCode.includes(normQ) ||
             pSpec.includes(normQ) ||
             cleanCode.includes(cleanQ) ||
             cleanName.includes(cleanQ) ||
             (p.keywords && p.keywords.some(k => String(k).toLowerCase().includes(normQ) || String(k).replace(/[\s\-_]/g, '').includes(cleanQ)));
    }).slice(0, 30);
  }

  if (filtered.length === 0) {
    resContainer.innerHTML = '<div style="padding:8px; color:var(--text-muted); text-align:center;">일치하는 ERP 품목이 없습니다.</div>';
    return;
  }

  resContainer.innerHTML = filtered.map(p => `
    <div onclick="selectErpProductForLogEdit('${escapeHtml(p.code)}', '${escapeHtml(p.name)}')" 
         style="padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.06); cursor:pointer; display:flex; justify-content:space-between; align-items:center;"
         onmouseover="this.style.background='rgba(56,189,248,0.15)'" onmouseout="this.style.background='transparent'">
      <div>
        <span style="font-weight:700; color:#fff;">${escapeHtml(p.name)}</span>
        <span style="font-size:0.75rem; color:var(--text-muted); margin-left:6px;">${escapeHtml(p.spec || '')}</span>
      </div>
      <span style="font-family:monospace; font-size:0.72rem; color:var(--accent-cyan); background:rgba(0,0,0,0.4); padding:2px 6px; border-radius:4px;">${escapeHtml(p.code)}</span>
    </div>
  `).join('');
}

function selectErpProductForLogEdit(code, name) {
  document.getElementById('edit-log-product-name').value = name;
  document.getElementById('edit-log-product-code').value = code;
  document.getElementById('edit-log-product-name-display').textContent = name;
  document.getElementById('edit-log-product-code-display').textContent = `[${code}]`;
  document.getElementById('edit-log-erp-search-box').style.display = 'none';
  showToast(`품목 매핑 변경: ${name} [${code}]`);
}

function saveEditedActivityLog() {
  const index = parseInt(document.getElementById('edit-log-index').value, 10);
  const hosp = document.getElementById('edit-log-hospital').value.trim();
  const rep = document.getElementById('edit-log-sales-rep').value;
  const date = document.getElementById('edit-log-date').value.trim();
  const actionType = document.getElementById('edit-log-action-type').value;
  const prodName = document.getElementById('edit-log-product-name').value.trim();
  const prodCode = document.getElementById('edit-log-product-code').value.trim();
  const title = document.getElementById('edit-log-title').value.trim() || `[${actionType}] ${prodName}`;
  const note = document.getElementById('edit-log-note').value.trim();
  const nextAction = document.getElementById('edit-log-next-action').value.trim();

  if (!hosp) {
    alert('거래처(병원명)를 입력해주세요.');
    return;
  }
  if (!date) {
    alert('활동 일자를 입력해주세요.');
    return;
  }
  if (!note) {
    alert('상세 영업내용을 입력해주세요.');
    return;
  }

  const logData = {
    hospital: hosp,
    date: date,
    sales_rep: rep,
    action_type: actionType,
    title: title,
    note: note,
    products: [prodName],
    product_code: prodCode,
    next_action: nextAction,
    region: '세종충북'
  };

  const existingHosp = window.SALES_DB.hospitals.find(h => h.name === hosp);
  if (existingHosp) {
    logData.region = existingHosp.region || '세종충북';
  }

  let prevHospName = null;
  if (index >= 0 && index < window.SALES_DB.activity_logs.length) {
    const existingLog = window.SALES_DB.activity_logs[index];
    prevHospName = existingLog.hospital;
    if (existingLog.id) {
      logData.id = existingLog.id;
    }
    window.SALES_DB.activity_logs[index] = logData;
    showToast(`✅ [${hosp}] 영업일지가 성공적으로 수정되었습니다.`);

    if (supabaseClient) {
      supabaseClient.from('activity_logs').upsert([logData]).then(({ error }) => {
        if (error) console.warn('Supabase upsert error:', error);
        else console.log('⚡ Supabase log updated successfully');
      });
    }
  } else {
    window.SALES_DB.activity_logs.unshift(logData);
    window.SALES_DB.stats.total_logs = window.SALES_DB.activity_logs.length;
    showToast(`✅ [${hosp}] 신규 영업일지가 성공적으로 등록되었습니다.`);

    if (supabaseClient) {
      supabaseClient.from('activity_logs').insert([logData]).then(({ error }) => {
        if (error) console.warn('Supabase insert error:', error);
        else console.log('⚡ Supabase log inserted successfully');
      });
    }
  }

  // Recalculate hospital stats
  if (prevHospName && prevHospName !== hosp) {
    const prevHospObj = window.SALES_DB.hospitals.find(h => h.name === prevHospName);
    if (prevHospObj && prevHospObj.total_logs > 0) prevHospObj.total_logs--;
  }
  const newHospObj = window.SALES_DB.hospitals.find(h => h.name === hosp);
  if (newHospObj) {
    newHospObj.total_logs = (newHospObj.total_logs || 0) + 1;
    newHospObj.last_activity_date = date;
    if (!newHospObj.products_active.includes(prodName)) newHospObj.products_active.push(prodName);
  }

  // Sync hospitals from logs to ensure consistency
  syncHospitalsFromLogs();

  persistSalesDB();
  recalcGlobalStats();
  initHeaderMetrics();
  renderHospitalList();
  renderExcelLogsTable();
  
  // Refresh active hospital details immediately
  if (selectedHospitalName) {
    selectHospital(selectedHospitalName);
  }

  closeEditActivityLogModal();
}

async function deleteActivityLog() {
  const index = parseInt(document.getElementById('edit-log-index').value, 10);
  if (index < 0 || index >= window.SALES_DB.activity_logs.length) return;

  const log = window.SALES_DB.activity_logs[index];
  const targetHosp = log.hospital;
  if (!confirm(`정말로 [${targetHosp}]의 "${log.title || log.note}" 영업일지를 영구 삭제하시겠습니까?`)) {
    return;
  }

  // 1. Delete from Supabase Cloud DB
  if (supabaseClient) {
    try {
      let delQuery = supabaseClient.from('activity_logs').delete();
      if (log.id) {
        delQuery = delQuery.eq('id', log.id);
      } else {
        delQuery = delQuery.eq('hospital', targetHosp).eq('date', log.date).eq('note', log.note);
      }
      const { error } = await delQuery;
      if (error) console.warn('Supabase log delete warning:', error);
      else console.log(`⚡ Deleted log for [${targetHosp}] from Supabase Cloud successfully.`);
    } catch(err) {
      console.warn('Supabase log delete error:', err);
    }
  }

  // 2. Remove from Local Memory
  window.SALES_DB.activity_logs.splice(index, 1);
  window.SALES_DB.stats.total_logs = window.SALES_DB.activity_logs.length;

  // 3. Update Hospital log count if exists
  const hospObj = window.SALES_DB.hospitals.find(h => h.name === targetHosp);
  // Sync hospitals from logs
  syncHospitalsFromLogs();

  // 4. Persist Local Storage & Refresh Active Views
  persistSalesDB();
  recalcGlobalStats();
  initHeaderMetrics();
  renderHospitalList();
  renderExcelLogsTable();
  if (selectedHospitalName) {
    selectHospital(selectedHospitalName);
  }
  closeEditActivityLogModal();
  showToast('🗑️ 영업일지가 영구적으로 삭제되었습니다.');
}

// ----------------------------------------------------
// 9. AI Smart Daily Log Parser Engine (Editable + Rep Selector)
// ----------------------------------------------------
let currentAiSelectedRep = "최진웅";

function setAiLogSalesRep(rep, btnEl) {
  currentAiSelectedRep = rep;
  document.querySelectorAll('.rep-chip-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const badge = document.getElementById('selected-rep-badge');
  if (badge) badge.textContent = rep;

  const selectEl = document.getElementById('parse-edit-sales-rep');
  if (selectEl) selectEl.value = rep;

  showToast(`👤 작성자(담당자)가 '${rep}'(으)로 선택되었습니다.`);
}

function onSelectRepChange(rep) {
  currentAiSelectedRep = rep;
  const badge = document.getElementById('selected-rep-badge');
  if (badge) badge.textContent = rep;

  document.querySelectorAll('.rep-chip-btn').forEach(b => {
    if (b.textContent.trim() === rep) b.classList.add('active');
    else b.classList.remove('active');
  });
}

function initHospitalDataList() {
  const datalist = document.getElementById('hospitals-datalist');
  if (!datalist || !window.SALES_DB || !window.SALES_DB.hospitals) return;
  datalist.innerHTML = window.SALES_DB.hospitals.map(h => `<option value="${escapeHtml(h.name)}">`).join('');
}

function toggleAiParsedProductSearch() {
  const box = document.getElementById('ai-parse-product-search-box');
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('ai-parse-product-search-input');
    input.value = '';
    searchErpProductsForAiParser('');
    input.focus();
  }
}

function searchErpProductsForAiParser(query) {
  const container = document.getElementById('ai-parse-product-search-results');
  if (!container) return;
  const rawMaster = (window.ERP_PRODUCTS_MASTER && window.ERP_PRODUCTS_MASTER.length > 0) 
                  ? window.ERP_PRODUCTS_MASTER 
                  : (window.SALES_DB ? window.SALES_DB.products : []) || [];
  const master = rawMaster.filter(p => {
    if (p.use_by === 'N' || p.use_by === 'n' || p.is_active === false) return false;
    if (p.status && (p.status.includes('중단') || p.status.includes('중지'))) return false;
    return true;
  });
  const normQ = normalizeFullWidthToHalfWidth(query).trim().toLowerCase();
  const cleanQ = normQ.replace(/[\s\-_]/g, '');

  let matches = master;
  if (normQ) {
    matches = master.filter(p => {
      const pCode = (p.code || p.id || '').toLowerCase();
      const pName = (p.name || '').toLowerCase();
      const pSpec = (p.spec || '').toLowerCase();
      const cleanCode = pCode.replace(/[\s\-_]/g, '');
      const cleanName = pName.replace(/[\s\-_]/g, '');

      return pCode.includes(normQ) ||
             pName.includes(normQ) ||
             pSpec.includes(normQ) ||
             cleanCode.includes(cleanQ) ||
             cleanName.includes(cleanQ) ||
             (p.keywords && p.keywords.some(k => String(k).toLowerCase().includes(normQ) || String(k).replace(/[\s\-_]/g, '').includes(cleanQ)));
    });
  }

  container.innerHTML = '';
  const top15 = matches.slice(0, 15);
  if (top15.length === 0) {
    container.innerHTML = '<div style="padding:8px; color:var(--text-muted); text-align:center; font-size:0.75rem;">일치하는 4,069개 ERP 품목이 없습니다.</div>';
    return;
  }

  top15.forEach(p => {
    const item = document.createElement('div');
    const pCode = p.code || p.id;
    item.style.cssText = 'padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:4px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; transition:background 0.15s; margin-bottom:2px;';
    item.onmouseover = () => item.style.background = 'rgba(56,189,248,0.2)';
    item.onmouseout = () => item.style.background = 'rgba(255,255,255,0.06)';
    item.innerHTML = `
      <div>
        <span style="font-weight:700; color:#fff;">${escapeHtml(p.name)}</span>
        <span style="font-size:0.7rem; color:var(--accent-cyan); margin-left:6px;">[${escapeHtml(pCode)}] ${p.spec ? `(${escapeHtml(p.spec)})` : ''}</span>
      </div>
      <button type="button" class="mini-badge" style="background:var(--accent-blue); color:#fff; border:none; padding:2px 6px; border-radius:4px;">선택</button>
    `;
    item.onclick = () => {
      document.getElementById('parse-edit-product-name').value = `${p.name} (${pCode})`;
      document.getElementById('parse-edit-product-code').value = pCode;
      document.getElementById('ai-parse-product-search-box').style.display = 'none';
      showToast(`📦 품목이 '${p.name}' [${pCode}](으)로 변경되었습니다.`);
    };
    container.appendChild(item);
  });
}

const AI_EXAMPLES = {
  1: "오늘 천안아산 미래여성병원 김원장님 면담하여 펀치바이옵시 샘플 3개 전달함. 다음주 수요일(3/4)에 임상 사용 후 피드백 및 코드 생성 여부 알려주기로 하셨음.",
  2: "청주 마디사랑병원 수술실 간호과장님 긴급 연락. 소공포 10번 홀 제품 접착력 문제 A/S 접수되어 내일 오전 즉시 방문하여 교환 조치 예정.",
  3: "대전 새손병원 이과장님 미팅함. 세종 멸균 소공포 제안하였으나 기존 타사 거래처 제품 선호 및 단가 부담으로 영업 보류 피드백 받음.",
  4: "모태안여성병원 박원장님 최종 미팅 완료. 서지소드 DF 11번(PK-11DM02) 5박스 정규 납품 확정! 매월 정기 주문 진행하기로 함."
};

function loadExample(idx) {
  const text = AI_EXAMPLES[idx] || "";
  const inputEl = document.getElementById('ai-input-text');
  if (inputEl) {
    inputEl.value = text;
    parseSalesText();
  }
}

// ----------------------------------------------------
// 9-1. Google Gemini Free AI Engine Integration
// ----------------------------------------------------
const GEMINI_CONFIG_KEY = "JUN_GEMINI_CONFIG_V1";
let geminiConfig = {
  apiKey: localStorage.getItem(GEMINI_CONFIG_KEY + "_KEY") || "",
  model: localStorage.getItem(GEMINI_CONFIG_KEY + "_MODEL") || "gemini-1.5-flash",
  engineType: localStorage.getItem(GEMINI_CONFIG_KEY + "_ENGINE") || "gemini"
};

function initGeminiUI() {
  const statusEl = document.getElementById('gemini-key-status');
  if (statusEl) {
    if (geminiConfig.apiKey) {
      statusEl.textContent = `● Gemini Flash 연결됨 (${geminiConfig.model})`;
      statusEl.style.color = '#10b981';
    } else {
      statusEl.textContent = '○ Gemini 키 미등록 (내장 고속 엔진 동작)';
      statusEl.style.color = '#f59e0b';
    }
  }
  const keyInput = document.getElementById('gemini-api-key-input');
  if (keyInput) keyInput.value = geminiConfig.apiKey;
  const modelSelect = document.getElementById('gemini-model-select');
  if (modelSelect) modelSelect.value = geminiConfig.model;
}

function openGeminiConfigModal() {
  initGeminiUI();
  const modal = document.getElementById('gemini-config-modal');
  if (modal) modal.showModal();
}

function closeGeminiConfigModal() {
  const modal = document.getElementById('gemini-config-modal');
  if (modal) modal.close();
}

function saveGeminiApiKey() {
  const key = (document.getElementById('gemini-api-key-input')?.value || '').trim();
  const model = document.getElementById('gemini-model-select')?.value || 'gemini-1.5-flash';
  geminiConfig.apiKey = key;
  geminiConfig.model = model;
  localStorage.setItem(GEMINI_CONFIG_KEY + "_KEY", key);
  localStorage.setItem(GEMINI_CONFIG_KEY + "_MODEL", model);
  initGeminiUI();
  closeGeminiConfigModal();
  if (key) {
    showToast(`✨ Google Gemini AI 키가 성공적으로 저장 및 활성화되었습니다!`);
  } else {
    showToast(`ℹ️ Gemini API 키가 비워져 내장 고속 엔진으로 동작합니다.`);
  }
}

function toggleAiEngine(engineType) {
  geminiConfig.engineType = engineType;
  localStorage.setItem(GEMINI_CONFIG_KEY + "_ENGINE", engineType);
  if (engineType === 'gemini' && !geminiConfig.apiKey) {
    showToast(`💡 Gemini API 키를 등록하시면 더 정밀한 AI 분석을 사용할 수 있습니다. (설정창 오픈)`);
    openGeminiConfigModal();
  }
}

async function callGeminiAPI(text) {
  const apiKey = geminiConfig.apiKey;
  if (!apiKey) return null;

  const model = geminiConfig.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `당신은 의료기기 전문 유통기업 '준메디칼'의 영업 분석 AI 비서입니다.
영업사원이 음성 또는 텍스트로 두서없이 작성한 영업 활동 메모를 분석하여, 준메디칼의 데이터 규격에 맞는 완벽한 JSON 객체로 구조화하여 반환하세요.

[사내 등록 영업사원 7인]:
최진웅, 이은필, 이재덕, 이우식, 원유훈, 이상미, 이우진

[활동 유형 9종]:
"제품설명·소개", "의료장비 데모", "소모품 샘플", "납품·설치", "A/S·클레임", "견적제출", "관계관리", "수금·결제", "신규접촉"

[파이프라인 진행 상태 7종]:
"도입완료·납품", "의료장비 데모", "소모품 샘플", "제품소개·영업중", "견적·의사결정", "A/S접수·처리", "영업실패·보류"

[규칙]:
1. hospital: 거래처/병원명. 본문에 명시된 병원명(예: 광제산부인과, 진천 미래산부인과, 순천향대학교 천안병원 등).
2. contact: 상대 의료진/담당자 이름 및 직함 (예: 김원장, 박과장, 김희웅 영상의학실장). 언급이 없으면 반드시 빈 문자열 ""
3. sales_rep: 7인 중 본문에 언급된 사원이 있으면 해당 사원명, 없으면 빈 문자열 ""
4. product_name: 언급된 의료기기/소모품명 (예: Oxy9Wave 휴대형 산소포화도 측정기, 서지 소드 안전 메스, Drive Motor Handle 등). 만약 특정 제품 언급 없이 첫 방문/인사/면담시도/불발/원내 탐색/라포 형성인 경우 반드시 "신규 접촉 및 인사 (품목 미정)"으로 출력하세요.
5. product_code: 매칭되는 품목코드. 특정 제품이 없거나 단순 인사/탐색인 경우 반드시 "PROD_GENERAL"로 출력하세요.
6. action_type: 위 활동 유형 중 가장 알맞은 1개. 제품 언급 없는 첫 방문/인사는 "신규접촉" 또는 "관계관리". 장비 데모는 "의료장비 데모", 소모품 샘플은 "소모품 샘플".
7. sales_status: 위 파이프라인 진행 상태 중 가장 알맞은 1개. 단순 인사/첫 방문은 "제품소개·영업중".
8. fail_reason: 특이사항 또는 실패 사유 (없으면 "-")
9. next_action: 다음 할 일 또는 후속 일정 요약 문장

[영업 메모]:
${text}

반드시 순수한 JSON 형식으로만 응답하세요:
{
  "hospital": "...",
  "contact": "...",
  "sales_rep": "...",
  "product_name": "...",
  "product_code": "...",
  "action_type": "...",
  "sales_status": "...",
  "fail_reason": "...",
  "next_action": "..."
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn("Gemini API HTTP Error:", res.status, errText);
    throw new Error(`Gemini API Error (${res.status})`);
  }

  const json = await res.json();
  const rawReply = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawReply) return null;

  try {
    return JSON.parse(rawReply);
  } catch(e) {
    console.warn("Failed to parse Gemini JSON:", rawReply);
    const cleaned = rawReply.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

function applyParsedResultToUI(data, rawText, isFromGemini = false) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };

  const rep = data.sales_rep || currentAiSelectedRep;
  if (data.sales_rep) {
    currentAiSelectedRep = data.sales_rep;
    document.querySelectorAll('.rep-chip-btn').forEach(b => {
      if (b.textContent.trim() === data.sales_rep) b.classList.add('active');
      else b.classList.remove('active');
    });
    const badge = document.getElementById('selected-rep-badge');
    if (badge) badge.textContent = data.sales_rep;
  }

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  setVal('parse-edit-sales-rep', rep);
  setVal('parse-edit-date', todayStr);
  setVal('parse-edit-hospital', data.hospital || '기타 거래처');
  setVal('parse-edit-contact', data.contact || '');
  setVal('parse-edit-product-name', data.product_name || '일반 의료소모품/장비 (PROD_GENERAL)');
  setVal('parse-edit-product-code', data.product_code || 'PROD_GENERAL');
  setVal('parse-edit-action-type', data.action_type || '제품설명·소개');
  setVal('parse-edit-sales-status', data.sales_status || '제품소개·영업중');
  setVal('parse-edit-fail-reason', data.fail_reason || '-');
  setVal('parse-edit-next-action', data.next_action || '다음 방문 일정 확인 및 후속 조치');

  const saveBtn = document.getElementById('btn-save-ai-log');
  if (saveBtn) {
    saveBtn.style.display = 'flex';
    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (isFromGemini) {
    showToast(`✨ Google Gemini AI 정밀 분석 완료! 검토 후 [즉시 등록]을 누르세요.`);
  } else {
    showToast(`⚡ 고속 NLP 분석 완료! 검토 후 [즉시 등록]을 누르세요.`);
  }
}

async function parseSalesText() {
  try {
    const inputEl = document.getElementById('ai-input-text');
    const text = (inputEl ? inputEl.value : "").trim();
    if (!text) {
      showToast("⚠️ 분석할 영업활동 내용을 입력해주세요.");
      return;
    }

    const btn = document.getElementById('btn-parse-ai-text');
    const label = document.getElementById('btn-parse-ai-text-label');
    if (btn) btn.disabled = true;
    if (label) label.innerHTML = `⏳ AI 정밀 분석 중...`;

    const isGeminiMode = Boolean(geminiConfig.apiKey && geminiConfig.engineType !== 'local');
    
    if (isGeminiMode) {
      try {
        const geminiRes = await callGeminiAPI(text);
        if (geminiRes && geminiRes.hospital) {
          applyParsedResultToUI(geminiRes, text, true);
          if (btn) btn.disabled = false;
          if (label) label.innerHTML = `⚡ AI 실시간 구조화 분석`;
          return;
        }
      } catch (geminiErr) {
        console.warn("Gemini API call failed, falling back to local engine:", geminiErr);
        showToast("⚠️ Gemini API 응답 지연으로 내장 고속 엔진으로 분석했습니다.");
      }
    }

    // Local heuristic engine fallback
    parseSalesTextLocally(text);

    if (btn) btn.disabled = false;
    if (label) label.innerHTML = `⚡ AI 실시간 구조화 분석`;
  } catch (err) {
    console.error("AI Parser Error:", err);
    alert("AI 분석 중 오류가 발생했습니다: " + err.message);
    const btn = document.getElementById('btn-parse-ai-text');
    const label = document.getElementById('btn-parse-ai-text-label');
    if (btn) btn.disabled = false;
    if (label) label.innerHTML = `⚡ AI 실시간 구조화 분석`;
  }
}

function parseSalesTextLocally(text) {
  console.log("⚡ parseSalesTextLocally analyzing text:", text);
  const cleanText = text.replace(/\s+/g, '');
  const tLower = text.toLowerCase();

  // 1. Hospital extraction (정밀 거래처 매칭)
  let matchedHosp = "";
  const hospList = (window.SALES_DB && window.SALES_DB.hospitals) ? window.SALES_DB.hospitals : [];

  // Step 1-1: Exact match with hospital full name in DB
  for (const h of hospList) {
    if (!h || !h.name) continue;
    const hClean = h.name.replace(/\s+/g, '');
    if (text.includes(h.name) || cleanText.includes(hClean)) {
      matchedHosp = h.name;
      break;
    }
  }

  // Step 1-2: If no exact full name match, extract via Korean medical institution Regex
  if (!matchedHosp) {
    const regMatch = text.match(/([가-힣]{2,14}(?:대학교병원|대학병원|산부인과|정형외과|외과|내과|병원|의원|의료원|보건소|센터))/);
    if (regMatch) {
      matchedHosp = regMatch[1];
      // Check if there is an exact registered hospital containing this name
      const foundH = hospList.find(h => h.name.includes(matchedHosp) || matchedHosp.includes(h.name));
      if (foundH) matchedHosp = foundH.name;
    }
  }

  if (!matchedHosp) {
    matchedHosp = "기타 거래처";
  }

  // 2. Contact Person & Title extraction (본문에 없을 경우 절대 임의값 넣지 않고 빈칸 유지!)
  let matchedContact = "";
  const contactPatterns = [
    /([가-힣]{2,4})\s*(선생님|원장(?:님)?|과장(?:님)?|교수(?:님)?|실장(?:님)?|팀장(?:님)?|부장(?:님)?|수간호사(?:님)?|간호사(?:님)?|영상의학실장(?:님)?|진료부원장(?:님)?|의무원장(?:님)?|간호부장(?:님)?|수술실장(?:님)?|행정부장(?:님)?|산부인과장(?:님)?|신경외과장(?:님)?|사무장(?:님)?)/,
    /(선생님|영상의학실장|진료부원장|의무원장|간호부장|수술실장|행정부장|산부인과장|신경외과장|원장|과장|팀장|실장|부장|교수|간호사|사무장)/
  ];
  for (const pat of contactPatterns) {
    const cm = text.match(pat);
    if (cm) {
      if (cm[2]) matchedContact = `${cm[1]} ${cm[2].replace(/님$/, '')}`;
      else matchedContact = cm[1].replace(/님$/, '');
      break;
    }
  }

  // 3. Product Extraction & Code Mapping
  let matchedProd = { code: "PROD_GENERAL", name: "일반 의료소모품/장비 (PROD_GENERAL)" };
  const master = (window.ERP_PRODUCTS_MASTER || []).concat(window.SALES_DB ? (window.SALES_DB.products || []) : []);

  if (tLower.includes("oxy9wave") || tLower.includes("oxy9") || text.includes("옥시나인") || text.includes("산소포화도")) {
    matchedProd = { code: "MED-OXY9WAVE", name: "Oxy9Wave 휴대형 산소포화도 측정기 (MED-OXY9WAVE)" };
  } else if (tLower.includes("bt350") || tLower.includes("bt-350") || text.includes("태아심음")) {
    matchedProd = { code: "MED-BT350", name: "BT-350 태아심음측정기 (MED-BT350)" };
  } else if (tLower.includes("올림푸스") || tLower.includes("olympus")) {
    matchedProd = { code: "MED-OLYMPUS", name: "올림푸스 수술/내시경 장비 (OLYMPUS)" };
  } else if (text.includes("모슬레이디") || text.includes("모슬") || tLower.includes("motor handle") || text.includes("201.023")) {
    matchedProd = { code: "201.023", name: "Drive Motor Handle(SET) (201.023)" };
  } else if (text.includes("엔지오") || tLower.includes("angio") || tLower.includes("pr03") || tLower.includes("PR03")) {
    matchedProd = { code: "ST-ANG-PR03", name: "Surgi FXA Angio Procedure Kit (ST-ANG-PR03)" };
  } else if (text.includes("c라인") || text.includes("C라인") || tLower.includes("c-line")) {
    matchedProd = { code: "ST-CVC-CLINE11A", name: "[CVC] Surgi FXT C-Line Adv.11A Tray Kit (ST-CVC-CLINE11A)" };
  } else if (text.includes("소공포") || text.includes("드레이프")) {
    matchedProd = { code: "GROUP-SEJONG-SHEET", name: "[세종] 멸균 소공포 (MULTI USEFUL SHEET)" };
  } else if (text.includes("서지소드") || text.includes("펜코") || text.includes("나이프") || text.includes("메스")) {
    matchedProd = { code: "GROUP-PENKO-SWORD", name: "[펜코] 서지 소드 안전 메스 (DF & STRIP SURGI SWORD)" };
  } else if (text.includes("바이옵시") || text.includes("펀치")) {
    matchedProd = { code: "PROD_BIOPSY", name: "일회용 펀치 생검기 (Punch Biopsy)" };
  } else if (text.includes("좌욕기") || text.includes("필터")) {
    matchedProd = { code: "PROD_ZWAYOK", name: "병원용 좌욕기 필터 (PROD_ZWAYOK)" };
  } else if (text.includes("튤립") || text.includes("듀얼튤립")) {
    matchedProd = { code: "PROD_TULIP", name: "듀얼 튤립 카테터 (Dual Tulip)" };
  } else if (text.includes("하이겐트") || tLower.includes("hygent")) {
    matchedProd = { code: "PROD_HYGENT", name: "[하이겐트] Hygent 수액세트/치료재료" };
  } else {
    for (const p of master) {
      if (p && p.name && p.name.length >= 3 && text.includes(p.name)) {
        matchedProd = { code: p.code || p.id, name: `${p.name} (${p.code || p.id})` };
        break;
      }
    }
  }

  // 4. Action Type & Pipeline Stage & Fail Reason
  let actionType = "제품설명·소개";
  let pipelineStage = "제품소개·영업중";
  let failReason = "-";
  let nextAction = "다음 방문 일정 확인 및 지속적 관계 유지";

  const hasSample = text.includes("샘플") || text.includes("데모") || text.includes("테스트") || text.includes("써보고") || text.includes("사용해");
  const hasAS = text.includes("A/S") || text.includes("as") || text.includes("수리") || text.includes("클레임") || text.includes("교환") || text.includes("불량");
  const hasBuyNew = text.includes("새 제품 판매") || text.includes("새제품 판매") || text.includes("판매하기로") || text.includes("신규 구매") || text.includes("교체 구매");
  const hasDelivery = (text.includes("납품") || text.includes("발주") || text.includes("확정") || text.includes("도입완료")) && !hasSample;
  const hasLoss = text.includes("보류") || text.includes("실패") || text.includes("거절") || text.includes("안쓴대") || text.includes("부담") || text.includes("안맞는") || text.includes("어렵다고") || text.includes("돈이없") || text.includes("못들어옴");

  if (hasBuyNew || (hasAS && text.includes("판매하기로"))) {
    actionType = "납품·설치";
    pipelineStage = "도입완료·납품";
    failReason = text.includes("불가") ? "기존 장비 A/S 수리 불가에 따른 신제품 교체 확정" : "-";
    nextAction = "A/S 불가에 따른 신규 장비 발주서 접수 및 납품·설치 일정 조율";
  } else if (hasAS) {
    actionType = "A/S·클레임";
    pipelineStage = text.includes("불가") || text.includes("완료") ? "도입완료·납품" : "A/S접수·처리";
    failReason = text.includes("불가") ? "A/S 수리 불가 판정" : "-";
    nextAction = text.includes("불가") ? "신제품 교체 제안 견적서 발송 및 의사결정 지원" : "불량/접수 건 확인 후 방문 교환 및 정상 작동 여부 점검";
  } else if (hasSample) {
    const isEquip = isEquipmentProduct(matchedProd.name, matchedProd.code, text);
    if (isEquip) {
      actionType = "의료장비 데모";
      pipelineStage = "의료장비 데모";
    } else {
      actionType = "소모품 샘플";
      pipelineStage = "소모품 샘플";
    }
    if (hasLoss) {
      failReason = text.includes("단가") || text.includes("가격") || text.includes("부담") || text.includes("돈") ? "병원 예산/단가 부담 (샘플 전달 및 설득)" : "기구 불일치 / 코드생성 애로";
    }
  } else if (hasDelivery) {
    actionType = "납품·설치";
    pipelineStage = "도입완료·납품";
  } else if (hasLoss) {
    actionType = "제품설명·소개";
    pipelineStage = "영업실패·보류";
    failReason = text.includes("코드") || text.includes("어렵다") ? "신규 코드 생성 불가 및 타사 기구 세트 다량 구비" : (text.includes("단가") || text.includes("돈") ? "병원 예산 부족 및 단가 부담" : "의료진 선호도/기존 거래처 유지");
  } else if (text.includes("견적") || text.includes("금액")) {
    actionType = "견적제출";
    pipelineStage = "견적·의사결정";
  }

  // 5. Intelligent Next Action Extraction
  if (text.includes("내년") || text.includes("다시 한번") || text.includes("다시한번")) {
    nextAction = "내년 예산 배정 시기에 맞춰 신규 코드 등록 재제안 및 방문 상담";
  } else if (text.includes("이전") || text.includes("인테리어") || text.includes("개원")) {
    nextAction = "병원 이전/인테리어 일정(12월)에 맞춰 개원 준비 및 필요 장비/소모품 견적 제안";
  } else if (text.includes("샘플주기로함") || text.includes("본사에주문함") || text.includes("샘플")) {
    nextAction = "본사에 주문한 대체/샘플 수령 후 병원 전달 및 기구/단가 관련 설득 진행";
  } else if (text.includes("코드 생성") || text.includes("코드생성")) {
    nextAction = "의료진 임상 사용 후 병원 원내 품목 코드 생성 진행 상황 확인";
  } else if (text.includes("교환") || text.includes("수리") || text.includes("A/S")) {
    if (!hasBuyNew) nextAction = "불량/접수 건 확인 후 방문 교환 및 정상 작동 여부 점검";
  } else {
    const nextMatch = text.match(/(다음주[^\.\n]+|내일[^\.\n]+|\d+\/\d+[^\.\n]+|예정[^\.\n]+|말씀드려[^\.\n]*|설득필요[^\.\n]*)/);
    if (nextMatch) nextAction = nextMatch[1].trim();
  }

  // Detect sales rep from text if mentioned
  let detectedRep = currentAiSelectedRep;
  const KNOWN_REPS = ["최진웅", "이은필", "이재덕", "이우식", "원유훈", "이상미", "이우진"];
  for (const rep of KNOWN_REPS) {
    if (text.includes(rep)) {
      detectedRep = rep;
      break;
    }
  }

  applyParsedResultToUI({
    hospital: matchedHosp,
    contact: matchedContact,
    sales_rep: detectedRep,
    product_name: matchedProd.name,
    product_code: matchedProd.code,
    action_type: actionType,
    sales_status: pipelineStage,
    fail_reason: failReason,
    next_action: nextAction
  }, text, false);
}

async function saveParsedLogToDB() {
  // Read current values directly from Editable Form
  const userRep = document.getElementById('parse-edit-sales-rep').value || currentAiSelectedRep;
  const dateStr = document.getElementById('parse-edit-date').value.trim() || new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const rawHospName = document.getElementById('parse-edit-hospital').value.trim();
  const hospName = normalizeHospitalName(rawHospName);
  const cleanHospName = (hospName || '').replace(/\s+/g, '');
  const contactName = document.getElementById('parse-edit-contact').value.trim();
  const prodName = document.getElementById('parse-edit-product-name').value.trim();
  const prodCode = document.getElementById('parse-edit-product-code').value.trim() || "PROD_GENERAL";
  const actionType = document.getElementById('parse-edit-action-type').value;
  const salesStatus = document.getElementById('parse-edit-sales-status').value;
  const failReason = document.getElementById('parse-edit-fail-reason').value.trim();
  const nextAction = document.getElementById('parse-edit-next-action').value.trim();
  const rawNote = document.getElementById('ai-input-text').value.trim() || `${hospName} ${contactName} 면담. ${actionType} 진행.`;

  if (!hospName) {
    alert("거래처(병원명)를 입력해주세요.");
    return;
  }

  // 1. Create Activity Log Entry
  const logEntry = {
    hospital: hospName,
    date: dateStr,
    sales_rep: userRep,
    action_type: actionType,
    title: `[${actionType}] ${prodName}`,
    note: rawNote,
    products: [prodName],
    product_code: prodCode,
    next_action: nextAction,
    region: "세종충북",
    contact: contactName
  };

  // Add to in-memory logs
  window.SALES_DB.activity_logs.unshift(logEntry);
  window.SALES_DB.stats.total_logs = window.SALES_DB.activity_logs.length;

  // 2. Update/Add Pipeline Deal (Clean matching)
  const isDemoAction = (actionType === '샘플·데모' || actionType === '의료장비 데모' || actionType === '소모품 샘플' || salesStatus === '의료장비 데모' || salesStatus === '소모품 샘플' || salesStatus === '데모·샘플평가');
  
  let deal = window.SALES_DB.pipeline.find(d => (d.hospital || '').replace(/\s+/g, '') === cleanHospName && (d.product_id === prodCode || d.product_name === prodName));
  if (!deal) {
    deal = {
      hospital: hospName,
      region: "세종충북",
      sales_rep: userRep,
      product_id: prodCode,
      product_name: prodName,
      status: salesStatus,
      last_date: dateStr,
      latest_action: actionType,
      latest_note: rawNote,
      demo_info: isDemoAction ? { date: dateStr, note: rawNote, status: '평가진행중' } : null,
      as_info: actionType === 'A/S·클레임' ? { date: dateStr, note: rawNote, status: '접수완료' } : null,
      fail_reasons: (failReason && failReason !== '-') ? [failReason] : []
    };
    window.SALES_DB.pipeline.unshift(deal);
  } else {
    deal.sales_rep = userRep;
    deal.status = salesStatus;
    deal.last_date = dateStr;
    deal.latest_action = actionType;
    deal.latest_note = rawNote;
    if (isDemoAction) {
      deal.demo_info = { date: dateStr, note: rawNote, status: '평가진행중' };
    }
    if (actionType === 'A/S·클레임') {
      deal.as_info = { date: dateStr, note: rawNote, status: '접수완료' };
      deal.status = 'A/S접수·처리';
    }
    if (failReason && failReason !== '-' && !deal.fail_reasons.includes(failReason)) {
      deal.fail_reasons.push(failReason);
    }
  }

  // Auto-resolve pending A/S deals if this log completes A/S or replaces equipment with new purchase
  let resolvedAsDeals = [];
  if (salesStatus === '도입완료·납품' || actionType === '납품·설치' || rawNote.includes('A/S 불가') || rawNote.includes('새 제품 판매') || rawNote.includes('수리완료') || rawNote.includes('조치완료')) {
    resolvedAsDeals = window.SALES_DB.pipeline.filter(d => (d.hospital || '').replace(/\s+/g, '') === cleanHospName && ((d.as_info && d.as_info.status.includes('접수')) || d.status === 'A/S접수·처리'));
    resolvedAsDeals.forEach(d => {
      if (d.as_info) {
        d.as_info.status = 'A/S 조치완료';
        d.as_info.resolved_date = dateStr;
      }
      d.status = '도입완료·납품';
    });
  }

  // 3. Update Hospital Master Stats (Create new hospital entry if not exists)
  let hosp = window.SALES_DB.hospitals.find(h => (h.name || '').replace(/\s+/g, '') === cleanHospName);
  if (!hosp) {
    const region = (hospName.includes('천안') || hospName.includes('아산') || hospName.includes('앙즈로') || hospName.includes('연세하임')) ? '천안아산' : 
                   (hospName.includes('대전') || hospName.includes('논산')) ? '대전논산' :
                   (hospName.includes('서산') || hospName.includes('당진')) ? '서산당진' : '세종충북';
    hosp = {
      name: hospName,
      region: region,
      sales_reps: [userRep],
      contacts: contactName ? [contactName] : ['담당자'],
      status: '활동병원',
      last_activity_date: dateStr,
      total_logs: 1,
      demo_count: actionType === '샘플·데모' ? 1 : 0,
      won_count: actionType === '납품·설치' ? 1 : 0,
      as_count: actionType === 'A/S·클레임' ? 1 : 0,
      fail_count: salesStatus === '영업실패·보류' ? 1 : 0,
      products_active: [prodName]
    };
    window.SALES_DB.hospitals.push(hosp);
    window.SALES_DB.hospitals.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } else {
    hosp.name = hospName; // standardize name
    hosp.last_activity_date = dateStr;
    hosp.total_logs = (hosp.total_logs || 0) + 1;
    if (userRep && (!hosp.sales_reps || !hosp.sales_reps.includes(userRep))) {
      hosp.sales_reps = (hosp.sales_reps || []).concat([userRep]);
    }
    if (contactName && (!hosp.contacts || !hosp.contacts.includes(contactName))) {
      hosp.contacts = (hosp.contacts || []).concat([contactName]);
    }
    if (actionType === '샘플·데모') hosp.demo_count = (hosp.demo_count || 0) + 1;
    if (actionType === '납품·설치') hosp.won_count = (hosp.won_count || 0) + 1;
    if (actionType === 'A/S·클레임') hosp.as_count = (hosp.as_count || 0) + 1;
    if (salesStatus === '영업실패·보류') hosp.fail_count = (hosp.fail_count || 0) + 1;
    if (!hosp.products_active) hosp.products_active = [];
    if (!hosp.products_active.includes(prodName)) {
      hosp.products_active.push(prodName);
    }
  }

  // Ensure sync
  syncHospitalsFromLogs();

  // Persist Local
  persistSalesDB();
  recalcGlobalStats();
  initHeaderMetrics();

  // 4. Sync to Supabase Cloud DB
  if (supabaseClient) {
    try {
      await supabaseClient.from('activity_logs').insert([logEntry]);
      await supabaseClient.from('pipeline').upsert([deal]);
      for (const rd of resolvedAsDeals) {
        await supabaseClient.from('pipeline').upsert([rd]);
      }
      if (hosp) await supabaseClient.from('hospitals').upsert([hosp]);
      console.log('⚡ AI Smart Log successfully saved to Supabase cloud!');
    } catch(err) {
      console.warn('Supabase cloud insert error:', err);
    }
  }

  showToast(`🎉 [${hospName}] '${userRep}' 담당자의 영업일지 & 파이프라인이 성공적으로 등록되었습니다!`);
  
  // Switch to hospital view
  selectHospital(hospName);
  switchTab('hospital');
}

// Auto init datalist on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initHospitalDataList, 500);
});

// ==========================================
// 🏥 HOSPITAL PROFILE & KEYMAN EDIT MODAL
// ==========================================
function openEditHospitalModal() {
  if (!selectedHospitalName) {
    showToast("⚠️ 먼저 수정할 병원을 선택해주세요.");
    return;
  }

  const hosp = (window.SALES_DB.hospitals || []).find(h => h.name === selectedHospitalName);
  if (!hosp) {
    showToast("⚠️ 병원 정보를 찾을 수 없습니다.");
    return;
  }

  const modal = document.getElementById('edit-hospital-modal');
  if (!modal) return;

  document.getElementById('modal-edit-hosp-title').textContent = `[${hosp.name}] 정보 및 핵심 관계자 수정`;
  document.getElementById('modal-edit-hosp-name-hidden').value = hosp.name;

  // Region
  const regionSelect = document.getElementById('modal-edit-hosp-region');
  if (regionSelect) regionSelect.value = hosp.region || '천안아산';

  // Type
  const typeSelect = document.getElementById('modal-edit-hosp-type');
  if (typeSelect) typeSelect.value = hosp.type || '활동 병원';

  // Sales Reps checkboxes
  const currentReps = Array.isArray(hosp.sales_reps) ? hosp.sales_reps : (hosp.sales_rep ? [hosp.sales_rep] : []);
  document.querySelectorAll('input[name="edit-hosp-reps"]').forEach(chk => {
    chk.checked = currentReps.includes(chk.value);
  });

  // Contacts
  const currentContacts = Array.isArray(hosp.contacts) ? hosp.contacts.join(', ') : (hosp.key_doctor || '');
  const contactsTextarea = document.getElementById('modal-edit-hosp-contacts');
  if (contactsTextarea) contactsTextarea.value = currentContacts;

  modal.showModal();
}

function closeEditHospitalModal() {
  const modal = document.getElementById('edit-hospital-modal');
  if (modal) modal.close();
}

async function saveEditedHospitalProfile() {
  const hospName = document.getElementById('modal-edit-hosp-name-hidden').value;
  if (!hospName) return;

  const hosp = (window.SALES_DB.hospitals || []).find(h => h.name === hospName);
  if (!hosp) return;

  const region = document.getElementById('modal-edit-hosp-region').value;
  const type = document.getElementById('modal-edit-hosp-type').value;

  // Selected reps
  const selectedReps = [];
  document.querySelectorAll('input[name="edit-hosp-reps"]:checked').forEach(chk => {
    selectedReps.push(chk.value);
  });

  // Key Contacts (split by comma or newline and trim)
  const contactsRaw = document.getElementById('modal-edit-hosp-contacts').value;
  const contacts = contactsRaw
    .split(/[\n,·]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Apply to in-memory object
  hosp.region = region;
  hosp.type = type;
  hosp.sales_reps = selectedReps.length ? selectedReps : ['미배정'];
  hosp.contacts = contacts.length ? contacts : ['원장/실무진'];
  hosp.custom_profile_saved = true;

  // Persist Local
  persistSalesDB();

  // Sync to Supabase Cloud
  if (supabaseClient) {
    try {
      await supabaseClient.from('hospitals').upsert([{
        name: hosp.name,
        region: hosp.region,
        sales_reps: hosp.sales_reps,
        contacts: hosp.contacts,
        status: hosp.status || '활동병원'
      }]);
      console.log('⚡ Hospital profile synced to Supabase Cloud:', hosp.name);
    } catch(err) {
      console.warn('Supabase hospital upsert error:', err);
    }
  }

  closeEditHospitalModal();
  selectHospital(hosp.name);
  renderHospitalList();
  showToast(`🎉 [${hosp.name}] 병원 권역(${region}) 및 핵심 관계자 정보가 성공적으로 저장되었습니다!`);
}

// ----------------------------------------------------
// 10. Manual / Auto A/S Alert Resolution Handler
// ----------------------------------------------------
async function resolveCurrentHospitalAS() {
  if (!selectedHospitalName) return;

  const hospName = selectedHospitalName;
  const deals = (window.SALES_DB && window.SALES_DB.pipeline) ? window.SALES_DB.pipeline.filter(d => d.hospital === hospName) : [];
  const asDeals = deals.filter(d => (d.as_info && d.as_info.status.includes('접수')) || d.status === 'A/S접수·처리');

  if (asDeals.length === 0) {
    showToast("해당 병원에 미결 A/S 접수 건이 없습니다.");
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  asDeals.forEach(d => {
    if (d.as_info) {
      d.as_info.status = 'A/S 조치완료';
      d.as_info.resolved_date = todayStr;
    }
    d.status = '도입완료·납품';
  });

  // Create an Activity Log entry for the resolution
  const repName = (asDeals[0] && asDeals[0].sales_rep) ? asDeals[0].sales_rep : "이우식";
  const prodName = (asDeals[0] && asDeals[0].product_name) ? asDeals[0].product_name : "의료장비";
  const prodCode = (asDeals[0] && asDeals[0].product_id) ? asDeals[0].product_id : "PROD_GENERAL";

  const logEntry = {
    hospital: hospName,
    date: todayStr,
    sales_rep: repName,
    action_type: "A/S·클레임",
    title: `[A/S 조치완료] ${prodName} 처리 완료`,
    note: `해당 병원의 긴급 A/S 건이 정상 조치/새 제품 판매 완료되어 상황실 긴급 알림을 해제하였습니다.`,
    products: [prodName],
    product_code: prodCode,
    next_action: "정기 작동 상태 확인",
    region: "세종충북",
    contact: "담당자"
  };
  
  if (window.SALES_DB && window.SALES_DB.activity_logs) {
    window.SALES_DB.activity_logs.unshift(logEntry);
  }

  persistSalesDB();
  initHeaderMetrics();

  // Supabase Cloud sync
  if (supabaseClient) {
    try {
      for (const d of asDeals) {
        await supabaseClient.from('pipeline').upsert([d]);
      }
      await supabaseClient.from('activity_logs').insert([logEntry]);
      console.log('⚡ A/S resolution synced to Supabase Cloud');
    } catch(err) {
      console.warn('Supabase A/S resolve error:', err);
    }
  }

  selectHospital(hospName);
  renderHospitalList();
  showToast(`🎉 [${hospName}] A/S 수리 조치가 완료되어 상단 긴급 알림이 해제되었습니다!`);
}

// ====================================================
// 10. KakaoTalk Clipboard Paste (Ctrl+V) & Proof Image Manager
// ====================================================
let currentProofEditingDeal = null;
let tempPastedProofImageBase64 = null;

function setupClipboardPasteListener() {
  window.addEventListener('paste', handleClipboardPasteEvent);
}

function handleClipboardPasteEvent(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      if (!blob) continue;

      e.preventDefault();
      const reader = new FileReader();
      reader.onload = function(evt) {
        const base64Data = evt.target.result;
        applyPastedImage(base64Data);
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
}

function applyPastedImage(base64Data) {
  tempPastedProofImageBase64 = base64Data;
  
  const previewContainer = document.getElementById('proof-preview-container');
  const previewImg = document.getElementById('proof-preview-img');
  const dateEl = document.getElementById('proof-image-date');

  if (previewContainer && previewImg) {
    previewImg.src = base64Data;
    previewContainer.style.display = 'block';
    if (dateEl) dateEl.textContent = `붙여넣은 일시: ${new Date().toLocaleString()}`;
  }

  showToast('📋 [카톡 사진 인식 성공!] 클립보드 사진이 붙여넣어졌습니다. [증빙 저장 완료]를 눌러주세요.');
}

function handleProofFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    applyPastedImage(evt.target.result);
  };
  reader.readAsDataURL(file);
}

function openProofModalByHospital(hospital, productId) {
  const cleanHosp = (hospital || '').replace(/\s+/g, '');
  const deal = window.SALES_DB.pipeline.find(d => (d.hospital || '').replace(/\s+/g, '') === cleanHosp && (d.product_id === productId || d.product_name === productId));
  if (deal) {
    openProofModal(deal);
  }
}

function openProofModal(deal) {
  currentProofEditingDeal = deal;
  tempPastedProofImageBase64 = deal.proof_image || null;

  document.getElementById('proof-modal-hosp').textContent = `🏥 ${deal.hospital}`;
  document.getElementById('proof-modal-prod').textContent = `📦 ${deal.product_name} (${deal.product_id})`;

  const previewContainer = document.getElementById('proof-preview-container');
  const previewImg = document.getElementById('proof-preview-img');
  const dateEl = document.getElementById('proof-image-date');

  if (deal.proof_image) {
    previewImg.src = deal.proof_image;
    previewContainer.style.display = 'block';
    if (dateEl) dateEl.textContent = `등록일시: ${deal.proof_date || '-'}`;
  } else {
    previewContainer.style.display = 'none';
    previewImg.src = '';
  }

  const modal = document.getElementById('proof-paste-modal');
  if (modal.showModal) modal.showModal();
  else modal.setAttribute('open', 'true');

  // Focus paste zone for immediate Ctrl+V
  setTimeout(() => {
    const dropZone = document.getElementById('proof-paste-drop-zone');
    if (dropZone) dropZone.focus();
  }, 100);
}

function closeProofModal() {
  const modal = document.getElementById('proof-paste-modal');
  if (modal.close) modal.close();
  else modal.removeAttribute('open');
  currentProofEditingDeal = null;
  tempPastedProofImageBase64 = null;
}

function removeProofImage() {
  tempPastedProofImageBase64 = null;
  const previewContainer = document.getElementById('proof-preview-container');
  const previewImg = document.getElementById('proof-preview-img');
  if (previewContainer) previewContainer.style.display = 'none';
  if (previewImg) previewImg.src = '';
  showToast('🗑️ 사진이 삭제되었습니다. 저장을 누르면 완전히 적용됩니다.');
}

async function saveProofImageChanges() {
  if (!currentProofEditingDeal) return;

  currentProofEditingDeal.proof_image = tempPastedProofImageBase64;
  currentProofEditingDeal.proof_date = tempPastedProofImageBase64 ? new Date().toISOString().slice(0, 10).replace(/-/g, '/') : null;

  persistSalesDB();
  recalcGlobalStats();
  
  if (selectedHospitalName) {
    selectHospital(selectedHospitalName);
  }
  if (currentTab === 'expenditure') {
    renderExpenditureReport();
  }

  // Supabase Cloud sync
  if (supabaseClient) {
    try {
      await supabaseClient.from('pipeline').upsert([currentProofEditingDeal]);
      console.log('⚡ Proof image synced to Supabase Cloud');
    } catch(err) {
      console.warn('Supabase proof image sync error:', err);
    }
  }

  closeProofModal();
  showToast(`✅ [${currentProofEditingDeal.hospital}] 서명 인수증 증빙 사진이 성공적으로 저장되었습니다!`);
}

// Lightbox Viewer
function openLightbox(imgSrc) {
  const modal = document.getElementById('image-viewer-modal');
  const img = document.getElementById('lightbox-img');
  if (modal && img) {
    img.src = imgSrc;
    if (modal.showModal) modal.showModal();
    else modal.setAttribute('open', 'true');
  }
}

function closeLightbox(e) {
  if (e && e.target && e.target.id === 'lightbox-img') return;
  const modal = document.getElementById('image-viewer-modal');
  if (modal) {
    if (modal.close) modal.close();
    else modal.removeAttribute('open');
  }
}

// ====================================================
// 11. Ministry of Health & Welfare Expenditure Report (K-Sunshine Act)
// ====================================================
let currentExpenditureFilter = 'all'; // 'all', 'sample', 'demo', 'missing'

function setExpenditureFilter(filterType) {
  currentExpenditureFilter = filterType;
  document.querySelectorAll('.demo-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `exp-filter-${filterType}`);
  });
  renderExpenditureReport();
}

function renderExpenditureReport() {
  const query = (document.getElementById('expenditure-search-input')?.value || '').trim().toLowerCase();
  const pipe = (window.SALES_DB && window.SALES_DB.pipeline) ? window.SALES_DB.pipeline : [];
  const tbody = document.getElementById('expenditure-table-tbody');
  if (!tbody) return;

  // Items subject to K-Sunshine Expenditure Report: Samples + Equipment Demos
  const targetDeals = pipe.filter(d => {
    const isTarget = d.status === '소모품 샘플' || d.status === '의료장비 데모' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status);
    return isTarget;
  });

  const formattedRows = targetDeals.map(d => {
    const isEquip = isEquipmentProduct(d.product_name, d.product_id, d.latest_note);
    const hosp = (window.SALES_DB && window.SALES_DB.hospitals) ? window.SALES_DB.hospitals.find(h => (h.name || '').replace(/\s+/g, '') === (d.hospital || '').replace(/\s+/g, '')) : null;
    const region = d.region || (hosp ? hosp.region : '세종충북');
    const doctor = (hosp && Array.isArray(hosp.contacts) && hosp.contacts.length > 0) ? hosp.contacts.join(', ') : '원장/담당의';
    
    // Find EDI code from master products
    const prodMaster = (window.ERP_PRODUCTS_MASTER || []).concat(window.SALES_DB ? (window.SALES_DB.products || []) : []);
    const foundProd = prodMaster.find(p => p.code === d.product_id || p.id === d.product_id);
    const ediCode = (foundProd && (foundProd.edi || foundProd.edi_code)) ? (foundProd.edi || foundProd.edi_code) : '비급여/산정불가';

    return {
      deal: d,
      type: isEquip ? '임상·성능평가(데모)' : '견본품(샘플) 제공',
      isEquip: isEquip,
      hospital: d.hospital,
      region: region,
      doctor: doctor,
      productName: d.product_name,
      productCode: d.product_id,
      ediCode: ediCode,
      date: d.demo_info ? d.demo_info.date : (d.last_date || '-'),
      qty: isEquip ? '1 Set (대여)' : '1 Box (평가용)',
      salesRep: d.sales_rep || '영업담당',
      hasProof: !!d.proof_image,
      proofImage: d.proof_image
    };
  });

  // Update counter badges
  const totalCount = formattedRows.length;
  const sampleCount = formattedRows.filter(r => !r.isEquip).length;
  const demoCount = formattedRows.filter(r => r.isEquip).length;
  const missingCount = formattedRows.filter(r => !r.hasProof).length;

  const elAll = document.getElementById('exp-count-all');
  if (elAll) elAll.textContent = totalCount;
  const elSample = document.getElementById('exp-count-sample');
  if (elSample) elSample.textContent = sampleCount;
  const elDemo = document.getElementById('exp-count-demo');
  if (elDemo) elDemo.textContent = demoCount;
  const elMissing = document.getElementById('exp-count-missing');
  if (elMissing) elMissing.textContent = missingCount;

  // Filter
  let filtered = formattedRows;
  if (currentExpenditureFilter === 'sample') filtered = filtered.filter(r => !r.isEquip);
  if (currentExpenditureFilter === 'demo') filtered = filtered.filter(r => r.isEquip);
  if (currentExpenditureFilter === 'missing') filtered = filtered.filter(r => !r.hasProof);

  if (query) {
    const q = query.replace(/\s+/g, '');
    filtered = filtered.filter(r => 
      r.hospital.toLowerCase().includes(query) ||
      r.hospital.replace(/\s+/g, '').toLowerCase().includes(q) ||
      r.productName.toLowerCase().includes(query) ||
      r.salesRep.toLowerCase().includes(query) ||
      r.doctor.toLowerCase().includes(query)
    );
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:36px; color:var(--text-muted);">해당 조건의 지출보고서 내역이 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach((r, idx) => {
    const tr = document.createElement('tr');
    
    let proofCellHtml = '';
    if (r.hasProof) {
      proofCellHtml = `
        <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <button type="button" class="proof-badge" onclick="openLightbox('${r.proofImage}')">
            👁️ 사진보기
          </button>
          <button type="button" class="mini-badge" style="background:rgba(255,255,255,0.1); color:#fff; border:none; cursor:pointer;" onclick="openProofModalByHospital('${escapeHtml(r.hospital)}', '${escapeHtml(r.productCode)}')">
            수정
          </button>
        </div>
      `;
    } else {
      proofCellHtml = `
        <div style="display:flex; align-items:center; justify-content:center;">
          <button type="button" class="proof-badge empty" onclick="openProofModalByHospital('${escapeHtml(r.hospital)}', '${escapeHtml(r.productCode)}')">
            📷 카톡사진 붙여넣기(Ctrl+V)
          </button>
        </div>
      `;
    }

    const typeBadge = r.isEquip 
      ? `<span class="mini-badge" style="background:rgba(245,158,11,0.15); color:#fcd34d; border:1px solid rgba(245,158,11,0.3);">🔬 임상데모</span>`
      : `<span class="mini-badge" style="background:rgba(56,189,248,0.15); color:#7dd3fc; border:1px solid rgba(56,189,248,0.3);">🧪 견본품샘플</span>`;

    tr.innerHTML = `
      <td style="text-align:center; font-family:var(--font-en); color:var(--text-muted);">${idx + 1}</td>
      <td>${typeBadge}</td>
      <td><strong style="color:#fff;">${escapeHtml(r.hospital)}</strong></td>
      <td><span style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(r.region)}</span></td>
      <td>${escapeHtml(r.doctor)}</td>
      <td><strong style="color:var(--accent-cyan);">${escapeHtml(r.productName)}</strong></td>
      <td style="font-family:var(--font-en); font-size:0.75rem;">${escapeHtml(r.productCode)}</td>
      <td style="font-family:var(--font-en); font-size:0.75rem; color:#6ee7b7;">${escapeHtml(r.ediCode)}</td>
      <td style="font-family:var(--font-en);">${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.qty)}</td>
      <td>${escapeHtml(r.salesRep)}</td>
      <td style="text-align:center;">${proofCellHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportExpenditureToCSV() {
  const pipe = (window.SALES_DB && window.SALES_DB.pipeline) ? window.SALES_DB.pipeline : [];
  const targetDeals = pipe.filter(d => d.status === '소모품 샘플' || d.status === '의료장비 데모' || d.status === '데모·샘플평가' || (d.demo_info && d.demo_info.status));

  if (targetDeals.length === 0) {
    alert("내보낼 지출보고서 내역이 없습니다.");
    return;
  }

  const prodMaster = (window.ERP_PRODUCTS_MASTER || []).concat(window.SALES_DB ? (window.SALES_DB.products || []) : []);
  
  let csv = "\uFEFFNo,구분,요양기관명(병원명),지역,의료인성명/직함,의료기기명(제품명),표준코드/품목코드,보험코드(EDI),제공/대여일자,수량/단위,담당영업사원,서명인수증증빙여부\n";
  
  targetDeals.forEach((d, idx) => {
    const isEquip = isEquipmentProduct(d.product_name, d.product_id, d.latest_note);
    const hosp = (window.SALES_DB && window.SALES_DB.hospitals) ? window.SALES_DB.hospitals.find(h => (h.name || '').replace(/\s+/g, '') === (d.hospital || '').replace(/\s+/g, '')) : null;
    const region = d.region || (hosp ? hosp.region : '세종충북');
    const doctor = (hosp && Array.isArray(hosp.contacts) && hosp.contacts.length > 0) ? hosp.contacts.join('/') : '원장/담당의';
    const foundProd = prodMaster.find(p => p.code === d.product_id || p.id === d.product_id);
    const ediCode = (foundProd && (foundProd.edi || foundProd.edi_code)) ? (foundProd.edi || foundProd.edi_code) : '비급여';
    const hasProof = d.proof_image ? "증빙서명완료" : "미등록";

    csv += `"${idx + 1}","${isEquip ? '임상성능평가(데모)' : '견본품(샘플)'}","${d.hospital}","${region}","${doctor}","${d.product_name.replace(/"/g, '""')}","${d.product_id}","${ediCode}","${d.demo_info ? d.demo_info.date : (d.last_date || '-')}","${isEquip ? '1 Set' : '1 Box'}","${d.sales_rep || '영업담당'}","${hasProof}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `보건복지부_의료기기지출보고서_준메디칼_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📥 보건복지부 법정 의료기기 지출보고서 엑셀(CSV) 다운로드가 완료되었습니다.");
}

// Ensure clipboard paste is initialized
setupClipboardPasteListener();


