// /api/check.js
import { google } from "googleapis";
import { JWT } from "google-auth-library";

/** ===== ENV / CONFIG ===== */
const SHEET_ID    = process.env.SHEET_ID;
const SHEET_NAME  = process.env.SHEET_NAME || "";          // rỗng = sheet đầu
const SHEET_RANGE = process.env.SHEET_RANGE || "1:10000";  // đọc cả header
const DEFAULT_GPT_ID   = process.env.DEFAULT_GPT_ID || ""; // ví dụ: gpt-bc
const DEFAULT_GPT_NAME = process.env.DEFAULT_GPT_NAME || "";// ví dụ: Trợ lý Báo cáo

// Map header -> { id, name } (tùy chọn, khoá cứng từng GPT)
const GPT_KEY_MAP = {
  // "BC_01": { id: "gpt-bc",  name: "Trợ lý Báo cáo" },
  // "GA_01": { id: "gpt-ga",  name: "Trợ lý Giáo án" },
  // "VD_01": { id: "gpt-vid", name: "Trợ lý Video"  },
};

/** ===== HEADER NAMES (linh hoạt) ===== */
const HDR = {
  EMAIL:   ["email", "email duoc phep su dung gpts", "email được phép sử dụng gpts", "địa chỉ email", "mail"],
  EXPIRE:  ["thời hạn sử dụng", "thời hạn sử dụng gpts", "ngày hết hạn", "hạn sử dụng", "thoi han su dung", "han su dung", "expiry", "expiration", "expire"],
  GPT_ID:  ["gpts id", "gpt id", "mã gpt", "ma gpt", "id"],
  GPT_NAME:["tên gpts", "gpts name", "ten gpts", "ten gpt", "tên gpt", "name", "ten"],
};

/** ===== Helpers ===== */
const normLower = (s="") => String(s).trim().toLowerCase();
const stripDia  = (s="") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const normNoDia = (s="") => stripDia(s).toLowerCase().trim();

function headerIndex(headerRow, candidates){
  const want = candidates.map(x => normNoDia(x));
  for (let i=0;i<headerRow.length;i++){ const h=normNoDia(headerRow[i]||""); if (want.includes(h)) return i; }
  for (let i=0;i<headerRow.length;i++){ const h=normNoDia(headerRow[i]||""); if (want.some(w=>h.startsWith(w)||w.startsWith(h))) return i; }
  for (let i=0;i<headerRow.length;i++){ const h=normNoDia(headerRow[i]||""); if (want.some(w=>h.includes(w)||w.includes(h))) return i; }
  return -1;
}

function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function parseDate(s){
  const t=String(s||"").trim(); if(!t) return null;
  const mVn=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if(mVn) return new Date(+mVn[3], +mVn[2]-1, +mVn[1]);
  const mIso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if(mIso) return new Date(+mIso[1], +mIso[2]-1, +mIso[3]);
  const n=Number(t);
  if(!Number.isNaN(n) && n>25000){ const base=new Date(Date.UTC(1899,11,30)); return new Date(base.getTime()+n*86400000); }
  return null;
}
function notExpired(expiryStr){
  if(!expiryStr || String(expiryStr).trim()==="") return true; // không giới hạn
  const d=parseDate(expiryStr); if(!d) return false;
  return startOfDay(d) >= startOfDay(new Date());
}
function daysLeft(expiryStr){
  if(!expiryStr || String(expiryStr).trim()==="") return Infinity;
  const d=parseDate(expiryStr); if(!d) return -9999;
  return Math.round((startOfDay(d)-startOfDay(new Date()))/86400000);
}

/** ===== Main ===== */
export default async function handler(req, res){
  try{
    if(!SHEET_ID) return res.status(500).json({access:false,error:"Missing SHEET_ID env var"});

    const email = normLower(req.query.email || "");
    if(!email) return res.status(400).json({access:false,error:"Missing email"});

    // Lấy gpt & name theo ưu tiên: header -> query -> ENV mặc định
    const key = String(req.headers["x-gpt-key"]||"").trim();
    const mapped = key ? GPT_KEY_MAP[key] : null;

    const queryGpt  = normLower(req.query.gpt || "");
    let   queryName = req.query.name || "";
    try { queryName = decodeURIComponent(queryName); } catch(_e) {}
    const gptId   = normLower(mapped?.id || queryGpt || DEFAULT_GPT_ID);
    const gptName = (mapped?.name || queryName || DEFAULT_GPT_NAME).trim();
    const gptNameNoDia = normNoDia(gptName);

    if(!gptId || !gptName){
      return res.status(400).json({access:false,error:"Missing GPT id/name and no defaults configured"});
    }

    // Auth (cần quyền sửa để tô màu Expiry)
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g,"\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({version:"v4", auth});

    // Đọc sheet
    const range = (SHEET_NAME?`${SHEET_NAME}!`:"") + SHEET_RANGE;
    const resp  = await sheets.spreadsheets.values.get({ spreadsheetId:SHEET_ID, range });
    const values = resp.data.values || [];
    if(values.length===0) return res.status(200).json({access:false,gpt:gptId,name:gptName,expiry:null,debug:"Sheet empty"});

    const header = values[0];
    const idxEmail   = headerIndex(header, HDR.EMAIL);
    const idxExpiry  = headerIndex(header, HDR.EXPIRE);
    const idxGptId   = headerIndex(header, HDR.GPT_ID);
    const idxGptName = headerIndex(header, HDR.GPT_NAME);

    if(idxEmail<0 || idxExpiry<0 || idxGptId<0 || idxGptName<0){
      return res.status(500).json({access:false,error:"Header mapping failed",headers:header});
    }

    // Tìm dòng: ưu tiên EXACT (Email+ID+Name) > WILDCARD (ID="*", Name="*" hoặc rỗng)
    let exactRow=-1, exactExp=null;
    let starRow=-1,  starExp=null;

    for(let i=1;i<values.length;i++){
      const row = values[i] || [];
      const e = normLower(row[idxEmail]  || "");
      const id= normLower(row[idxGptId]  || "");
      const nm= normNoDia(row[idxGptName] || "");
      if(e!==email) continue;

      if(id===gptId && nm===gptNameNoDia){ exactRow=i; exactExp=row[idxExpiry]||""; break; }
      if(id==="*" && (nm==="*" || nm==="")){ if(starRow===-1){ starRow=i; starExp=row[idxExpiry]||""; } }
    }

    let usedRow=-1, expiryCell=null, match="none";
    if(exactRow>0){ usedRow=exactRow; expiryCell=exactExp; match="exact"; }
    else if(starRow>0){ usedRow=starRow; expiryCell=starExp; match="wildcard"; }

    const access = usedRow>0 ? notExpired(expiryCell) : false;
    const dLeft  = usedRow>0 ? (expiryCell? daysLeft(expiryCell) : null) : null;

    // Tô màu ô Expiry của dòng usedRow (nếu có)
    if(usedRow>0){
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: "sheets(properties(sheetId,title))"
      });
      const sheetProp = SHEET_NAME
        ? meta.data.sheets.find(s => (s.properties?.title||"")===SHEET_NAME)
        : meta.data.sheets[0];
      const sheetId = sheetProp?.properties?.sheetId;

      if(sheetId!=null){
        const RED={red:0.99,green:0.91,blue:0.91};
        const YEL={red:1.00,green:0.97,blue:0.85};
        const WHITE={red:1.00,green:1.00,blue:1.00};
        let bg=WHITE;
        if(dLeft!==null){ if(dLeft<0) bg=RED; else if(dLeft<=5) bg=YEL; }

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId:SHEET_ID,
          requestBody:{ requests:[{
            repeatCell:{
              range:{ sheetId, startRowIndex:usedRow, endRowIndex:usedRow+1, startColumnIndex:idxExpiry, endColumnIndex:idxExpiry+1 },
              cell:{ userEnteredFormat:{ backgroundColor:bg } },
              fields:"userEnteredFormat.backgroundColor"
            }
          }] }
        });
      }
    }

    return res.status(200).json({
      access,
      gpt: gptId,
      name: gptName,
      expiry: expiryCell || null,
      daysLeft: dLeft,
      match
    });

  }catch(err){
    console.error("checkAccess error:", err);
    return res.status(500).json({access:false,error:err.message,stack:err.stack});
  }
}
