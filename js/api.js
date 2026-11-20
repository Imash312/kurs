// Маалымат катмары: Supabase (чыныгы) же Демо (localStorage).
(function () {
  const C = window.KURS_CONFIG || {};
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);

  const GROUPS = { gov: "Мамлекеттик кызматчы", teacher: "Мугалим", student: "Студент", other: "Башка" };
  const STATUS = { pending: "Күтүүдө", approved: "Бекитилди", rejected: "Четке кагылды" };

  const SEED_LESSONS = [
    ["Компьютер, файлдар жана папкалар", "Иш папкаларын тартипке келтирүү, кыргыз тамгалары (ң, ө, ү)"],
    ["Интернет жана электрондук почта", "Туура издөө, тиркемеси бар расмий кат жөнөтүү"],
    ["Google Drive жана булут", "Документти кесиптеш менен бөлүшүү, бирге түзөтүү"],
    ["Word 1: форматтоо жана таблица", "Стилдер, тизмелер, таблица, арыз жазуу"],
    ["Word 2: расмий документтер", "Шаблондор, бет номери, PDF, резюме"],
    ["Excel 1: таблица жана формулалар", "СУММ, СРЗНАЧ, журнал же бюджет"],
    ["Excel 2: сорттоо, фильтр, диаграмма", "Отчет даярдоо"],
    ["PowerPoint: презентация", "Слайд, дизайн, анимация, сунуштоо"],
    ["ChatGPT 1: туура суроо берүү", "Промпт жазуу, кат, план, текст"],
    ["ChatGPT 2: Office үчүн AI", "AI менен отчет, сабак планы, слайддар"],
    ["Алдамчылыктан сактануу", "Фишинг, жалган чалуулар, сырсөз, 2FA"],
    ["Мамлекеттик онлайн-кызматтар + долбоор", "Түндүк, Санарип Аймак, акыркы долбоор, сертификат"],
  ];

  // Телефон номерин же почтаны кирүү логинине айлантат.
  // Телефон менен катталгандарга ички «почта» түзүлөт: 996700123456@tel.imran-kurs.kg
  const PHONE_DOMAIN = "tel.imran-kurs.kg";
  function toLogin(input) {
    const v = String(input || "").trim().toLowerCase();
    if (v.includes("@")) return v;
    let d = v.replace(/\D/g, "");
    if (d.length === 10 && d.startsWith("0")) d = "996" + d.slice(1);
    else if (d.length === 9) d = "996" + d;
    if (!(d.length === 12 && d.startsWith("996"))) throw new Error("Телефон номерин туура жазыңыз, мисалы: 0700 123 456");
    return d + "@" + PHONE_DOMAIN;
  }
  const loginLabel = login => {
    if (!login) return "";
    if (!login.endsWith("@" + PHONE_DOMAIN)) return login;
    const d = login.split("@")[0];
    return d.length === 12 ? `+${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9)}` : "+" + d;
  };

  // ---------- ДЕМО ----------
  const KEY = "kurs_demo_db_v2";
  const uid = () => Math.random().toString(36).slice(2, 10);
  function load() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!db) {
      const base = new Date(); base.setHours(19, 0, 0, 0);
      db = {
        session: null,
        users: [
          { id: "admin", email: "admin@demo.kg", password: "admin123",
            profile: { full_name: "Ыманалы Н. (демо)", phone: "", grp: "other", status: "approved", role: "admin", created_at: new Date().toISOString() } },
          { id: "u1", email: "996700111222@tel.imran-kurs.kg", password: "123456",
            profile: { full_name: "Айбек Токтогулов", phone: "+996 700 111 222", login: "996700111222@tel.imran-kurs.kg", grp: "teacher", status: "pending", role: "student", created_at: new Date().toISOString() } },
        ],
        lessons: SEED_LESSONS.map((l, i) => {
          const d = new Date(base); d.setDate(d.getDate() + Math.floor(i / 2) * 7 + (i % 2) * 3 + 1);
          return { id: "l" + (i + 1), n: i + 1, title: l[0], description: l[1], starts_at: d.toISOString(),
            zoom_url: "https://chat.whatsapp.com/", video_url: "", materials_url: "", homework: "" };
        }),
        submissions: [],
        settings: { wa_group: "https://chat.whatsapp.com/" },
      };
      save(db);
    }
    return db;
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  const demo = {
    async signUp({ email, password, full_name, phone, grp }) {
      const db = load(); const login = toLogin(phone);
      if (db.users.some(u => u.email === login)) throw new Error("Бул номер мурун катталган. «Кирүү» өтмөгүнөн кириңиз.");
      db.users.push({ id: uid(), email: login, password,
        profile: { full_name, phone, grp, contact_email: email || "", login, status: "pending", role: "student", created_at: new Date().toISOString() } });
      db.session = db.users[db.users.length - 1].id;
      save(db);
    },
    async signIn(email, password) {
      const db = load();
      const login = toLogin(email);
      const u = db.users.find(u => u.email === login && u.password === password);
      if (!u) throw new Error("Логин же сырсөз туура эмес.");
      db.session = u.id; save(db);
    },
    async signOut() { const db = load(); db.session = null; save(db); },
    async me() {
      const db = load(); const u = db.users.find(u => u.id === db.session);
      return u ? { id: u.id, email: u.email, ...u.profile } : null;
    },
    async listProfiles() {
      return load().users.map(u => ({ id: u.id, email: u.email, ...u.profile }));
    },
    async setStatus(id, status) { const db = load(); const u = db.users.find(u => u.id === id); u.profile.status = status; save(db); },
    async setPassword(id, pw) { const db = load(); db.users.find(u => u.id === id).password = pw; save(db); },
    async deleteUser(id) { const db = load(); if ((db.users.find(u => u.id === id) || {}).profile?.role === "admin") throw new Error("Окутуучунун аккаунтун өчүрүүгө болбойт"); db.users = db.users.filter(u => u.id !== id); db.submissions = db.submissions.filter(s => s.user_id !== id); save(db); },
    async listLessons() { return load().lessons.slice().sort((a, b) => a.n - b.n); },
    async saveLesson(l) {
      const db = load();
      if (l.id) Object.assign(db.lessons.find(x => x.id === l.id), l);
      else db.lessons.push({ ...l, id: uid() });
      save(db);
    },
    async deleteLesson(id) { const db = load(); db.lessons = db.lessons.filter(l => l.id !== id); save(db); },
    async getSetting(key) { return ((load().settings) || {})[key] || ""; },
    async setSetting(key, value) { const db = load(); db.settings = db.settings || {}; db.settings[key] = value; save(db); },
    async submitHomework(lesson_id, text, link) {
      const db = load();
      db.submissions.push({ id: uid(), lesson_id, user_id: db.session, text, link, grade: "", comment: "", created_at: new Date().toISOString() });
      save(db);
    },
    async mySubmissions() { const db = load(); return db.submissions.filter(s => s.user_id === db.session); },
    async allSubmissions() {
      const db = load();
      return db.submissions.map(s => { const u = db.users.find(u => u.id === s.user_id); return { ...s, full_name: u ? u.profile.full_name : "?" }; });
    },
    async gradeSubmission(id, grade, comment) { const db = load(); Object.assign(db.submissions.find(s => s.id === id), { grade, comment }); save(db); },
    async resetDemo() { localStorage.removeItem(KEY); },
  };

  // ---------- SUPABASE ----------
  let sb = null;
  const live = {
    client() { if (!sb) sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY); return sb; },
    async signUp({ email, password, full_name, phone, grp }) {
      const login = toLogin(phone);
      const { error } = await this.client().auth.signUp({ email: login, password, options: { data: { full_name, phone, grp, contact_email: email || "" }, emailRedirectTo: new URL("login.html", location.href).href } });
      if (error) throw new Error(tr(error.message));
    },
    async signIn(email, password) {
      const { error } = await this.client().auth.signInWithPassword({ email: toLogin(email), password });
      if (error) throw new Error(tr(error.message));
    },
    async signOut() { await this.client().auth.signOut(); },
    async me() {
      const { data: { session } } = await this.client().auth.getSession();
      if (!session) return null;
      const { data, error } = await this.client().from("profiles").select("*").eq("id", session.user.id).single();
      if (error) return { id: session.user.id, email: session.user.email, status: "pending", role: "student" };
      return { ...data, email: session.user.email };
    },
    async listProfiles() { return q(this.client().from("profiles").select("*").order("created_at", { ascending: false })); },
    async setStatus(id, status) { await q(this.client().from("profiles").update({ status }).eq("id", id)); },
    async setPassword(id, pw) { await q(this.client().rpc("admin_set_password", { target: id, new_password: pw })); },
    async deleteUser(id) { await q(this.client().rpc("admin_delete_user", { target: id })); },
    async listLessons() { return q(this.client().from("lessons").select("*").order("n")); },
    async saveLesson(l) {
      const row = { ...l }; if (!row.id) delete row.id;
      await q(this.client().from("lessons").upsert(row));
    },
    async deleteLesson(id) { await q(this.client().from("lessons").delete().eq("id", id)); },
    async getSetting(key) { const rows = await q(this.client().from("settings").select("value").eq("key", key)); return rows[0] ? rows[0].value || "" : ""; },
    async setSetting(key, value) { await q(this.client().from("settings").upsert({ key, value })); },
    async submitHomework(lesson_id, text, link) {
      const { data: { session } } = await this.client().auth.getSession();
      await q(this.client().from("submissions").insert({ lesson_id, user_id: session.user.id, text, link }));
    },
    async mySubmissions() { return q(this.client().from("submissions").select("*").order("created_at", { ascending: false })); },
    async allSubmissions() {
      const rows = await q(this.client().from("submissions").select("*, profiles(full_name)").order("created_at", { ascending: false }));
      return rows.map(r => ({ ...r, full_name: r.profiles ? r.profiles.full_name : "?" }));
    },
    async gradeSubmission(id, grade, comment) { await q(this.client().from("submissions").update({ grade, comment }).eq("id", id)); },
  };
  async function q(p) { const { data, error } = await p; if (error) throw new Error(tr(error.message)); return data || []; }
  function tr(m) {
    if (/Invalid login/i.test(m)) return "Логин же сырсөз туура эмес.";
    if (/Email not confirmed/i.test(m)) return "Алгач почтаңызга келген катты ачып, каттоону ырастаңыз.";
    if (/already registered/i.test(m)) return "Бул номер же почта мурун катталган. «Кирүү» өтмөгүнөн кириңиз.";
    if (/Password should be/i.test(m)) return "Сырсөз кеминде 6 белгиден турушу керек.";
    return m;
  }

  // ---------- жалпы жардамчылар ----------
  const fmtDate = iso => {
    if (!iso) return "Күнү белгилене элек";
    const d = new Date(iso);
    const m = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"][d.getMonth()];
    return `${d.getDate()}-${m}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
  const ytEmbed = u => {
    const m = String(u || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? "https://www.youtube-nocookie.com/embed/" + m[1] : "";
  };

  window.API = Object.assign(LIVE ? live : demo, { mode: LIVE ? "live" : "demo" });
  window.K = { GROUPS, STATUS, fmtDate, esc, safeUrl, ytEmbed, C, toLogin, loginLabel, PHONE_DOMAIN };
})();
