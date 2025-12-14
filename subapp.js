// subapp.js – auto allotment + running global balance with gaps
// subapp.js – auto allotment + running global balance with gaps

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  child,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

// ---- Firebase config ----
const firebaseConfig = {
  apiKey: "AIzaSyBY7hNKi8oSIkSEwnZfKS_vS5g3N7OFP-I",
  authDomain: "puzzlepal-oo7tl.firebaseapp.com",
  databaseURL: "https://puzzlepal-oo7tl-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "puzzlepal-oo7tl",
  storageBucket: "puzzlepal-oo7tl.firebasestorage.app",
  messagingSenderId: "906428538702",
  appId: "1:906428538702:web:bda6b1c7b3c3b1e0d1c81f"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ---- RTDB refs ----
const schemesRef    = ref(db, "tn_schemes");
const headOfficeRef = ref(db, "tn_settings/headOffice");
const varietyRef    = ref(db, "variety_entries_combined");

// ---- constants ----
const VARIETIES = [
  "Boiled Rice A",
  "Boiled Rice Common",
  "Raw Rice A",
  "Raw Rice Common",
  "Paddy Grade A",
  "Paddy Common"
];

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

// ---- DOM: scheme master ----
const currentUnitSelect   = document.getElementById("currentUnit");
const headOfficeNameInput = document.getElementById("headOfficeName");
const newSchemeNameInput  = document.getElementById("newSchemeName");
const addSchemeBtn        = document.getElementById("addSchemeBtn");
const schemeListSelect    = document.getElementById("schemeList");

// ---- DOM: entry ----
const dateInput        = document.getElementById("date");
const districtSelect   = document.getElementById("district");
const schemeSelect     = document.getElementById("scheme");
const commonAllotInput = document.getElementById("commonAllot");
const globalBalanceInp = document.getElementById("globalBalance");
const varietyTableBody = document.querySelector("#varietyTable tbody");
const savedTableBody   = document.querySelector("#savedTable tbody");
const saveBtn          = document.getElementById("saveBtn");
const resetBtn         = document.getElementById("resetBtn");

// ---- DOM: report ----
const rFromDate        = document.getElementById("rFromDate");
const rToDate          = document.getElementById("rToDate");
const rDistrict        = document.getElementById("rDistrict");
const rScheme          = document.getElementById("rScheme");
const rVariety         = document.getElementById("rVariety");
const rFilterBtn       = document.getElementById("rFilterBtn");
const rClearBtn        = document.getElementById("rClearBtn");
const reportTableBody  = document.querySelector("#reportTable tbody");
const exportExcelBtn   = document.getElementById("exportExcelBtn");
const exportPdfBtn     = document.getElementById("exportPdfBtn");

// ---- state ----
let headOfficeName  = "";
let schemesCache    = [];
let allEntriesCache = [];
let basePreviousBalance = 0;

// ---- helpers ----
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function populateUnits() {
  [districtSelect, currentUnitSelect, rDistrict].forEach((sel, idx) => {
    sel.innerHTML = "";
    const base = document.createElement("option");
    base.value = "";
    base.textContent = idx === 2 ? "All Districts" : "-- Select District / Unit --";
    sel.appendChild(base);
    UNITS.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      sel.appendChild(opt);
    });
  });
}

function buildVarietyRows() {
  varietyTableBody.innerHTML = "";
  VARIETIES.forEach(v => {
    const tr = document.createElement("tr");
    tr.dataset.variety = v;
    tr.innerHTML = `
      <td style="text-align:left;">${v}</td>
      <td><input type="number" class="prev" step="any" value="0"></td>
      <td><input type="number" class="day" step="any" value="0"></td>
      <td><input type="number" class="upto" step="any" value="0" readonly></td>
    `;
    varietyTableBody.appendChild(tr);
  });
  recomputeGlobalBalanceDisplay();
}

function recomputeRow(tr) {
  const prev = parseFloat(tr.querySelector(".prev").value) || 0;
  const day  = parseFloat(tr.querySelector(".day").value) || 0;
  const upto = prev + day;
  tr.querySelector(".upto").value = upto.toFixed(2);
}

function recomputeGlobalBalanceDisplay() {
  let totalOn = 0;
  [...varietyTableBody.rows].forEach(tr => {
    const day = parseFloat(tr.querySelector(".day").value) || 0;
    totalOn += day;
  });
  const bal = basePreviousBalance - totalOn;
  globalBalanceInp.value = bal.toFixed(2);
}

// ---- DB helpers ----
async function fetchAllEntries() {
  const snap = await get(varietyRef);
  const val = snap.val() || {};
  return Object.keys(val).map(id => ({ id, ...val[id] }));
}
async function refreshAllEntries() {
  allEntriesCache = await fetchAllEntries();
}
async function deleteCombinedFor(date, dist, scheme) {
  await refreshAllEntries();
  const target = allEntriesCache.find(
    e => e.date === date && e.district === dist && e.scheme === scheme
  );
  if (!target) return;
  await remove(child(varietyRef, target.id));
}

// ---- schemes & head office ----
function renderSchemeSelects() {
  [schemeSelect, schemeListSelect, rScheme].forEach(sel => {
    const current = sel.value;
    sel.innerHTML = "";
    const base = document.createElement("option");
    base.value = "";
    base.textContent = (sel === rScheme) ? "All Schemes" : "-- Select Scheme --";
    sel.appendChild(base);
    schemesCache.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  });
}

onValue(schemesRef, snap => {
  const val = snap.val() || {};
  schemesCache = Object.keys(val);
  renderSchemeSelects();
});

onValue(headOfficeRef, snap => {
  headOfficeName = snap.val() || "";
  headOfficeNameInput.value = headOfficeName || "(not set)";
});

addSchemeBtn.addEventListener("click", async () => {
  const unit = currentUnitSelect.value;
  if (!unit) {
    alert("Select Current Login Unit.");
    return;
  }
  if (!headOfficeName || unit !== headOfficeName) {
    alert("Only Head Office can create new schemes.");
    return;
  }
  const name = newSchemeNameInput.value.trim();
  if (!name) return;
  await set(child(schemesRef, name), true);
  newSchemeNameInput.value = "";
});

// ---- prevDay = latest earlier upto (not only strict yesterday) ----
async function autoFillFromPrevious() {
  const d    = dateInput.value;
  const dist = districtSelect.value;
  const scheme = schemeSelect.value;
  if (!d || !dist || !scheme) return;

  await refreshAllEntries();

  const earlierRecords = allEntriesCache
    .filter(r => r.district === dist && r.scheme === scheme && r.date < d)
    .sort((a, b) => a.date.localeCompare(b.date));  // [web:341]

  const prevEntry = earlierRecords.length
    ? earlierRecords[earlierRecords.length - 1]
    : null;

  VARIETIES.forEach(v => {
    const tr = [...varietyTableBody.rows].find(r => r.dataset.variety === v);
    if (!tr) return;
    let prevUpto = 0;
    if (prevEntry && prevEntry.varieties && prevEntry.varieties[v]) {
      prevUpto = Number(prevEntry.varieties[v].upto || 0);
    }
    tr.querySelector(".prev").value = prevUpto.toFixed(2);
    recomputeRow(tr);
  });
}

// ---- auto allotment + global balance when district/scheme/date selected ----
async function loadAllotmentAndBalanceForCurrent() {
  const dist = districtSelect.value;
  const scheme = schemeSelect.value;
  const d = dateInput.value;
  if (!dist || !scheme || !d) return;

  await refreshAllEntries();

  const previousRecords = allEntriesCache
    .filter(e => e.district === dist && e.scheme === scheme && e.date < d)
    .sort((a, b) => a.date.localeCompare(b.date));

  const sameDayEntry = allEntriesCache.find(
    e => e.district === dist && e.scheme === scheme && e.date === d
  );

  if (sameDayEntry) {
    const allotVal = Number(sameDayEntry.allotment || 0);
    const balVal   = Number(sameDayEntry.overallBalance || 0);
    commonAllotInput.value = allotVal.toFixed(2);
    globalBalanceInp.value = balVal.toFixed(2);
    basePreviousBalance    = balVal;
  } else if (previousRecords.length) {
    const lastPrev = previousRecords[previousRecords.length - 1];
    const allotVal = Number(lastPrev.allotment || 0);
    const balVal   = Number(lastPrev.overallBalance || 0);
    commonAllotInput.value = allotVal.toFixed(2);
    globalBalanceInp.value = balVal.toFixed(2);
    basePreviousBalance    = balVal;
  } else {
    commonAllotInput.value = "0.00";
    globalBalanceInp.value = "0.00";
    basePreviousBalance    = 0;
  }

  await autoFillFromPrevious();

  [...varietyTableBody.rows].forEach(tr => {
    tr.querySelector(".day").value = 0;
    recomputeRow(tr);
  });
  recomputeGlobalBalanceDisplay();
}

// ---- saved table ----
async function loadSavedTable() {
  const d    = dateInput.value;
  const dist = districtSelect.value;
  const scheme = schemeSelect.value;
  await refreshAllEntries();
  const entry = allEntriesCache.find(
    r => r.date === d && r.district === dist && r.scheme === scheme
  );

  savedTableBody.innerHTML = "";
  if (!entry || !entry.varieties) return;

  Object.keys(entry.varieties).forEach(vName => {
    const v = entry.varieties[vName];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:left;">${vName}</td>
      <td>${(v.prevDay || 0).toFixed(2)}</td>
      <td>${(v.onTheDay || 0).toFixed(2)}</td>
      <td>${(v.upto || 0).toFixed(2)}</td>
    `;
    savedTableBody.appendChild(tr);
  });
}

// ---- save (same running balance logic) ----
saveBtn.addEventListener("click", async () => {
  const d    = dateInput.value;
  const dist = districtSelect.value;
  const scheme = schemeSelect.value;
  const commonAllot = parseFloat(commonAllotInput.value) || 0;

  if (!d || !dist || !scheme) {
    alert("Select Date, District and Scheme.");
    return;
  }

  await refreshAllEntries();

  const previousRecords = allEntriesCache
    .filter(e => e.district === dist && e.scheme === scheme && e.date < d)
    .sort((a, b) => a.date.localeCompare(b.date));

  let previousBalance = commonAllot;
  if (previousRecords.length) {
    previousBalance = Number(previousRecords[previousRecords.length - 1].overallBalance || commonAllot);
  }

  const varieties = {};
  let totalOn = 0;
  VARIETIES.forEach(v => {
    const tr = [...varietyTableBody.rows].find(r => r.dataset.variety === v);
    if (!tr) return;
    const prev = parseFloat(tr.querySelector(".prev").value) || 0;
    const day  = parseFloat(tr.querySelector(".day").value) || 0;
    const upto = prev + day;
    totalOn += day;
    varieties[v] = {
      prevDay: prev,
      onTheDay: day,
      upto: upto
    };
  });

  let overallUpto = 0;
  Object.values(varieties).forEach(v => { overallUpto += Number(v.upto || 0); });

  const overallBalance = previousBalance - totalOn;
  globalBalanceInp.value = overallBalance.toFixed(2);
  basePreviousBalance    = overallBalance;

  await deleteCombinedFor(d, dist, scheme);

  const key = `${d}_${dist}_${scheme}`.replace(/[.#$\[\]]/g, "_");
  const rec = {
    date: d,
    district: dist,
    scheme,
    allotment: commonAllot,
    previousBalance,
    overallUpto,
    overallBalance,
    varieties
  };

  await set(child(varietyRef, key), rec);

  alert("Variety-wise entry saved.");
  await refreshAllEntries();
  await loadSavedTable();
  renderReport(allEntriesCache);
});

// ---- reset ----
resetBtn.addEventListener("click", () => {
  commonAllotInput.value   = "0.00";
  globalBalanceInp.value   = "0.00";
  basePreviousBalance      = 0;
  buildVarietyRows();
});

// ---- entry change handlers ----
["change","blur"].forEach(evt => {
  dateInput.addEventListener(evt, () => {
    loadAllotmentAndBalanceForCurrent();
    loadSavedTable();
  });
  districtSelect.addEventListener(evt, () => {
    loadAllotmentAndBalanceForCurrent();
    loadSavedTable();
  });
  schemeSelect.addEventListener(evt, () => {
    loadAllotmentAndBalanceForCurrent();
    loadSavedTable();
  });
});

// ---- variety input live balance ----
varietyTableBody.addEventListener("input", e => {
  if (["prev","day"].some(c => e.target.classList.contains(c))) {
    recomputeRow(e.target.closest("tr"));
    recomputeGlobalBalanceDisplay();
  }
});

// ---- report / filter / export / edit/delete (unchanged from previous) ----
// keep your existing renderReport, applyReportFilter, exportExcel, exportPdf,
// and edit/delete handlers here exactly as in the last version.



// ---- report / filters / export ----
function populateVarietyFilter() {
  rVariety.innerHTML = "";
  const base = document.createElement("option");
  base.value = "";
  base.textContent = "All Varieties";
  rVariety.appendChild(base);
  VARIETIES.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    rVariety.appendChild(opt);
  });
}

function renderReport(entries) {
  reportTableBody.innerHTML = "";
  entries.forEach(e => {
    if (!e.varieties) return;
    const allot = e.allotment || 0;
    const globalBal = e.overallBalance || 0;

    Object.keys(e.varieties).forEach(vName => {
      const v = e.varieties[vName];
      const tr = document.createElement("tr");
      tr.dataset.id = e.id;
      tr.dataset.variety = vName;
      tr.innerHTML = `
        <td>${e.date}</td>
        <td>${e.district}</td>
        <td>${e.scheme}</td>
        <td>${vName}</td>
        <td>${allot.toFixed(2)}</td>
        <td>${(v.prevDay || 0).toFixed(2)}</td>
        <td>${(v.onTheDay || 0).toFixed(2)}</td>
        <td>${(v.upto || 0).toFixed(2)}</td>
        <td>${globalBal.toFixed(2)}</td>
        <td>
          <button class="action-btn action-edit">Edit</button>
          <button class="action-btn action-delete">Delete</button>
        </td>
      `;
      reportTableBody.appendChild(tr);
    });
  });
}

async function applyReportFilter() {
  const from = rFromDate.value ? new Date(rFromDate.value) : null;
  const to   = rToDate.value ? new Date(rToDate.value) : null;
  const dist = rDistrict.value;
  const scheme = rScheme.value;
  const variety = rVariety.value;

  await refreshAllEntries();
  const filtered = allEntriesCache.filter(e => {
    const d = new Date(e.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (dist && e.district !== dist) return false;
    if (scheme && e.scheme !== scheme) return false;
    if (variety && (!e.varieties || !e.varieties[variety])) return false;
    return true;
  });

  renderReport(filtered);
}

rFilterBtn.addEventListener("click", applyReportFilter);

rClearBtn.addEventListener("click", async () => {
  rFromDate.value = "";
  rToDate.value   = "";
  rDistrict.value = "";
  rScheme.value   = "";
  rVariety.value  = "";
  await refreshAllEntries();
  renderReport(allEntriesCache);
});

// edit / delete from report
reportTableBody.addEventListener("click", async e => {
  const btn = e.target;
  const tr  = btn.closest("tr");
  if (!tr) return;
  const id  = tr.dataset.id;
  if (!id) return;

  const entry = allEntriesCache.find(x => x.id === id);
  if (!entry) return;

  if (btn.classList.contains("action-edit")) {
    dateInput.value        = entry.date;
    districtSelect.value   = entry.district;
    schemeSelect.value     = entry.scheme;
    commonAllotInput.value = entry.allotment.toFixed(2);
    globalBalanceInp.value = entry.overallBalance.toFixed(2);
    basePreviousBalance    = entry.overallBalance;

    buildVarietyRows();
    VARIETIES.forEach(v => {
      const vData = entry.varieties[v];
      const rowTr = [...varietyTableBody.rows].find(r => r.dataset.variety === v);
      if (!rowTr || !vData) return;
      rowTr.querySelector(".prev").value = (vData.prevDay || 0).toFixed(2);
      rowTr.querySelector(".day").value  = (vData.onTheDay || 0).toFixed(2);
      recomputeRow(rowTr);
    });

    document.querySelector('.nav-tab[data-target="section-entry"]').click();
  } else if (btn.classList.contains("action-delete")) {
    if (confirm("Delete entire record for this date/district/scheme?")) {
      await remove(child(varietyRef, id));
      await refreshAllEntries();
      renderReport(allEntriesCache);
      await loadSavedTable();
    }
  }
});

// export helpers
function getFilteredForExport() {
  const rows = [];
  reportTableBody.querySelectorAll("tr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    if (cells.length < 9) return;
    rows.push({
      date: cells[0].textContent,
      district: cells[1].textContent,
      scheme: cells[2].textContent,
      variety: cells[3].textContent,
      allotment: cells[4].textContent,
      prevDay: cells[5].textContent,
      onDay: cells[6].textContent,
      upto: cells[7].textContent,
      bal: cells[8].textContent
    });
  });
  return rows;
}

function exportToExcel() {
  const rows = getFilteredForExport();
  if (!rows.length) {
    alert("No data to export.");
    return;
  }
  const data = [
    ["Date","District","Scheme","Variety","Allotment (Global)","Prev Day","On The Day","Upto The Day","Balance"]
  ];
  rows.forEach(r => {
    data.push([r.date,r.district,r.scheme,r.variety,r.allotment,r.prevDay,r.onDay,r.upto,r.bal]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Variety Report");
  XLSX.writeFile(wb, `TNCSC_Variety_Report_${todayISO()}.xlsx`);
}

function exportToPdf() {
  const rows = getFilteredForExport();
  if (!rows.length) {
    alert("No data to export.");
    return;
  }
  const temp = document.createElement("div");
  temp.style.padding = "20px";
  temp.innerHTML = `
    <h2>TNCSC Variety-wise Report</h2>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th>Date</th><th>District</th><th>Scheme</th><th>Variety</th>
          <th>Allotment (Global)</th><th>Prev Day</th><th>On The Day</th><th>Upto The Day</th><th>Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.date}</td>
            <td>${r.district}</td>
            <td>${r.scheme}</td>
            <td>${r.variety}</td>
            <td align="right">${r.allotment}</td>
            <td align="right">${r.prevDay}</td>
            <td align="right">${r.onDay}</td>
            <td align="right">${r.upto}</td>
            <td align="right">${r.bal}</td>
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
    pdf.save(`TNCSC_Variety_Report_${todayISO()}.pdf`);
    document.body.removeChild(temp);
  });
}

exportExcelBtn.addEventListener("click", exportToExcel);
exportPdfBtn.addEventListener("click", exportToPdf);

// ---- init ----
(async function init() {
  const t = todayISO();
  dateInput.value = t;
  rFromDate.value = t;
  rToDate.value   = t;

  populateUnits();
  buildVarietyRows();
  populateVarietyFilter();

  await refreshAllEntries();
  renderReport(allEntriesCache);
})();
