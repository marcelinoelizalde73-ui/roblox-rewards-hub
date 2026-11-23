
require("dotenv").config();
const express=require("express"), session=require("express-session"), bcrypt=require("bcryptjs");
const Database=require("better-sqlite3"), helmet=require("helmet"), rateLimit=require("express-rate-limit");
const crypto=require("crypto"), path=require("path");
const app=express(), db=new Database("rewards.db"), PORT=Number(process.env.PORT||3000);
const GAME_SECRET=process.env.ROBLOX_GAME_SECRET||"", ADMIN_EMAIL=(process.env.ADMIN_EMAIL||"admin@example.com").toLowerCase();
app.use(helmet({contentSecurityPolicy:false})); app.use(express.json({limit:"20kb"}));
app.use(session({name:"rewards.sid",secret:process.env.SESSION_SECRET||"unsafe-dev-secret",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:604800000}}));
app.use(express.static(path.join(__dirname,"public")));
app.use("/api",rateLimit({windowMs:60000,limit:100}));
db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,points INTEGER NOT NULL DEFAULT 0,roblox_user_id TEXT UNIQUE,roblox_username TEXT,is_admin INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS link_codes(code TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,delta INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rewards(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT DEFAULT '',cost INTEGER NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS redemptions(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,reward_id INTEGER NOT NULL,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
if(db.prepare("SELECT COUNT(*) n FROM rewards").get().n===0){
 const q=db.prepare("INSERT INTO rewards(title,description,cost) VALUES(?,?,?)");
 q.run("Título exclusivo","Título especial dentro de tu experiencia",500);
 q.run("Accesorio especial","Cosmético dentro de tu experiencia",1200);
 q.run("Paquete VIP temporal","Beneficio dentro del juego",2500);
}
if(process.env.ADMIN_PASSWORD && !db.prepare("SELECT id FROM users WHERE email=?").get(ADMIN_EMAIL)){
 db.prepare("INSERT INTO users(email,password_hash,is_admin) VALUES(?,?,1)").run(ADMIN_EMAIL,bcrypt.hashSync(process.env.ADMIN_PASSWORD,12));
}
const email=s=>String(s||"").trim().toLowerCase();
function user(req){return req.session.uid?db.prepare("SELECT id,email,points,roblox_user_id,roblox_username,is_admin FROM users WHERE id=?").get(req.session.uid):null}
function auth(req,res,next){req.u=user(req);if(!req.u)return res.status(401).json({error:"Inicia sesión."});next()}
function admin(req,res,next){if(!req.u.is_admin)return res.status(403).json({error:"Solo administrador."});next()}
function gameAuth(req,res,next){const a=Buffer.from(req.get("x-game-secret")||""),b=Buffer.from(GAME_SECRET);if(!GAME_SECRET||a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:"Credencial de juego inválida."});next()}
function points(uid,delta,reason,ref){
 const tx=db.transaction(()=>{const u=db.prepare("SELECT points FROM users WHERE id=?").get(uid);if(!u)throw Error("Usuario inexistente");if(ref&&db.prepare("SELECT id FROM ledger WHERE reference=?").get(ref))return {duplicate:true,points:u.points};if(u.points+delta<0)throw Error("Puntos insuficientes");db.prepare("UPDATE users SET points=points+? WHERE id=?").run(delta,uid);db.prepare("INSERT INTO ledger(user_id,delta,reason,reference) VALUES(?,?,?,?)").run(uid,delta,reason,ref||null);return {points:u.points+delta};});return tx();
}
app.post("/api/register",async(req,res)=>{const e=email(req.body.email),p=String(req.body.password||"");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||p.length<10)return res.status(400).json({error:"Correo válido y contraseña de al menos 10 caracteres."});try{const r=db.prepare("INSERT INTO users(email,password_hash) VALUES(?,?)").run(e,await bcrypt.hash(p,12));req.session.uid=r.lastInsertRowid;res.json({ok:true})}catch{res.status(409).json({error:"Ese correo ya está registrado."})}});
app.post("/api/login",async(req,res)=>{const u=db.prepare("SELECT id,password_hash FROM users WHERE email=?").get(email(req.body.email));if(!u||!(await bcrypt.compare(String(req.body.password||""),u.password_hash)))return res.status(401).json({error:"Correo o contraseña incorrectos."});req.session.uid=u.id;res.json({ok:true})});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,(req,res)=>res.json({user:req.u}));
app.post("/api/link-code",auth,(req,res)=>{const code=crypto.randomBytes(4).toString("hex").toUpperCase();db.prepare("DELETE FROM link_codes WHERE user_id=?").run(req.u.id);db.prepare("INSERT INTO link_codes VALUES(?,?,?)").run(code,req.u.id,Date.now()+600000);res.json({code,expiresInMinutes:10})});
app.post("/api/game/link",gameAuth,(req,res)=>{const code=String(req.body.code||"").toUpperCase(),rid=String(req.body.robloxUserId||"");if(!/^\d{1,20}$/.test(rid))return res.status(400).json({error:"ID inválido"});const c=db.prepare("SELECT user_id FROM link_codes WHERE code=? AND expires_at>?").get(code,Date.now());if(!c)return res.status(400).json({error:"Código vencido o incorrecto"});try{db.prepare("UPDATE users SET roblox_user_id=?,roblox_username=? WHERE id=?").run(rid,String(req.body.username||"").slice(0,50),c.user_id);db.prepare("DELETE FROM link_codes WHERE code=?").run(code);res.json({ok:true})}catch{res.status(409).json({error:"Cuenta Roblox ya vinculada"})}});
app.post("/api/game/award",gameAuth,(req,res)=>{const rid=String(req.body.robloxUserId||""),n=Number(req.body.points),ref=String(req.body.reference||"");if(!/^\d{1,20}$/.test(rid)||!Number.isInteger(n)||n<1||n>100||!/^[A-Za-z0-9_:. -]{8,100}$/.test(ref))return res.status(400).json({error:"Recompensa inválida"});const u=db.prepare("SELECT id FROM users WHERE roblox_user_id=?").get(rid);if(!u)return res.status(404).json({error:"Cuenta no vinculada"});try{res.json({ok:true,...points(u.id,n,String(req.body.reason||"Misión completada").slice(0,100),ref)})}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/rewards",auth,(req,res)=>res.json({rewards:db.prepare("SELECT id,title,description,cost FROM rewards WHERE active=1 ORDER BY cost").all()}));
app.post("/api/redeem",auth,(req,res)=>{const id=Number(req.body.rewardId);try{const tx=db.transaction(()=>{const r=db.prepare("SELECT * FROM rewards WHERE id=? AND active=1").get(id);if(!r)throw Error("Premio no disponible");points(req.u.id,-r.cost,"Canje: "+r.title,"redeem_"+crypto.randomUUID());return db.prepare("INSERT INTO redemptions(user_id,reward_id) VALUES(?,?)").run(req.u.id,id).lastInsertRowid});res.json({ok:true,id:tx()})}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/history",auth,(req,res)=>res.json({ledger:db.prepare("SELECT delta,reason,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.u.id),redemptions:db.prepare("SELECT r.id,r.status,w.title FROM redemptions r JOIN rewards w ON w.id=r.reward_id WHERE r.user_id=? ORDER BY r.id DESC").all(req.u.id)}));
app.get("/api/admin",auth,admin,(req,res)=>res.json({users:db.prepare("SELECT email,roblox_username,points FROM users WHERE is_admin=0 ORDER BY id DESC LIMIT 100").all(),redemptions:db.prepare("SELECT r.id,r.status,u.email,w.title,w.cost FROM redemptions r JOIN users u ON u.id=r.user_id JOIN rewards w ON w.id=r.reward_id ORDER BY r.id DESC LIMIT 100").all(),counts:{users:db.prepare("SELECT COUNT(*) n FROM users WHERE is_admin=0").get().n,pending:db.prepare("SELECT COUNT(*) n FROM redemptions WHERE status='pending'").get().n}}));
app.post("/api/admin/redemption/:id",auth,admin,(req,res)=>{const s=req.body.status;if(!["approved","rejected"].includes(s))return res.status(400).json({error:"Estado inválido"});try{db.transaction(()=>{const r=db.prepare("SELECT * FROM redemptions WHERE id=? AND status='pending'").get(Number(req.params.id));if(!r)throw Error("Solicitud no pendiente");if(s==="rejected"){const w=db.prepare("SELECT cost,title FROM rewards WHERE id=?").get(r.reward_id);points(r.user_id,w.cost,"Reembolso: "+w.title,"refund_"+r.id)}db.prepare("UPDATE redemptions SET status=? WHERE id=?").run(s,r.id)})();res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/admin/reward",auth,admin,(req,res)=>{const t=String(req.body.title||"").trim(),d=String(req.body.description||""),c=Number(req.body.cost);if(!t||!Number.isInteger(c)||c<1)return res.status(400).json({error:"Nombre y costo válidos requeridos"});db.prepare("INSERT INTO rewards(title,description,cost) VALUES(?,?,?)").run(t,d.slice(0,250),c);res.json({ok:true})});
app.listen(PORT,()=>console.log("Rewards Hub: http://localhost:"+PORT));
