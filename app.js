// app.js (type="module")

// ---------- Firebase imports ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// ---------- Firebase config (your project) ----------
const firebaseConfig = {
  apiKey: "AIzaSyBY7hNKi8oSIkSEwnZfKS_vS5g3N7OFP-I",
  authDomain: "puzzlepal-oo7tl.firebaseapp.com",
  databaseURL: "https://puzzlepal-oo7tl-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "puzzlepal-oo7tl",
  storageBucket: "puzzlepal-oo7tl.firebasestorage.app",
  messagingSenderId: "906428538702",
  appId: "1:906428538702:web:bda6b1c7b3c3b1e0d1c81f"
};

// init
const app = initializeApp(firebaseConfig);
const rtdb = getDatabase(app);

// ---------- RTDB refs ----------
const entriesRef   = () => ref(rtdb, "tn_entries");
const fieldsRef    = () => ref(rtdb, "tn_fields");
const settingsRef  = () => ref(rtdb, "tn_settings");

// ---------- DOM refs ----------
const hoDistrictSelect = document.getElementById("hoDistrict");
const isHeadOfficeCheckbox = document.getElementById("isHeadOffice");

const newFieldNameInput = document.getElementById("newFieldName");
const addFieldBtn = document.getElementById("addFieldBtn");
const fieldSelectMaster = document.getElementById("fieldSelectMaster");

const entryForm = document.getElementById("entryForm");
const entryIdInput = document.getElementById("entryId");
const dateInput = document.getElementById("date");
const districtSelect = document.getElementById("district");
const fieldSelect = document.getElementById("field");

const allotmentInput = document.getElementById("allotment");
const openingBalanceInput = document.getElementById("openingBalance");
const onTheDayInput = document.getElementById("onTheDay");
const uptoTheDayInput = document.getElementById("uptoTheDay");
const balanceInput = document.getElementById("balance");
const resetBtn = document.getElementById("resetBtn");

const autoFillStatus = document.getElementById("autoFillStatus");
const statusDetails = document.getElementById("statusDetails");
const allotmentStatus = document.getElementById("allotmentStatus");
const openingBalanceStatus = document.getElementById("openingBalanceStatus");
const uptoTheDayStatus = document.getElementById("uptoTheDayStatus");
const balanceStatus = document.getElementById("balanceStatus");

const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");
const reportDistrictSelect = document.getElementById("reportDistrict");
const reportFieldSelect = document.getElementById("reportField");
const filterBtn = document.getElementById("filterBtn");
const clearFilterBtn = document.getElementById("clearFilterBtn");
const exportExcelBtn = document.getElementById("exportExcelBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const tableBody = document.querySelector("#entryTable tbody");

// ---------- static districts ----------
const BASE_TN_DISTRICTS = [
  "Ariyalur","Chengalpattu","Chennai","Coimbatore","Cuddalore","Dharmapuri",
  "Dindigul","Erode","Kallakurichi","Kancheepuram","Karur","Krishnagiri",
  "Madurai","Mayiladuthurai","Nagapattinam","Kanyakumari","Namakkal",
  "Perambalur","Pudukottai","Ramanathapuram","Ranipet","Salem","Sivaganga",
  "Tenkasi","Thanjavur","Theni","Thiruvallur","Thiruvarur","Thoothukudi",
  "Tiruchirappalli","Tirunelveli","Tirupathur","Tiruppur","Tiruvannamalai",
  "The Nilgiris","Vellore","Viluppuram","Virudhunagar"
];

const UNITS = BASE_TN_DISTRICTS.reduce((arr, d) => {
  if (d === "Chennai") arr.push("Chennai Head Office","Chennai North","Chennai South");
  else arr.push(d);
  return arr;
}, []);

// ---------- local caches ----------
let entriesCache = [];
let fieldsCache = [];
let headOfficeCache = "";

// ---------- utils ----------
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clearStatus() {
  autoFillStatus.style.display = "none";
  [allotmentStatus, openingBalanceStatus, uptoTheDayStatus, balanceStatus].forEach(s => {
    s.textContent = "";
    s.className = "status-badge";
  });
}

function showAutoFillStatus(html) {
  statusDetails.innerHTML = html;
  autoFillStatus.style.display = "block";
}

// ---------- populate selects ----------
function populateUnitSelects() {
  const selects = [hoDistrictSelect, districtSelect, reportDistrictSelect];
  selects.forEach(sel => {
    sel.innerHTML = "";
    const base = document.createElement("option");
    base.value = "";
    base.textContent = sel === reportDistrictSelect
      ? "All Districts"
      : "-- Select District / Unit --";
    sel.appendChild(base);

    UNITS.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      sel.appendChild(opt);
    });
  });
}

function populateFieldSelects() {
  [fieldSelectMaster, fieldSelect, reportFieldSelect].forEach(sel => {
    const current = sel.value;
    sel.innerHTML = "";
    const base = document.createElement("option");
    base.value = "";
    base.textContent = sel === reportFieldSelect ? "All Fields" : "-- Select Field --";
    sel.appendChild(base);
    fieldsCache.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  });
}

// ---------- head office UI ----------
function syncHeadOfficeUI() {
  isHeadOfficeCheckbox.checked = headOfficeCache && headOfficeCache === hoDistrictSelect.value;
}

// ---------- calculation ----------
function calcAutoFields() {
  const allot = parseFloat(allotmentInput.value) || 0;
  const prev  = parseFloat(openingBalanceInput.value) || 0;
  const day   = parseFloat(onTheDayInput.value) || 0;

  const upto = prev + day;
  const bal  = allot - upto;

  uptoTheDayInput.value = upto.toFixed(2);
  balanceInput.value    = bal.toFixed(2);

  uptoTheDayStatus.textContent = "AUTO";
  uptoTheDayStatus.className   = "status-badge status-calc";
  balanceStatus.textContent    = "AUTO";
  balanceStatus.className      = "status-badge status-calc";
}

onTheDayInput.addEventListener("input", calcAutoFields);

// ---------- table render ----------
function renderTable(list) {
  tableBody.innerHTML = "";
  list.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.date}</td>
      <td>${e.district}</td>
      <td>${e.field}</td>
      <td>${e.allotment.toFixed(2)}</td>
      <td>${e.openingBalance.toFixed(2)}</td>
      <td>${e.onTheDay.toFixed(2)}</td>
      <td>${e.uptoTheDay.toFixed(2)}</td>
      <td>${e.balance.toFixed(2)}</td>
      <td>
        <button type="button" class="editBtn" data-id="${e.id}">Edit</button>
        <button type="button" class="deleteBtn" data-id="${e.id}">Delete</button>
      </td>`;
    tableBody.appendChild(tr);
  });
}

// ---------- Realtime listeners ----------
onValue(entriesRef(), snap => {
  const val = snap.val() || {};
  entriesCache = Object.keys(val).map(id => ({ id, ...val[id] }));
  renderTable(entriesCache);
});

onValue(fieldsRef(), snap => {
  const val = snap.val() || {};
  fieldsCache = Object.keys(val);
  populateFieldSelects();
});

onValue(ref(rtdb, "tn_settings/headOffice"), snap => {
  headOfficeCache = snap.val() || "";
  if (headOfficeCache) {
    hoDistrictSelect.value = headOfficeCache;
    syncHeadOfficeUI();
  }
});

// ---------- filter ----------
function getFilteredData() {
  const from = fromDateInput.value ? new Date(fromDateInput.value) : null;
  const to   = toDateInput.value ? new Date(toDateInput.value) : null;
  const dist = reportDistrictSelect.value;
  const field = reportFieldSelect.value;
  return entriesCache.filter(e => {
    const d = new Date(e.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (dist && e.district !== dist) return false;
    if (field && e.field !== field) return false;
    return true;
  });
}

function applyFilter() {
  renderTable(getFilteredData());
}

// ---------- auto-fill from last entry / manual for new ----------
function autoFillFromLastEntry() {
  clearStatus();
  const dist = districtSelect.value;
  const field = fieldSelect.value;

  if (!dist || !field) {
    allotmentInput.value = 0;
    openingBalanceInput.value = 0;
    onTheDayInput.value = 0;
    allotmentInput.readOnly = true;
    openingBalanceInput.readOnly = true;
    calcAutoFields();
    return;
  }

  const previous = entriesCache
    .filter(e => e.district === dist && e.field === field)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  let html;

  if (!previous) {
    // new district + scheme: manual entry
    allotmentInput.readOnly = false;
    openingBalanceInput.readOnly = false;
    allotmentInput.value = "";
    openingBalanceInput.value = "";
    onTheDayInput.value = "";
    uptoTheDayInput.value = "0.00";
    balanceInput.value = "0.00";
    html = `
      <strong>New District + Scheme.</strong><br>
      Enter Allotment, Previous Day Balance and On The Day manually.
    `;
  } else {
    // existing combo: auto-fill base values
    allotmentInput.readOnly = true;
    openingBalanceInput.readOnly = true;
    allotmentInput.value = previous.allotment;
    openingBalanceInput.value = previous.uptoTheDay;
    onTheDayInput.value = 0;

    allotmentStatus.textContent = "AUTO";
    allotmentStatus.className   = "status-badge status-auto";
    openingBalanceStatus.textContent = "AUTO";
    openingBalanceStatus.className   = "status-badge status-auto";

    html = `
      <div><strong>Allotment:</strong> ${previous.allotment.toFixed(2)} (auto)</div>
      <div><strong>Previous Day Balance:</strong> ${previous.uptoTheDay.toFixed(2)} (last Upto The Day)</div>
      <div><strong>On The Day:</strong> 0 (enter today issue)</div>
      <div style="margin-top:5px;color:#0c5460;">
        Formula: Upto = Prev + Today, Balance = Allotment − Upto.
      </div>
    `;
  }

  calcAutoFields();
  showAutoFillStatus(html);
}

districtSelect.addEventListener("change", autoFillFromLastEntry);
fieldSelect.addEventListener("change", autoFillFromLastEntry);

// ---------- save helpers ----------
async function saveEntryToDB(entry, existingId) {
  const id = existingId || `${entry.date}_${entry.district}_${entry.field}`.replace(/\s+/g, "_");
  await set(ref(rtdb, `tn_entries/${id}`), entry);
  return id;
}

async function deleteEntryFromDB(id) {
  await remove(ref(rtdb, `tn_entries/${id}`));
}

async function addFieldToDB(name) {
  await set(ref(rtdb, `tn_fields/${name}`), true);
}

async function saveHeadOfficeToDB(value) {
  await set(ref(rtdb, "tn_settings/headOffice"), value);
}

async function clearHeadOfficeInDB() {
  await remove(ref(rtdb, "tn_settings/headOffice"));
}

// ---------- export Excel ----------
function exportToExcel() {
  const rows = getFilteredData();
  if (!rows.length) {
    alert("No data to export.");
    return;
  }
  const data = [
    ["Date","District","Field","Allotment","Previous Day Balance","On The Day","Upto The Day","Balance"]
  ];
  rows.forEach(e => {
    data.push([
      e.date,
      e.district,
      e.field,
      e.allotment.toFixed(2),
      e.openingBalance.toFixed(2),
      e.onTheDay.toFixed(2),
      e.uptoTheDay.toFixed(2),
      e.balance.toFixed(2)
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daily Statement");
  XLSX.writeFile(wb, `TN_Daily_Statement_${todayISO()}.xlsx`);
}

exportExcelBtn.addEventListener("click", exportToExcel);

// ---------- export PDF ----------
function exportToPdf() {
  const rows = getFilteredData();
  if (!rows.length) {
    alert("No data to export.");
    return;
  }
  const temp = document.createElement("div");
  temp.style.padding = "20px";
  temp.innerHTML = `
    <h2>TN District Daily Statement Report</h2>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th>Date</th><th>District</th><th>Field</th><th>Allotment</th>
          <th>Previous Day Balance</th><th>On The Day</th><th>Upto The Day</th><th>Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td>${e.date}</td>
            <td>${e.district}</td>
            <td>${e.field}</td>
            <td align="right">${e.allotment.toFixed(2)}</td>
            <td align="right">${e.openingBalance.toFixed(2)}</td>
            <td align="right">${e.onTheDay.toFixed(2)}</td>
            <td align="right">${e.uptoTheDay.toFixed(2)}</td>
            <td align="right">${e.balance.toFixed(2)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
  document.body.appendChild(temp);

  html2canvas(temp, { scale: 2 }).then(canvas => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const imgData = canvas.toDataURL("image/png");
    const imgWidth = 297;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    pdf.save(`TN_Daily_Statement_${todayISO()}.pdf`);
    document.body.removeChild(temp);
  });
}

exportPdfBtn.addEventListener("click", exportToPdf);

// ---------- head office & fields ----------
hoDistrictSelect.addEventListener("change", syncHeadOfficeUI);

isHeadOfficeCheckbox.addEventListener("change", async () => {
  const current = hoDistrictSelect.value;
  if (!current) {
    isHeadOfficeCheckbox.checked = false;
    alert("Select district first.");
    return;
  }
  if (isHeadOfficeCheckbox.checked) {
    await saveHeadOfficeToDB(current);
  } else if (headOfficeCache === current) {
    await clearHeadOfficeInDB();
  }
});

addFieldBtn.addEventListener("click", async () => {
  if (!headOfficeCache || headOfficeCache !== hoDistrictSelect.value) {
    alert("Only Head Office can add fields.");
    return;
  }
  const name = newFieldNameInput.value.trim();
  if (!name) return;
  await addFieldToDB(name);
  newFieldNameInput.value = "";
});

fieldSelectMaster.addEventListener("change", () => {
  if (fieldSelectMaster.value) {
    fieldSelect.value = fieldSelectMaster.value;
    autoFillFromLastEntry();
  }
});

// ---------- form submit ----------
entryForm.addEventListener("submit", async e => {
  e.preventDefault();
  const date = dateInput.value;
  const district = districtSelect.value;
  const field = fieldSelect.value;

  const allotment = parseFloat(allotmentInput.value) || 0;
  const openingBalance = parseFloat(openingBalanceInput.value) || 0;
  const onTheDay = parseFloat(onTheDayInput.value) || 0;
  const uptoTheDay = openingBalance + onTheDay;
  const balance = allotment - uptoTheDay;

  const entry = { date, district, field, allotment, openingBalance, onTheDay, uptoTheDay, balance };

  const existingId = entryIdInput.value || null;
  const id = existingId || `${date}_${district}_${field}`.replace(/\s+/g, "_");

  await set(ref(rtdb, `tn_entries/${id}`), entry);

  entryIdInput.value = "";
  clearStatus();
  alert("Entry saved to Realtime DB");
});

// ---------- reset ----------
resetBtn.addEventListener("click", () => {
  entryForm.reset();
  dateInput.value = todayISO();
  clearStatus();
  allotmentInput.value = 0;
  openingBalanceInput.value = 0;
  onTheDayInput.value = 0;
  calcAutoFields();
});

// ---------- table edit/delete ----------
tableBody.addEventListener("click", async e => {
  const btn = e.target;
  const id = btn.getAttribute("data-id");
  if (!id) return;
  const entry = entriesCache.find(x => x.id === id);
  if (!entry) return;

  if (btn.classList.contains("editBtn")) {
    entryIdInput.value = entry.id;
    dateInput.value = entry.date;
    districtSelect.value = entry.district;
    fieldSelect.value = entry.field;

    allotmentInput.readOnly = false;
    openingBalanceInput.readOnly = false;

    allotmentInput.value = entry.allotment;
    openingBalanceInput.value = entry.openingBalance;
    onTheDayInput.value = entry.onTheDay;
    calcAutoFields();
    window.scrollTo(0, 0);
  } else if (btn.classList.contains("deleteBtn")) {
    if (confirm("Delete this entry?")) {
      await deleteEntryFromDB(id);
    }
  }
});

// ---------- filters ----------
filterBtn.addEventListener("click", applyFilter);
clearFilterBtn.addEventListener("click", () => {
  const t = todayISO();
  fromDateInput.value = t;
  toDateInput.value = t;
  reportDistrictSelect.value = "";
  reportFieldSelect.value = "";
  renderTable(entriesCache);
});

// ---------- init ----------
(function init() {
  populateUnitSelects(); 
  const t = todayISO();
  dateInput.value = t;
  fromDateInput.value = t;
  toDateInput.value = t;
  calcAutoFields();
})();
