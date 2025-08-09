// /api/check.js
import { google } from "googleapis";
import { JWT } from "google-auth-library";

/** ======== ENV & CONFIG (bắt buộc có SHEET_ID) ======== */
const SHEET_ID     = process.env.SHEET_ID;
const SHEET_NAME   = process.env.SHEET_NAME || "";          // rỗng = sheet đầu
const SHEET_RANGE  = process.env.SHEET_RANGE || "1:10000";  // đọc cả header

// KHÓA HEADER -> { id, name } (điền đúng tên 3 GPT của anh)
const GPT_KEY_MAP = {
  // Ví dụ (bật header để khỏi phải truyền query name/id):
  // "BC_01": { id: "gpt-bc",  name: "Trợ lý Báo cáo" },
  // "GA_01": { id: "gpt-ga",  name: "Trợ lý Giáo án" },
  // "VD_01": { id: "gpt-vid", name: "Trợ lý Video"  }, // chú ý: sheet anh đang là gpt-vid
};

/** ======== TÊN CỘT LINH HOẠT ======== */
const HDR = {
  EMAIL:   ["email", "email được phép sử dụng gpts", "địa chỉ email", "email duoc phep su dung gpts", "mail"],
  EXPIRE:  ["thời hạn sử dụng", "thời hạn sử dụng gpts", "ngày hết hạn", "hạn sử dụng", "thoi han su dung", "han su dung", "expiry", "expiration", "expire"],
  GPT_ID:  ["gpts id", "gpt id", "mã gpt", "ma gpt", "id"],
  GPT_NAME:["tên gpts", "ten gpts", "ten gpt", "gpts name", "tên gpt", "name", "ten"],
};

/** ======== HELPERS ======== */
const normLower = (s="") => String(s).trim().toLowerCase();
const stripDia  = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const normHead  = (s="") => stripDia(normLower(s));

function headIndex(row, cands){
  const want = cands.map(normHead);
  for (let i=0;i<row.length;i++){ const h=normHead(row[i]||""); if (want.includes(h)) return i; }
  for (let i=0;i<row.length;i++){ const h=normHead(row[i]||""); if (want.some(w=>h.startsWith(w)||w.startsWith(h))) return i; }
  for (let i=0;i<row.length;i(){ const h=normHead(row[i]||""); if (want.some(w=>h.includes(w)||w.includes(h))) return i; }
  return -1;
}

const startOfDay = d => { const x=new Date(d); x.setHours(0,0,0,0); return x; };

function parseDate(s){
  const t=String(s||"").trim();
  if(!t) return null;
  const mVn=/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(t);
  if(mVn) return new Date(+mVn[3], +mVn[2]-1, +mVn[1]);
  const mIso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if(mIso) return new Date(+mIso[1], +mIso[2]-1, +mIso[3]);
  const n=Number(t);
  if(!Number.isNaN(n) && n>25000){ const base=new Date(Date.UTC(1899,11,30)); return new Date(base.getTime()+n*86400000); }
  return null;
}

// Expiry rỗng = không giới hạn
function notExpired(expiryStr){
  if(!expiryStr || String(expiryStr).trim()==="") return true;
  const d=parseDate(expiryStr); if(!d) return false;
  return startOfDay(d) >= startOfDay(new Date());
}
function daysLeft(expiryStr){
  if(!expiryStr || String(expiryStr).trim()==="") return Infinity;
  const d=parseDate(expiryStr); if(!d) return -9999;
  return Math.round((startOfDay(d)-startOfDay(new Date()))/86400000);
}

/** ======== MAIN ======== */
export default async function handler(req, res){
  try{
    if(!SHEET_ID) return res.status(500).json({access:false,error:"Missing SHEET_ID env var"});

    const email = normLower(req.query.email || "");
    // Ưu tiên header; nếu không có thì dùng query (?gpt=&name=)
    const key   = String(req.headers["x-gpt-key"]||"").trim();
    const map   = key ? GPT_KEY_MAP[key] : null;

    const gptId   = normLower(map?.id   || req.query.gpt   || "");
    const gptName = normLower(map?.name || req.query.name  || ""); // BẮT BUỘC

    if(!email || !gptId || !gptName){
      return res.status(400).json({access:false,error:"Missing params: email + gpt + name (or use x-gpt-key mapping)."});
    }

    // Auth (cần quyền sửa để tô màu Expiry)
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g,"\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({version:"v4", auth});

    // Đọc dữ liệu
    const range = (SHEET_NAME?`${SHEET_NAME}!`:"") + SHEET_RANGE;
    const resp  = await sheets.spreadsheets.values.get({ spreadsheetId:SHEET_ID, range });
    const values = resp.data.values || [];
    if(values.length===0) return res.status(200).json({access:false,gpt:gptId,name:gptName,expiry:null,debug:"Sheet empty"});

    const header = values[0];
    const idxEmail   = headIndex(header, HDR.EMAIL);
    const idxExpiry  = headIndex(header, HDR.EXPIRE);
    const idxGptId   = headIndex(header, HDR.GPT_ID);
    const idxGptName = headIndex(header, HDR.GPT_NAME);

    if(idxEmail<0 || idxExpiry<0 || idxGptId<0 || idxGptName<0){
      return res.status(500).json({access:false,error:"Header mapping failed",headers:header});
    }

    // Ưu tiên Exact > Wildcard (*)
    let exactRow=-1, exactExp=null;
    let starRow=-1,  starExp=null;

    for(let i=1;i<values.length;i++){
      const row = values[i] || [];
      const e = normLower(row[idxEmail]   || "");
      const id= normLower(row[idxGptId]   || "");
      const nm= normLower(row[idxGptName] || "");
      if(e!==email) continue;

      // Exact: Email + ID + Name
      if(id===gptId && nm===gptName){
        exactRow=i; exactExp=row[idxExpiry]||""; break;
      }

      // Wildcard: ID="*" & Name="*" hoặc rỗng
      if(id==="*" && (nm==="*" || nm==="")){
        if(starRow===-1){ starRow=i; starExp=row[idxExpiry]||""; }
      }
    }

    let usedRow=-1, expiryC
