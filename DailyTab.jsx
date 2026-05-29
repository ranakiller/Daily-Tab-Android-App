import { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// ─────────────────────────────────────────────────────────────────
//  🔥  FIREBASE CONFIG
//  1. Go to https://console.firebase.google.com
//  2. Create a project → Add a Web App
//  3. Copy the config object here
//  4. Enable Authentication (Google + Email/Password)
//  5. Enable Firestore Database (start in test mode, secure later)
// ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAMFuHlZFGJDcTsUlndkbfgdYlsKDneniM",
  authDomain: "daily-tab-android-app.firebaseapp.com",
  projectId: "daily-tab-android-app",
  storageBucket: "daily-tab-android-app.firebasestorage.app",
  messagingSenderId: "622567813887",
  appId: "1:622567813887:web:aea9f78ecffabee77f52ca",
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
const gProv = new GoogleAuthProvider();

/* ─── constants ─────────────────────────────────────────────── */
const PALETTE = ["#f97316","#06b6d4","#8b5cf6","#22c55e","#ec4899","#eab308","#14b8a6","#f43f5e"];
const DOW     = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const uid    = () => Math.random().toString(36).slice(2, 9);
const today  = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const curMon = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };

function prevMon(m) { const [y,mo]=m.split("-").map(Number); return mo===1?`${y-1}-12`:`${y}-${String(mo-1).padStart(2,"0")}`; }
function nextMon(m) { const [y,mo]=m.split("-").map(Number); return mo===12?`${y+1}-01`:`${y}-${String(mo+1).padStart(2,"0")}`; }
function mLabel(m)  { const [y,mo]=m.split("-"); return new Date(+y,+mo-1,1).toLocaleString("default",{month:"long",year:"numeric"}); }
function dLabel(d)  { return new Date(d+"T12:00").toLocaleDateString("default",{weekday:"short",day:"numeric",month:"short"}); }
function calDays(m) {
  const [y,mo]=m.split("-").map(Number);
  const first=new Date(y,mo-1,1).getDay(), dim=new Date(y,mo,0).getDate(), cells=[];
  for(let i=0;i<first;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);
  while(cells.length%7!==0) cells.push(null);
  return cells;
}
function padDate(m,d) { const [y,mo]=m.split("-"); return `${y}-${mo}-${String(d).padStart(2,"0")}`; }

/* ─── Firestore helpers ──────────────────────────────────────── */
// Firestore doc IDs can't contain "/" or ":" — replace them
const safeKey = k => k.replace(/[:/]/g, "_");

async function sGet(userUid, k, fallback) {
  try {
    const snap = await getDoc(doc(db, "users", userUid, "data", safeKey(k)));
    if (snap.exists()) return snap.data().value;
  } catch (_) {}
  return fallback;
}

async function sSet(userUid, k, v) {
  try {
    await setDoc(doc(db, "users", userUid, "data", safeKey(k)), { value: v });
  } catch (_) {}
}

/* ─── design tokens ─────────────────────────────────────────── */
const BG="var(--dt-bg)", CARD="var(--dt-card)", CARD2="var(--dt-c2)", BDR="var(--dt-bdr)";
const TXT="var(--dt-txt)", MT="var(--dt-mt)", GRN="#22c55e", RED="#f87171", AMB="#fbbf24", IND="#6366f1";

const THEMES = {
  dark:  { "--dt-bg":"#0d0d18","--dt-card":"#14141f","--dt-c2":"#1c1c2c","--dt-bdr":"#26263a","--dt-txt":"#eeeef5","--dt-mt":"#6c6c90" },
  light: { "--dt-bg":"#f0f2ff","--dt-card":"#ffffff","--dt-c2":"#e8ecf8","--dt-bdr":"#d5daf0","--dt-txt":"#0f0f1e","--dt-mt":"#6878a8" },
};

// Apply dark theme immediately to avoid flash before App mounts
(function applyDefaultTheme() {
  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const vars = THEMES[isDark ? "dark" : "light"];
  Object.entries(vars).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
  document.body.style.background = vars["--dt-bg"];
})();

/* ─── tiny reusable components ───────────────────────────────── */
function Card({ children, style }) {
  return <div style={{ background:CARD, border:`1px solid ${BDR}`, borderRadius:16, padding:16, ...style }}>{children}</div>;
}

function Btn({ children, onClick, color, outline, sm, full, disabled, danger }) {
  const c = danger ? RED : (color || IND);
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: outline ? "transparent" : c, color: outline ? c : "#fff",
      border: `1.5px solid ${c}`, borderRadius:10,
      padding: sm ? "6px 14px" : "11px 20px", fontSize: sm ? 13 : 15, fontWeight:600,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      width: full ? "100%" : "auto", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
    }}>{children}</button>
  );
}

function Inp({ value, onChange, placeholder, type, style }) {
  return (
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type||"text"}
      style={{ background:CARD2, border:`1px solid ${BDR}`, borderRadius:10, padding:"11px 13px", color:TXT, fontSize:15, width:"100%", outline:"none", boxSizing:"border-box", ...style }} />
  );
}

function Sel({ value, onChange, children, style }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ background:CARD2, border:`1px solid ${BDR}`, borderRadius:10, padding:"11px 13px", color:TXT, fontSize:15, width:"100%", outline:"none", boxSizing:"border-box", ...style }}>
      {children}
    </select>
  );
}

function Lbl({ children }) {
  return <div style={{ fontSize:11, color:MT, letterSpacing:1, textTransform:"uppercase", marginBottom:6, fontWeight:700 }}>{children}</div>;
}

function Row({ children, style, onClick }) {
  return <div onClick={onClick} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", ...style }}>{children}</div>;
}

function Dot({ color }) {
  return <div style={{ width:10, height:10, borderRadius:5, background:color, flexShrink:0 }} />;
}

function Divider() {
  return <div style={{ height:1, background:BDR, margin:"10px 0" }} />;
}

function MonNav({ vm, setVm, CM }) {
  return (
    <Row style={{ marginBottom:16 }}>
      <button onClick={()=>setVm(prevMon(vm))} style={{ background:"none", border:`1px solid ${BDR}`, borderRadius:9, padding:"7px 16px", color:TXT, cursor:"pointer", fontSize:18 }}>‹</button>
      <div style={{ fontWeight:700, fontSize:16 }}>{mLabel(vm)}</div>
      <button onClick={()=>setVm(nextMon(vm))} disabled={vm>=CM} style={{ background:"none", border:`1px solid ${BDR}`, borderRadius:9, padding:"7px 16px", color:vm>=CM?MT:TXT, cursor:vm>=CM?"not-allowed":"pointer", fontSize:18 }}>›</button>
    </Row>
  );
}

/* ─────────────────────────────────────────────────────────────
   LOGIN SCREEN
──────────────────────────────────────────────────────────────── */
function LoginScreen() {
  const [mode,     setMode]     = useState("signin"); // "signin" | "signup"
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [err,      setErr]      = useState("");
  const [loading,  setLoading]  = useState(false);

  const clearErr = () => setErr("");

  const handleGoogle = async () => {
    setLoading(true); clearErr();
    try { await signInWithPopup(auth, gProv); }
    catch (e) { setErr(e.message); setLoading(false); }
  };

  const handleEmail = async () => {
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    setLoading(true); clearErr();
    try {
      if (mode === "signin") await signInWithEmailAndPassword(auth, email, password);
      else                   await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setErr(e.code === "auth/wrong-password" ? "Incorrect password." :
             e.code === "auth/user-not-found" ? "No account found — try Sign Up." :
             e.code === "auth/email-already-in-use" ? "Email already registered — try Sign In." :
             e.code === "auth/weak-password" ? "Password must be at least 6 characters." :
             e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>

        {/* logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:36, fontWeight:900, letterSpacing:-1, background:"linear-gradient(90deg,#a78bfa,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:6 }}>
            DailyTab
          </div>
          <div style={{ fontSize:14, color:MT }}>Sign in to keep your data safe & synced</div>
        </div>

        <Card style={{ padding:24 }}>
          {/* Google button */}
          <button onClick={handleGoogle} disabled={loading} style={{
            width:"100%", background:CARD2, border:`1px solid ${BDR}`, borderRadius:12,
            padding:"13px 20px", display:"flex", alignItems:"center", justifyContent:"center",
            gap:12, cursor:loading?"not-allowed":"pointer", opacity:loading?0.6:1, marginBottom:20,
          }}>
            {/* Google G icon */}
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.1 0 5.8 1.1 7.9 2.9l5.9-5.9C34.1 3.5 29.3 1.5 24 1.5 15 1.5 7.3 6.9 3.7 14.6l6.9 5.4C12.4 13.7 17.7 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-16.9z"/>
              <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-6.9-5.4A22.4 22.4 0 0 0 1.5 24c0 3.6.9 7 2.4 10l6.7-5.4z"/>
              <path fill="#34A853" d="M24 46.5c5.3 0 9.8-1.8 13-4.8l-7.4-5.7c-1.8 1.2-4 2-5.6 2-6.3 0-11.6-4.2-13.5-9.9l-6.7 5.4C7.3 41.1 15 46.5 24 46.5z"/>
            </svg>
            <span style={{ fontSize:15, fontWeight:600, color:TXT }}>Continue with Google</span>
          </button>

          {/* divider */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:BDR }} />
            <span style={{ fontSize:12, color:MT }}>or use email</span>
            <div style={{ flex:1, height:1, background:BDR }} />
          </div>

          {/* email / password */}
          <div style={{ marginBottom:12 }}>
            <Lbl>Email</Lbl>
            <Inp value={email} onChange={v=>{setEmail(v);clearErr();}} placeholder="you@example.com" type="email" />
          </div>
          <div style={{ marginBottom:20 }}>
            <Lbl>Password</Lbl>
            <Inp value={password} onChange={v=>{setPassword(v);clearErr();}} placeholder={mode==="signup"?"Min 6 characters":"Your password"} type="password" />
          </div>

          {err && <div style={{ background:`${RED}22`, border:`1px solid ${RED}55`, borderRadius:10, padding:"10px 14px", fontSize:13, color:RED, marginBottom:16 }}>{err}</div>}

          <Btn full onClick={handleEmail} disabled={loading} color={IND}>
            {loading ? "Please wait…" : mode==="signin" ? "Sign In" : "Create Account"}
          </Btn>

          <div style={{ textAlign:"center", marginTop:16, fontSize:13, color:MT }}>
            {mode==="signin" ? "Don't have an account? " : "Already have an account? "}
            <span onClick={()=>{setMode(mode==="signin"?"signup":"signin");clearErr();}} style={{ color:IND, fontWeight:600, cursor:"pointer" }}>
              {mode==="signin" ? "Sign Up" : "Sign In"}
            </span>
          </div>
        </Card>

        <div style={{ textAlign:"center", marginTop:20, fontSize:12, color:MT }}>
          Your data is stored securely in the cloud ☁️
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN APP  (receives `user` from Root)
──────────────────────────────────────────────────────────────── */
function App({ user }) {
  const CM = curMon();

  /* ── Firestore closures bound to this user ── */
  const dbGet = (k, fb) => sGet(user.uid, k, fb);
  const dbSet = (k, v)  => sSet(user.uid, k, v);

  /* data */
  const [shops,    setShopsR]   = useState([]);
  const [items,    setItemsR]   = useState([]);
  const [purch,    setPurchR]   = useState({ [CM]: [] });
  const [pays,     setPaysR]    = useState({ [CM]: {} });
  const [currency, setCurrR]    = useState("Rs.");
  const [theme,    setThemeR]   = useState("system");
  const [sysDark,  setSysDark]  = useState(false);

  /* nav */
  const [tab,     setTab]     = useState("home");
  const [vm,      setVm]      = useState(CM);
  const [calMon,  setCalMon]  = useState(CM);
  const [calFilt, setCalFilt] = useState("");

  /* calendar modal */
  const [modal,  setModal]  = useState({ open:false, date:"" });
  const [mShop,  setMShop]  = useState("");
  const [mItem,  setMItem]  = useState("");
  const [mName,  setMName]  = useState("");
  const [mQty,   setMQty]   = useState("1");
  const [mPrice, setMPrice] = useState("");
  const [mMsg,   setMMsg]   = useState({ t:"", ok:true });

  /* log form */
  const [lShop,  setLShop]  = useState("");
  const [lItem,  setLItem]  = useState("");
  const [lName,  setLName]  = useState("");
  const [lQty,   setLQty]   = useState("1");
  const [lPrice, setLPrice] = useState("");
  const [lDate,  setLDate]  = useState(today());
  const [lMsg,   setLMsg]   = useState({ t:"", ok:true });

  /* settings */
  const [nsName,      setNsName]      = useState("");
  const [niShop,      setNiShop]      = useState("");
  const [niName,      setNiName]      = useState("");
  const [niPrice,     setNiPrice]     = useState("");
  const [currInp,     setCurrInp]     = useState("Rs.");
  const [savedCurrs,  setSavedCurrs]  = useState([]);
  const [editP,       setEditP]       = useState({});

  /* summary/history */
  const [histExp, setHistExp] = useState("");
  const [summExp, setSummExp] = useState("");
  const [summPay, setSummPay] = useState({});

  /* undo delete / quick-add / modal */
  const [undoQueue,    setUndoQueue]    = useState([]);
  const [qkLoading,    setQkLoading]    = useState({});
  const [qkDone,       setQkDone]       = useState({});
  const [modalShowAdd, setModalShowAdd] = useState(false);
  const [shareMsg,     setShareMsg]     = useState("");
  const purchRef = useRef(purch);

  const fmt = n => `${currency}${(+n||0).toFixed(2)}`;

  /* ── init: load all data from Firestore ── */
  useEffect(() => {
    (async () => {
      const s   = await dbGet("dt_shops",    []);
      const it  = await dbGet("dt_items",    []);
      const p   = await dbGet(`dt_p:${CM}`,  []);
      const pay = await dbGet(`dt_pay:${CM}`,{});
      const cur = await dbGet("dt_cur",      "Rs.");
      const sc  = await dbGet("dt_scurrs",   []);
      const th  = await dbGet("dt_theme",    "system");
      setShopsR(s||[]); setItemsR(it||[]);
      setPurchR({ [CM]: p||[] }); setPaysR({ [CM]: pay||{} });
      setCurrR(cur||"Rs."); setCurrInp(cur||"Rs.");
      setSavedCurrs(sc||[]);
      setThemeR(th||"system");
      const first = (s||[])[0];
      if (first) { setLShop(first.id); setNiShop(first.id); setMShop(first.id); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── system dark mode listener ── */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSysDark(mq.matches);
    const h = e => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  /* ── apply CSS variables whenever theme changes ── */
  useEffect(() => {
    const isDark = theme === "dark" || (theme === "system" && sysDark);
    const vars   = THEMES[isDark ? "dark" : "light"];
    const root   = document.documentElement.style;
    Object.entries(vars).forEach(([k,v]) => root.setProperty(k,v));
    document.body.style.background = vars["--dt-bg"] || "";
  }, [theme, sysDark]);

  /* ── lazy-load purchases when viewing month changes ── */
  useEffect(() => {
    (async () => {
      if (purch[vm] !== undefined) return;
      const p   = await dbGet(`dt_p:${vm}`,   []);
      const pay = await dbGet(`dt_pay:${vm}`, {});
      setPurchR(prev => ({ ...prev, [vm]: p||[] }));
      setPaysR(prev  => ({ ...prev, [vm]: pay||{} }));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm]);

  useEffect(() => {
    (async () => {
      if (purch[calMon] !== undefined) return;
      const p = await dbGet(`dt_p:${calMon}`, []);
      setPurchR(prev => ({ ...prev, [calMon]: p||[] }));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calMon]);

  /* keep ref in sync with purch state so delete timers read current data */
  useEffect(() => { purchRef.current = purch; }, [purch]);

  /* ── midnight refresh: re-renders the app when the calendar day rolls over ── */
  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const ms  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
      return setTimeout(() => { setLDate(today()); schedule(); }, ms);
    };
    const t = schedule();
    return () => clearTimeout(t);
  }, []);

  /* ── persist helpers ── */
  const setShops = async v => { setShopsR(v); await dbSet("dt_shops", v); };
  const setItems = async v => { setItemsR(v); await dbSet("dt_items", v); };
  const setPM    = async (m, arr) => { setPurchR(p => ({ ...p, [m]: arr })); await dbSet(`dt_p:${m}`, arr); };
  const setPyM   = async (m, obj) => { setPaysR(p  => ({ ...p, [m]: obj })); await dbSet(`dt_pay:${m}`, obj); };
  const setTheme = async v => { setThemeR(v); await dbSet("dt_theme", v); };

  const applyCurrency = async v => {
    const sym = (v || "Rs.").trim();
    setCurrR(sym);
    await dbSet("dt_cur", sym);
    setSavedCurrs(prev => {
      const next = [sym, ...prev.filter(c => c !== sym)];
      dbSet("dt_scurrs", next);
      return next;
    });
  };

  /* ── shop / item actions ── */
  const addShop = async () => {
    if (!nsName.trim()) return;
    const sh   = { id:uid(), name:nsName.trim(), color:PALETTE[shops.length%PALETTE.length] };
    const next = [...shops, sh];
    await setShops(next);
    if (!lShop) setLShop(sh.id);
    if (!niShop) setNiShop(sh.id);
    if (!mShop)  setMShop(sh.id);
    setNsName("");
  };
  const delShop  = async id => { await setShops(shops.filter(s=>s.id!==id)); await setItems(items.filter(i=>i.shopId!==id)); if(lShop===id) setLShop(""); };
  const addItem  = async () => { if(!niName.trim()||!niShop||!niPrice) return; await setItems([...items,{id:uid(),shopId:niShop,name:niName.trim(),price:+niPrice}]); setNiName(""); setNiPrice(""); };
  const delItem  = async id  => setItems(items.filter(i=>i.id!==id));
  const updPrice = async (id, price) => { await setItems(items.map(i=>i.id===id?{...i,price:+price}:i)); setEditP(p=>{const n={...p};delete n[id];return n;}); };

  /* ── purchase actions ── */
  const savePurch = async (date, shopId, itemId, itemName, qty, price, setMsg, onOk) => {
    if (!shopId)           { setMsg({ t:"Select a shop",       ok:false }); return; }
    if (!itemName.trim())  { setMsg({ t:"Enter item name",     ok:false }); return; }
    if (!price||+price<=0) { setMsg({ t:"Enter a valid price", ok:false }); return; }
    const m        = date.slice(0,7);
    const existing = purch[m] !== undefined ? purch[m] : await dbGet(`dt_p:${m}`, []);
    const entry    = { id:uid(), date, shopId, itemId:itemId||null, itemName:itemName.trim(), qty:+qty||1, price:+price, total:(+qty||1)*(+price) };
    await setPM(m, [...(existing||[]), entry]);
    setMsg({ t:"✓ Saved!", ok:true });
    setTimeout(() => setMsg({ t:"", ok:true }), 2000);
    if (onOk) onOk();
  };

  const logPurch  = async () => { const name=lItem?(items.find(i=>i.id===lItem)?.name||lName):lName.trim(); await savePurch(lDate,lShop,lItem,name,lQty,lPrice,setLMsg,()=>{setLItem("");setLName("");setLQty("1");setLPrice("");}); };
  const modalSave = async () => { const name=mItem?(items.find(i=>i.id===mItem)?.name||mName):mName.trim(); await savePurch(modal.date,mShop,mItem,name,mQty,mPrice,setMMsg,()=>{setMItem("");setMName("");setMQty("1");setMPrice("");}); };
  const delPurch = (m, id) => {
    const entry = (purch[m]||[]).find(p => p.id === id);
    if (!entry) return;
    const newArr = (purch[m]||[]).filter(p => p.id !== id);
    purchRef.current = { ...purchRef.current, [m]: newArr };
    setPurchR(prev => ({ ...prev, [m]: newArr }));
    const timerId = setTimeout(() => {
      dbSet(`dt_p:${m}`, purchRef.current[m] || []);
      setUndoQueue(q => q.filter(x => x.id !== id));
    }, 5000);
    setUndoQueue(q => [...q.filter(x => x.id !== id), { id, m, entry, timerId }]);
  };

  const undoDel = ({ id, m, entry, timerId }) => {
    clearTimeout(timerId);
    const restored = [...(purchRef.current[m]||[]), entry]
      .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    purchRef.current = { ...purchRef.current, [m]: restored };
    setPurchR(prev => ({ ...prev, [m]: restored }));
    dbSet(`dt_p:${m}`, restored);
    setUndoQueue(q => q.filter(x => x.id !== id));
  };
  const markPaid  = async (m, sid, amt) => { const cur=pays[m]||{}; await setPyM(m,{...cur,[sid]:(+(cur[sid]||0))+(+amt)}); setSummPay(p=>({...p,[sid]:""})); };
  const resetPaid = async (m, sid)      => { const cur=pays[m]||{}; await setPyM(m,{...cur,[sid]:0}); };

  /* ── computed ── */
  const byShop   = id => shops.find(s=>s.id===id);
  const byShopIt = id => items.filter(i=>i.shopId===id);
  const pm       = m  => purch[m]||[];
  const pym      = m  => pays[m]||{};
  const sTot     = (sid,m) => pm(m).filter(p=>p.shopId===sid).reduce((a,p)=>a+p.total,0);
  const sPaid    = (sid,m) => +(pym(m)[sid]||0);
  const sOwed    = (sid,m) => Math.max(0,sTot(sid,m)-sPaid(sid,m));
  const totalOwed = shops.reduce((a,s)=>a+sOwed(s.id,CM),0);

  /* ── quick-add: top items by purchase frequency ── */
  const topItems = useMemo(() => {
    const freq = {};
    Object.values(purch).forEach(arr => (arr||[]).forEach(p => {
      if (!p.shopId || !p.itemName) return;
      const key = `${p.shopId}||${p.itemName.toLowerCase().trim()}`;
      if (!freq[key]) freq[key] = { shopId:p.shopId, itemName:p.itemName.trim(), price:p.price, count:0 };
      freq[key].count++;
      freq[key].price = p.price;
    }));
    return Object.values(freq).sort((a,b) => b.count - a.count).slice(0, 6);
  }, [purch]);

  const quickLog = async (shopId, itemName, price) => {
    const key = `${shopId}||${itemName}`;
    setQkLoading(l => ({...l, [key]: true}));
    await savePurch(today(), shopId, null, itemName, 1, price, ()=>{}, ()=>{});
    setQkLoading(l => ({...l, [key]: false}));
    setQkDone(d => ({...d, [key]: true}));
    setTimeout(() => setQkDone(d => ({...d, [key]: false})), 1800);
  };

  const shareMonth = () => {
    const lines = shops.map(sh => {
      const tot = sTot(sh.id, vm), paid = sPaid(sh.id, vm), owed = sOwed(sh.id, vm);
      return `• ${sh.name}: Total ${fmt(tot)}, Paid ${fmt(paid)}, Owed ${fmt(owed)}${owed===0&&tot>0?" ✓":""}`;
    }).join("\n");
    const grandTotal  = vmP.reduce((a,p)=>a+p.total,0);
    const totalOwedMon = shops.reduce((a,s)=>a+sOwed(s.id,vm),0);
    const text = `📊 DailyTab — ${mLabel(vm)}\n\n${lines}\n\n💰 Grand Total: ${fmt(grandTotal)}\n📌 Still Owed: ${fmt(totalOwedMon)}`;
    if (navigator.share) {
      navigator.share({ text }).catch(()=>{});
    } else {
      navigator.clipboard?.writeText(text);
      setShareMsg("Copied to clipboard!");
      setTimeout(() => setShareMsg(""), 2500);
    }
  };

  const pickItem = (id, setItm, setPrc) => {
    setItm(id);
    if (id) { const it=items.find(i=>i.id===id); if(it) setPrc(String(it.price)); }
    else setPrc("");
  };

  const vmP        = pm(vm);
  const byDate     = {};
  vmP.forEach(p=>{ if(!byDate[p.date]) byDate[p.date]=[]; byDate[p.date].push(p); });
  const sortedDates = Object.keys(byDate).sort().reverse();

  const todayP     = (purch[CM]||[]).filter(p=>p.date===today());
  const todayTotal = todayP.reduce((a,p)=>a+p.total,0);

  /* ── calendar helpers ── */
  const openModal = date => {
    setModal({ open:true, date });
    setMMsg({ t:"", ok:true });
    if (shops.length>0) setMShop(shops[0].id);
    setMItem(""); setMName(""); setMQty("1"); setMPrice("");
    const hasPurch = (purch[date.slice(0,7)]||[]).some(p => p.date === date);
    setModalShowAdd(!hasPurch);
  };
  const getDateShops = date => {
    const m  = date.slice(0,7);
    const dp = (purch[m]||[]).filter(p=>p.date===date);
    if (calFilt) return dp.some(p=>p.shopId===calFilt)?[calFilt]:[];
    return [...new Set(dp.map(p=>p.shopId))];
  };
  const modalPurch = modal.date ? (purch[modal.date.slice(0,7)]||[]).filter(p=>p.date===modal.date) : [];

  /* ── calendar frequency stats ── */
  let calStats = { items:[], daysElapsed:30, daysInMon:30 };
  try {
    const _cm  = String(calMon||CM);
    const [_y,_mo] = _cm.split("-").map(Number);
    const _dim  = new Date(_y,_mo,0).getDate();
    const _de   = _cm===CM ? new Date().getDate() : _dim;
    const _mp   = (purch[_cm]||[]).filter(p=>p&&(!calFilt||p.shopId===calFilt));
    const _smap = {};
    _mp.forEach(p=>{ const _n=(p.itemName||"Unknown").trim(); const _k=_n.toLowerCase(); if(!_smap[_k]) _smap[_k]={name:_n,shopId:p.shopId||"",dates:new Set()}; if(p.date) _smap[_k].dates.add(p.date); });
    calStats = { items:Object.values(_smap).sort((a,b)=>b.dates.size-a.dates.size), daysElapsed:_de, daysInMon:_dim };
  } catch(_e) {}

  /* ── nav ── */
  const NAV = [
    { id:"home",     icon:"🏠", label:"Home"    },
    { id:"log",      icon:"＋", label:"Log"     },
    { id:"calendar", icon:"📅", label:"Cal"     },
    { id:"history",  icon:"📋", label:"History" },
    { id:"summary",  icon:"💰", label:"Summary" },
    { id:"settings", icon:"⚙️", label:"Settings"},
  ];

  /* ══════════════════════════════════════════════════════════ */
  return (
    <div style={{ background:BG, minHeight:"100vh", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color:TXT, paddingBottom:72, maxWidth:480, width:"100%", margin:"0 auto", boxSizing:"border-box", overflowX:"hidden" }}>

      {/* ── header ── */}
      <div style={{ background:CARD, borderBottom:`1px solid ${BDR}`, padding:"12px 18px", position:"sticky", top:0, zIndex:10 }}>
        <Row>
          <div>
            <div style={{ fontSize:20, fontWeight:900, letterSpacing:-0.5, background:"linear-gradient(90deg,#a78bfa,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>DailyTab</div>
            <div style={{ fontSize:12, color:MT, marginTop:1 }}>Daily purchase tracker</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {totalOwed > 0 && (
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:MT }}>This Month</div>
                <div style={{ fontSize:18, fontWeight:800, color:RED }}>{fmt(totalOwed)}</div>
              </div>
            )}
            {/* user avatar + sign out */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              {user.photoURL
                ? <img src={user.photoURL} alt="avatar" style={{ width:32, height:32, borderRadius:16, border:`2px solid ${IND}` }} />
                : <div style={{ width:32, height:32, borderRadius:16, background:IND, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff" }}>
                    {(user.displayName||user.email||"?")[0].toUpperCase()}
                  </div>
              }
              <button onClick={()=>signOut(auth)} style={{ background:"none", border:"none", fontSize:10, color:MT, cursor:"pointer", padding:0 }}>Sign out</button>
            </div>
          </div>
        </Row>
      </div>

      {/* ══ HOME ══ */}
      {tab==="home" && (
        <div style={{ padding:16 }}>
          {totalOwed > 0 && (
            <div style={{ background:"linear-gradient(135deg,#3b0764,#1e1b4b)", border:"1px solid #4c1d95", borderRadius:18, padding:"18px 20px", marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#a78bfa", letterSpacing:1, textTransform:"uppercase", fontWeight:700, marginBottom:6 }}>Total Owed — {mLabel(CM)}</div>
              <div style={{ fontSize:38, fontWeight:900, color:"#fff", letterSpacing:-1 }}>{fmt(totalOwed)}</div>
              <div style={{ fontSize:13, color:"#c4b5fd", marginTop:4 }}>across {shops.length} shop{shops.length!==1?"s":""}</div>
            </div>
          )}

          <Card style={{ marginBottom:16 }}>
            <Row style={{ marginBottom:12 }}>
              <div><Lbl>Today</Lbl><div style={{ fontSize:13, color:MT }}>{dLabel(today())}</div></div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:28, fontWeight:800 }}>{fmt(todayTotal)}</div>
                <div style={{ fontSize:12, color:MT }}>{todayP.length} item{todayP.length!==1?"s":""}</div>
              </div>
            </Row>
            {todayP.length === 0
              ? <div style={{ color:MT, fontSize:13, textAlign:"center", padding:"6px 0" }}>Nothing logged today</div>
              : todayP.map(p => {
                  const sh = byShop(p.shopId);
                  return (
                    <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop:`1px solid ${BDR}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <Dot color={sh?.color||MT} />
                        <div>
                          <div style={{ fontSize:14, fontWeight:600 }}>{p.itemName}</div>
                          <div style={{ fontSize:11, color:MT }}>{sh?.name} · ×{p.qty}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:15, fontWeight:700, color:AMB }}>{fmt(p.total)}</div>
                    </div>
                  );
                })
            }
            <div style={{ marginTop:14 }}>
              <Btn full onClick={()=>setTab("log")} color={IND}>＋ Log Purchase</Btn>
            </div>
          </Card>

          {/* ── Quick Add ── */}
          {topItems.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <Lbl>Quick Add — Today</Lbl>
              <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, WebkitOverflowScrolling:"touch" }}>
                {topItems.map(it => {
                  const sh = byShop(it.shopId);
                  if (!sh) return null;
                  const key  = `${it.shopId}||${it.itemName}`;
                  const done = qkDone[key], loading = qkLoading[key];
                  return (
                    <div key={key} onClick={() => !loading && !done && quickLog(it.shopId, it.itemName, it.price)}
                      style={{ background:done?`${GRN}22`:CARD, border:`1.5px solid ${done?GRN:BDR}`, borderRadius:14, padding:"12px 14px", cursor:loading||done?"default":"pointer", flexShrink:0, minWidth:110, textAlign:"center", transition:"border-color .2s,background .2s" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:5, marginBottom:5 }}>
                        <div style={{ width:7, height:7, borderRadius:4, background:sh.color }} />
                        <span style={{ fontSize:10, color:MT, fontWeight:600 }}>{sh.name}</span>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:TXT, marginBottom:3 }}>{it.itemName}</div>
                      <div style={{ fontSize:13, color:AMB, fontWeight:700, marginBottom:8 }}>{fmt(it.price)}</div>
                      <div style={{ fontSize:loading||done?13:18, fontWeight:700, color:done?GRN:IND }}>
                        {loading ? "…" : done ? "✓ Added" : "＋"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Lbl>{mLabel(CM)} — Shop Balances</Lbl>
          {shops.length === 0
            ? <Card style={{ textAlign:"center", color:MT, fontSize:13 }}>No shops yet.{" "}<span style={{ color:IND, cursor:"pointer" }} onClick={()=>setTab("settings")}>Add in Settings →</span></Card>
            : shops.map(sh => {
                const tot=sTot(sh.id,CM), paid=sPaid(sh.id,CM), owed=sOwed(sh.id,CM);
                return (
                  <Card key={sh.id} style={{ marginBottom:10, cursor:"pointer" }} onClick={()=>{setVm(CM);setTab("summary");}}>
                    <Row>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <Dot color={sh.color} />
                        <div>
                          <div style={{ fontSize:15, fontWeight:700 }}>{sh.name}</div>
                          {paid > 0 && <div style={{ fontSize:11, color:GRN }}>Paid: {fmt(paid)}</div>}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:22, fontWeight:800, color:owed>0?RED:GRN }}>{fmt(owed)}</div>
                        <div style={{ fontSize:11, color:MT }}>of {fmt(tot)}</div>
                      </div>
                    </Row>
                    {tot > 0 && (
                      <div style={{ height:5, background:BDR, borderRadius:5, marginTop:10, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(100,(paid/tot)*100)}%`, background:GRN, borderRadius:5 }} />
                      </div>
                    )}
                  </Card>
                );
              })
          }
        </div>
      )}

      {/* ══ LOG ══ */}
      {tab==="log" && (
        <div style={{ padding:16 }}>
          <Card>
            <div style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Log a Purchase</div>
            <Lbl>Date</Lbl>
            <Inp value={lDate} onChange={setLDate} type="date" style={{ marginBottom:16 }} />
            <Lbl>Shop</Lbl>
            <Sel value={lShop} onChange={v=>{setLShop(v);setLItem("");setLPrice("");}} style={{ marginBottom:16 }}>
              <option value="">Select shop…</option>
              {shops.map(sh=><option key={sh.id} value={sh.id}>{sh.name}</option>)}
            </Sel>
            {shops.length===0 && <div style={{ textAlign:"center", color:MT, fontSize:13, marginBottom:12 }}><span style={{ color:IND, cursor:"pointer" }} onClick={()=>setTab("settings")}>Add a shop in Settings first →</span></div>}
            {lShop && (
              <div>
                <Lbl>Item</Lbl>
                <Sel value={lItem} onChange={id=>pickItem(id,setLItem,setLPrice)} style={{ marginBottom:10 }}>
                  <option value="">— Custom / type below —</option>
                  {byShopIt(lShop).map(it=><option key={it.id} value={it.id}>{it.name} ({fmt(it.price)})</option>)}
                </Sel>
                {!lItem && <Inp value={lName} onChange={setLName} placeholder="Item name e.g. Milk…" style={{ marginBottom:16 }} />}
                {lItem  && <div style={{ height:16 }} />}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <div><Lbl>Qty</Lbl><Inp value={lQty}   onChange={setLQty}   type="number" placeholder="1"    style={{ textAlign:"center" }} /></div>
                  <div><Lbl>Price {currency}/unit</Lbl><Inp value={lPrice} onChange={setLPrice} type="number" placeholder="0.00" /></div>
                </div>
                {(+lQty||1)*(+lPrice||0)>0 && (
                  <div style={{ background:CARD2, borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ color:MT, fontSize:14 }}>Line Total</span>
                    <span style={{ fontSize:22, fontWeight:800, color:AMB }}>{fmt((+lQty||1)*(+lPrice||0))}</span>
                  </div>
                )}
                {lMsg.t && <div style={{ textAlign:"center", marginBottom:12, fontSize:14, color:lMsg.ok?GRN:RED, fontWeight:600 }}>{lMsg.t}</div>}
                <Btn full onClick={logPurch} color={IND}>Save Purchase</Btn>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ══ CALENDAR ══ */}
      {tab==="calendar" && (
        <div style={{ padding:16 }}>
          <MonNav vm={calMon} setVm={setCalMon} CM={CM} />

          {/* shop filter chips */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
            <button onClick={()=>setCalFilt("")} style={{ background:calFilt===""?IND:CARD2, color:calFilt===""?"#fff":MT, border:`1px solid ${calFilt===""?IND:BDR}`, borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>All Shops</button>
            {shops.map(sh=>(
              <button key={sh.id} onClick={()=>setCalFilt(calFilt===sh.id?"":sh.id)} style={{ background:calFilt===sh.id?sh.color:CARD2, color:calFilt===sh.id?"#fff":MT, border:`1px solid ${calFilt===sh.id?sh.color:BDR}`, borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:7, height:7, borderRadius:4, background:calFilt===sh.id?"#fff":sh.color }} />{sh.name}
              </button>
            ))}
          </div>

          {/* calendar grid */}
          <Card style={{ padding:10, overflowX:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
              {DOW.map(d=><div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:MT, padding:"3px 0" }}>{d}</div>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
              {calDays(calMon).map((d,i)=>{
                if(!d) return <div key={"e"+i} style={{ minHeight:44 }} />;
                const ds=padDate(calMon,d), shopDots=getDateShops(ds), isToday=ds===today(), hasPurch=shopDots.length>0;
                return (
                  <div key={d} onClick={()=>openModal(ds)} style={{ borderRadius:8, padding:"4px 1px", textAlign:"center", cursor:"pointer", background:isToday?`${IND}22`:hasPurch?CARD2:"transparent", border:isToday?`1.5px solid ${IND}`:`1px solid ${hasPurch?BDR:"transparent"}`, minHeight:44, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-between", minWidth:0, overflow:"hidden" }}>
                    <span style={{ fontSize:11, fontWeight:isToday?800:500, color:isToday?IND:hasPurch?TXT:MT }}>{d}</span>
                    <div style={{ display:"flex", gap:1, flexWrap:"wrap", justifyContent:"center", minHeight:9 }}>
                      {shopDots.slice(0,3).map(sid=>{ const sh=byShop(sid); return <div key={sid} style={{ width:5, height:5, borderRadius:3, background:sh?sh.color:MT, flexShrink:0 }} />; })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* legend */}
          {shops.length>0 && (
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginTop:10, padding:"0 2px" }}>
              {shops.map(sh=><div key={sh.id} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:MT }}><div style={{ width:8, height:8, borderRadius:4, background:sh.color }} />{sh.name}</div>)}
            </div>
          )}

          {/* frequency stats */}
          <Card style={{ marginTop:14 }}>
            <Row style={{ marginBottom:calStats.items.length>0?14:0 }}>
              <div style={{ fontSize:15, fontWeight:800 }}>Purchase Frequency</div>
              <div style={{ fontSize:12, color:MT }}>{calMon===CM?`${calStats.daysElapsed} of ${calStats.daysInMon} days`:`${calStats.daysInMon} days`}</div>
            </Row>
            {calStats.items.length===0
              ? <div style={{ textAlign:"center", padding:"18px 0", color:MT, fontSize:13 }}>No entries yet for {mLabel(calMon)}.</div>
              : calStats.items.map(({name,shopId,dates})=>{
                  const sh=byShop(shopId), bought=dates.size, missed=Math.max(0,calStats.daysElapsed-bought), pct=calStats.daysElapsed>0?Math.min(100,(bought/calStats.daysElapsed)*100):0;
                  return (
                    <div key={name} style={{ marginBottom:18 }}>
                      <Row style={{ marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {sh&&<div style={{ width:9, height:9, borderRadius:5, background:sh.color }} />}
                          <span style={{ fontSize:14, fontWeight:700 }}>{name}</span>
                          {sh&&<span style={{ fontSize:11, color:MT, background:CARD2, padding:"1px 8px", borderRadius:10 }}>{sh.name}</span>}
                        </div>
                        <span style={{ fontSize:14, fontWeight:800, color:AMB }}>{bought}<span style={{ fontSize:11, fontWeight:400, color:MT }}>/{calStats.daysElapsed}d</span></span>
                      </Row>
                      <div style={{ height:10, borderRadius:10, overflow:"hidden", marginBottom:10, display:"flex", background:BDR }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:sh?sh.color:GRN, borderRadius:"10px 0 0 10px", transition:"width .4s", flexShrink:0 }} />
                        <div style={{ height:"100%", flex:1, background:`${RED}33` }} />
                      </div>
                      <div style={{ display:"flex", overflow:"hidden" }}>
                        <div style={{ flex:1, minWidth:0, background:`${GRN}15`, borderRadius:"10px 0 0 10px", padding:"8px 10px", borderLeft:`3px solid ${GRN}` }}>
                          <div style={{ fontSize:10, color:GRN, fontWeight:800, letterSpacing:1, marginBottom:3 }}>✓ BOUGHT</div>
                          <div style={{ fontSize:22, fontWeight:900, color:GRN, lineHeight:1 }}>{bought}</div>
                          <div style={{ fontSize:10, color:MT, marginTop:2 }}>day{bought!==1?"s":""}</div>
                        </div>
                        <div style={{ flex:1, minWidth:0, background:`${RED}15`, borderRadius:"0 10px 10px 0", padding:"8px 10px", borderLeft:`1px solid ${BDR}`, borderRight:`3px solid ${RED}` }}>
                          <div style={{ fontSize:10, color:RED, fontWeight:800, letterSpacing:1, marginBottom:3 }}>✗ MISSED</div>
                          <div style={{ fontSize:22, fontWeight:900, color:missed>0?RED:MT, lineHeight:1 }}>{missed}</div>
                          <div style={{ fontSize:10, color:MT, marginTop:2 }}>day{missed!==1?"s":""}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
            }
            {calStats.items.length>0 && <div style={{ fontSize:11, color:MT, textAlign:"center", paddingTop:8, borderTop:`1px solid ${BDR}` }}>{calFilt?`Shop: ${byShop(calFilt)?.name||""}`:"All shops"} · tap any date to add/view entries</div>}
          </Card>
        </div>
      )}

      {/* ══ HISTORY ══ */}
      {tab==="history" && (
        <div style={{ padding:16 }}>
          <MonNav vm={vm} setVm={setVm} CM={CM} />
          {sortedDates.length===0
            ? <Card style={{ textAlign:"center", color:MT, fontSize:13 }}>No purchases in {mLabel(vm)}</Card>
            : sortedDates.map(date=>{
                const dp=byDate[date], dt=dp.reduce((a,p)=>a+p.total,0), isOpen=histExp===date;
                return (
                  <Card key={date} style={{ marginBottom:10 }}>
                    <Row onClick={()=>setHistExp(isOpen?"":date)} style={{ cursor:"pointer" }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700 }}>{dLabel(date)}</div>
                        <div style={{ fontSize:12, color:MT, marginTop:3 }}>{dp.length} item{dp.length!==1?"s":""}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:AMB }}>{fmt(dt)}</div>
                        <div style={{ color:MT, fontSize:20, transform:isOpen?"rotate(180deg)":"none", transition:"transform .2s" }}>▾</div>
                      </div>
                    </Row>
                    {isOpen && (
                      <div style={{ marginTop:12 }}>
                        {dp.map(p=>{
                          const sh=byShop(p.shopId);
                          return (
                            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderTop:`1px solid ${BDR}` }}>
                              <Dot color={sh?.color||MT} />
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:14, fontWeight:600 }}>{p.itemName}</div>
                                <div style={{ fontSize:12, color:MT }}>{sh?.name} · {p.qty}×{fmt(p.price)}</div>
                              </div>
                              <div style={{ fontSize:15, fontWeight:700 }}>{fmt(p.total)}</div>
                              <button onClick={()=>delPurch(p.date.slice(0,7),p.id)} style={{ background:"none", border:"none", color:RED, cursor:"pointer", fontSize:18, padding:"0 4px" }}>×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })
          }
          {vmP.length>0 && (
            <Card style={{ background:CARD2, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:MT, fontSize:14 }}>Month Total</span>
              <span style={{ fontSize:20, fontWeight:800 }}>{fmt(vmP.reduce((a,p)=>a+p.total,0))}</span>
            </Card>
          )}
        </div>
      )}

      {/* ══ SUMMARY ══ */}
      {tab==="summary" && (
        <div style={{ padding:16 }}>
          <MonNav vm={vm} setVm={setVm} CM={CM} />
          {shops.length===0
            ? <Card style={{ textAlign:"center", color:MT, fontSize:13 }}>Add shops in Settings first.</Card>
            : shops.map(sh=>{
                const tot=sTot(sh.id,vm), paid=sPaid(sh.id,vm), owed=sOwed(sh.id,vm);
                const isOpen=summExp===sh.id, shP=vmP.filter(p=>p.shopId===sh.id), shBD={};
                shP.forEach(p=>{ if(!shBD[p.date]) shBD[p.date]=[]; shBD[p.date].push(p); });
                const shDates=Object.keys(shBD).sort().reverse();
                return (
                  <Card key={sh.id} style={{ marginBottom:14 }}>
                    <Row style={{ marginBottom:14, cursor:"pointer" }} onClick={()=>setSummExp(isOpen?"":sh.id)}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:14, height:14, borderRadius:7, background:sh.color }} />
                        <div style={{ fontSize:18, fontWeight:800 }}>{sh.name}</div>
                      </div>
                      <div style={{ fontSize:22, color:MT }}>{isOpen?"▴":"▾"}</div>
                    </Row>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
                      {[["Total",fmt(tot),TXT],["Paid",fmt(paid),GRN],["Owed",fmt(owed),owed>0?RED:GRN]].map(([l,v,c])=>(
                        <div key={l} style={{ background:CARD2, borderRadius:12, padding:"12px 8px", textAlign:"center" }}>
                          <div style={{ fontSize:11, color:MT, marginBottom:5 }}>{l}</div>
                          <div style={{ fontSize:15, fontWeight:800, color:c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {tot>0 && <div style={{ height:6, background:BDR, borderRadius:6, marginBottom:14, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(100,(paid/tot)*100)}%`, background:GRN, borderRadius:6 }} /></div>}
                    {owed>0 && (
                      <div style={{ display:"flex", gap:8, marginBottom:isOpen?14:0 }}>
                        <Inp value={summPay[sh.id]||""} onChange={v=>setSummPay(p=>({...p,[sh.id]:v}))} placeholder={`Payment amount (max ${fmt(owed)})`} type="number" />
                        <Btn sm color={GRN} onClick={()=>{const a=Math.min(+(summPay[sh.id]||0),owed); if(a>0) markPaid(vm,sh.id,a);}}>Pay</Btn>
                      </div>
                    )}
                    {owed===0&&tot>0 && <div style={{ textAlign:"center", color:GRN, fontSize:14, fontWeight:700, marginBottom:isOpen?14:0 }}>✓ Fully Paid!</div>}
                    {isOpen && (
                      <div>
                        <Divider />
                        <div style={{ fontSize:12, color:MT, letterSpacing:.8, textTransform:"uppercase", fontWeight:700, marginBottom:10 }}>Day by Day</div>
                        {shDates.length===0
                          ? <div style={{ color:MT, fontSize:13, textAlign:"center" }}>No entries this month</div>
                          : shDates.map(date=>(
                              <div key={date} style={{ marginBottom:12 }}>
                                <Row style={{ marginBottom:6 }}>
                                  <div style={{ fontSize:13, fontWeight:700, color:MT }}>{dLabel(date)}</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:AMB }}>{fmt(shBD[date].reduce((a,p)=>a+p.total,0))}</div>
                                </Row>
                                {shBD[date].map(p=>(
                                  <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0 5px 14px", borderLeft:`2px solid ${sh.color}55` }}>
                                    <span style={{ fontSize:13, color:TXT }}>{p.itemName} <span style={{ color:MT }}>×{p.qty}</span></span>
                                    <span style={{ fontSize:13, color:MT }}>{fmt(p.total)}</span>
                                  </div>
                                ))}
                              </div>
                            ))
                        }
                        {paid>0 && <div><Divider /><Row><span style={{ fontSize:13, color:GRN }}>Paid so far: {fmt(paid)}</span><Btn sm outline danger onClick={()=>resetPaid(vm,sh.id)}>Reset</Btn></Row></div>}
                      </div>
                    )}
                  </Card>
                );
              })
          }
          {shops.length>0 && (
            <Card style={{ background:CARD2 }}>
              <Row><span style={{ color:MT, fontSize:14 }}>Month Grand Total</span><span style={{ fontSize:21, fontWeight:800 }}>{fmt(vmP.reduce((a,p)=>a+p.total,0))}</span></Row>
              <Row style={{ marginTop:6 }}><span style={{ color:MT, fontSize:13 }}>Still Owed</span><span style={{ fontSize:17, fontWeight:700, color:RED }}>{fmt(shops.reduce((a,s)=>a+sOwed(s.id,vm),0))}</span></Row>
              <div style={{ marginTop:14, borderTop:`1px solid ${BDR}`, paddingTop:14 }}>
                <Btn full sm outline onClick={shareMonth} color={IND}>📤 Share Monthly Summary</Btn>
                {shareMsg && <div style={{ textAlign:"center", marginTop:8, fontSize:13, color:GRN, fontWeight:600 }}>{shareMsg}</div>}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ══ SETTINGS ══ */}
      {tab==="settings" && (
        <div style={{ padding:16 }}>

          {/* account card */}
          <Card style={{ marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:14 }}>Account</div>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
              {user.photoURL
                ? <img src={user.photoURL} alt="avatar" style={{ width:52, height:52, borderRadius:26, border:`2px solid ${IND}` }} />
                : <div style={{ width:52, height:52, borderRadius:26, background:IND, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, color:"#fff" }}>
                    {(user.displayName||user.email||"?")[0].toUpperCase()}
                  </div>
              }
              <div>
                {user.displayName && <div style={{ fontSize:16, fontWeight:700 }}>{user.displayName}</div>}
                <div style={{ fontSize:13, color:MT }}>{user.email}</div>
                <div style={{ fontSize:11, color:MT, marginTop:2 }}>☁️ Data synced to cloud</div>
              </div>
            </div>
            <Btn full outline danger onClick={()=>signOut(auth)}>Sign Out</Btn>
          </Card>

          {/* theme */}
          <Card style={{ marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:14 }}>App Theme</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[{id:"light",icon:"☀️",label:"Light"},{id:"dark",icon:"🌙",label:"Dark"},{id:"system",icon:"📱",label:"System"}].map(opt=>(
                <button key={opt.id} onClick={()=>setTheme(opt.id)} style={{ background:theme===opt.id?IND:CARD2, color:theme===opt.id?"#fff":TXT, border:`1.5px solid ${theme===opt.id?IND:BDR}`, borderRadius:12, padding:"14px 8px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:24 }}>{opt.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700 }}>{opt.label}</span>
                  {theme===opt.id && <span style={{ fontSize:10, opacity:.8 }}>✓ Active</span>}
                </button>
              ))}
            </div>
            <div style={{ fontSize:12, color:MT, marginTop:12, textAlign:"center" }}>
              {theme==="system"?"Following your device setting":theme==="dark"?"Dark mode always on":"Light mode always on"}
            </div>
          </Card>

          {/* currency */}
          <Card style={{ marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:14 }}>Currency Symbol</div>
            <div style={{ display:"flex", gap:8, marginBottom:savedCurrs.length>0?14:0 }}>
              <Inp value={currInp} onChange={setCurrInp} placeholder="Type any symbol e.g. Rs. $ € £" />
              <Btn sm onClick={()=>{const s=(currInp||"").trim(); if(s) applyCurrency(s);}} color={IND}>Save</Btn>
            </div>
            {savedCurrs.length>0 && (
              <div>
                <div style={{ fontSize:11, color:MT, letterSpacing:1, fontWeight:700, marginBottom:8 }}>SAVED — TAP TO SET</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {savedCurrs.map(c=>(
                    <button key={c} onClick={()=>{setCurrInp(c);applyCurrency(c);}} style={{ background:currency===c?IND:CARD2, color:currency===c?"#fff":TXT, border:`1.5px solid ${currency===c?IND:BDR}`, borderRadius:10, padding:"7px 16px", fontSize:16, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
                      {c}{currency===c&&<span style={{ fontSize:10, opacity:.8 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop:12, fontSize:13, color:MT }}>Active: <span style={{ color:AMB, fontWeight:800, fontSize:16 }}>{currency}</span></div>
          </Card>

          {/* shops */}
          <Card style={{ marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:16 }}>Manage Shops</div>
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <Inp value={nsName} onChange={setNsName} placeholder="Shop name e.g. Ramesh Dairy" />
              <Btn sm onClick={addShop} color={IND}>Add</Btn>
            </div>
            {shops.length===0 && <div style={{ color:MT, fontSize:13, textAlign:"center" }}>No shops yet</div>}
            {shops.map(sh=>(
              <div key={sh.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderTop:`1px solid ${BDR}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Dot color={sh.color} />
                  <div>
                    <div style={{ fontWeight:600, fontSize:15 }}>{sh.name}</div>
                    <div style={{ fontSize:12, color:MT }}>{byShopIt(sh.id).length} catalog items</div>
                  </div>
                </div>
                <button onClick={()=>delShop(sh.id)} style={{ background:"none", border:"none", color:RED, cursor:"pointer", fontSize:20, padding:"0 6px" }}>×</button>
              </div>
            ))}
          </Card>

          {/* items */}
          {shops.length>0 && (
            <Card>
              <div style={{ fontSize:17, fontWeight:800, marginBottom:16 }}>Item Catalog</div>
              <Lbl>Shop</Lbl>
              <Sel value={niShop} onChange={setNiShop} style={{ marginBottom:10 }}>
                {shops.map(sh=><option key={sh.id} value={sh.id}>{sh.name}</option>)}
              </Sel>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                <div><Lbl>Item name</Lbl><Inp value={niName} onChange={setNiName} placeholder="e.g. Milk" /></div>
                <div><Lbl>Price {currency}</Lbl><Inp value={niPrice} onChange={setNiPrice} placeholder="0" type="number" /></div>
              </div>
              <Btn full sm onClick={addItem} color={IND}>＋ Add to Catalog</Btn>
              {shops.map(sh=>{
                const si=byShopIt(sh.id); if(!si.length) return null;
                return (
                  <div key={sh.id} style={{ marginTop:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <Dot color={sh.color} />
                      <div style={{ fontSize:12, color:MT, letterSpacing:1, textTransform:"uppercase", fontWeight:700 }}>{sh.name}</div>
                    </div>
                    {si.map(it=>(
                      <div key={it.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 0", borderTop:`1px solid ${BDR}` }}>
                        <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{it.name}</div>
                        {editP[it.id]!==undefined
                          ? <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                              <Inp value={editP[it.id]} onChange={v=>setEditP(p=>({...p,[it.id]:v}))} type="number" style={{ width:80, textAlign:"center", padding:"6px 8px", fontSize:13 }} />
                              <Btn sm color={GRN} onClick={()=>updPrice(it.id,editP[it.id])}>✓</Btn>
                            </div>
                          : <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                              <span style={{ fontSize:15, color:AMB, fontWeight:700 }}>{fmt(it.price)}</span>
                              <button onClick={()=>setEditP(p=>({...p,[it.id]:String(it.price)}))} style={{ background:"none", border:`1px solid ${BDR}`, borderRadius:7, color:MT, cursor:"pointer", padding:"4px 10px", fontSize:12 }}>Edit</button>
                            </div>
                        }
                        <button onClick={()=>delItem(it.id)} style={{ background:"none", border:"none", color:RED, cursor:"pointer", fontSize:18 }}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* ══ CALENDAR MODAL ══ */}
      {modal.open && (
        <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.72)" }} onClick={()=>setModal({open:false,date:""})} />
          <div style={{ position:"relative", background:CARD, borderRadius:"20px 20px 0 0", maxHeight:"88vh", overflowY:"auto" }}>
            <div style={{ padding:"16px 18px 12px", borderBottom:`1px solid ${BDR}`, display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:CARD, zIndex:1 }}>
              <div>
                <div style={{ fontSize:17, fontWeight:800 }}>{modal.date?dLabel(modal.date):""}</div>
                <div style={{ fontSize:12, color:MT, marginTop:2 }}>
                  {modalPurch.length>0
                    ? `${modalPurch.length} item${modalPurch.length!==1?"s":""} · ${fmt(modalPurch.reduce((a,p)=>a+p.total,0))}`
                    : "Tap ＋ below to add purchases"}
                </div>
              </div>
              <button onClick={()=>setModal({open:false,date:""})} style={{ background:"none", border:`1px solid ${BDR}`, borderRadius:8, color:MT, cursor:"pointer", fontSize:16, padding:"5px 12px" }}>✕</button>
            </div>
            <div style={{ padding:"0 16px 32px" }}>
              {modalPurch.length===0
                ? <div style={{ color:MT, fontSize:13, textAlign:"center", padding:"18px 0 8px" }}>No entries for this date</div>
                : <div style={{ paddingTop:12 }}>
                    {modalPurch.map(p=>{
                      const sh=byShop(p.shopId);
                      return (
                        <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:`1px solid ${BDR}` }}>
                          <Dot color={sh?.color||MT} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:600 }}>{p.itemName}</div>
                            <div style={{ fontSize:12, color:MT }}>{sh?.name} · {p.qty}×{fmt(p.price)}</div>
                          </div>
                          <div style={{ fontSize:14, fontWeight:700, color:AMB }}>{fmt(p.total)}</div>
                          <button onClick={()=>delPurch(modal.date.slice(0,7),p.id)} style={{ background:"none", border:"none", color:RED, cursor:"pointer", fontSize:18 }}>×</button>
                        </div>
                      );
                    })}
                    <div style={{ display:"flex", justifyContent:"flex-end", padding:"8px 0" }}>
                      <span style={{ fontSize:14, fontWeight:700, color:AMB }}>Day total: {fmt(modalPurch.reduce((a,p)=>a+p.total,0))}</span>
                    </div>
                  </div>
              }
              <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${BDR}` }}>
                <div onClick={()=>setModalShowAdd(v=>!v)} style={{ fontSize:15, fontWeight:700, marginBottom:modalShowAdd?14:0, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span>＋ Add Entry</span>
                  <span style={{ fontSize:18, color:MT, transform:modalShowAdd?"rotate(180deg)":"none", transition:"transform .2s", display:"inline-block" }}>▾</span>
                </div>
                {modalShowAdd && <>
                <Lbl>Shop</Lbl>
                <Sel value={mShop} onChange={v=>{setMShop(v);setMItem("");setMPrice("");}} style={{ marginBottom:12 }}>
                  <option value="">Select shop…</option>
                  {shops.map(sh=><option key={sh.id} value={sh.id}>{sh.name}</option>)}
                </Sel>
                {mShop && (
                  <div>
                    <Lbl>Item</Lbl>
                    <Sel value={mItem} onChange={id=>pickItem(id,setMItem,setMPrice)} style={{ marginBottom:8 }}>
                      <option value="">— Custom / type below —</option>
                      {byShopIt(mShop).map(it=><option key={it.id} value={it.id}>{it.name} ({fmt(it.price)})</option>)}
                    </Sel>
                    {!mItem && <Inp value={mName} onChange={setMName} placeholder="Item name…" style={{ marginBottom:12 }} />}
                    {mItem  && <div style={{ height:12 }} />}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                      <div><Lbl>Qty</Lbl><Inp value={mQty}   onChange={setMQty}   type="number" placeholder="1"    style={{ textAlign:"center" }} /></div>
                      <div><Lbl>Price {currency}</Lbl><Inp value={mPrice} onChange={setMPrice} type="number" placeholder="0.00" /></div>
                    </div>
                    {(+mQty||1)*(+mPrice||0)>0 && (
                      <div style={{ background:CARD2, borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ color:MT, fontSize:13 }}>Total</span>
                        <span style={{ fontSize:18, fontWeight:800, color:AMB }}>{fmt((+mQty||1)*(+mPrice||0))}</span>
                      </div>
                    )}
                    {mMsg.t && <div style={{ textAlign:"center", marginBottom:10, fontSize:14, color:mMsg.ok?GRN:RED, fontWeight:600 }}>{mMsg.t}</div>}
                    <Btn full onClick={modalSave} color={IND}>Save Entry</Btn>
                  </div>
                )}
                {shops.length===0 && <div style={{ color:MT, fontSize:13, textAlign:"center" }}>Add shops in Settings first.</div>}
                </>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── undo toast ── */}
      {undoQueue.length > 0 && (() => {
        const u = undoQueue[undoQueue.length - 1];
        return (
          <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 32px)", maxWidth:448, background:CARD, border:`1px solid ${BDR}`, borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:300, boxShadow:"0 4px 24px rgba(0,0,0,0.35)" }}>
            <span style={{ fontSize:14, color:TXT }}>Deleted <b style={{ color:RED }}>{u.entry.itemName}</b></span>
            <button onClick={()=>undoDel(u)} style={{ background:IND, border:"none", borderRadius:8, color:"#fff", padding:"6px 18px", fontSize:13, fontWeight:700, cursor:"pointer" }}>Undo</button>
          </div>
        );
      })()}

      {/* ── bottom nav ── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:CARD, borderTop:`1px solid ${BDR}`, display:"flex", zIndex:100, boxSizing:"border-box" }}>
        {NAV.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"8px 0 6px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:tab===t.id?IND:MT, borderTop:`2px solid ${tab===t.id?IND:"transparent"}` }}>
            <span style={{ fontSize:t.id==="log"?20:17 }}>{t.icon}</span>
            <span style={{ fontSize:9, fontWeight:tab===t.id?700:400 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROOT  —  handles auth state, shows Login or App
──────────────────────────────────────────────────────────────── */
export default function Root() {
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) {
    return (
      <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:28, fontWeight:900, background:"linear-gradient(90deg,#a78bfa,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:12 }}>DailyTab</div>
          <div style={{ color:MT, fontSize:14 }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <App key={user.uid} user={user} />;
}
