// «Карабай жазуу» тренажёрунун маалымат катмары: Supabase RPC (чыныгы) же Демо (localStorage).
// Аккаунттар сайттагы эле аккаунттар (js/api.js). Бул файл тренажёрдун прогрессин, төлөмүн жана түзмөктөрүн башкарат.
(function () {
  const C = window.KURS_CONFIG || {};
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const DEF_CFG = { free: 5, price: "", devices: 2 };

  const mapErr = m => {
    if (/DEVICE_LIMIT/.test(m)) return "Бул аккаунт башка түзмөктөргө байланган. Окутуучуга кайрылыңыз.";
    return m;
  };
  const kicked = () => Object.assign(new Error("KICKED"), { status: 401, kicked: true });
  const secs = t => (t ? Math.floor(new Date(t).getTime() / 1000) : 0);
  const label = login => (K.loginLabel ? K.loginLabel(login) : login) || "";

  // базадан келген абал → тренажёрдун "user" объектиси
  const shape = j => ({
    id: j.id, name: j.name || "", phone: label(j.login), role: j.admin ? "admin" : "student",
    max: j.max, paid: !!j.paid, pending: !!j.pending,
  });
  const pack = j => ({ user: shape(j), config: Object.assign({}, DEF_CFG, j.config || {}) });

  // ---------- SUPABASE ----------
  const live = {
    async rpc(name, args) {
      const { data, error } = await API.client().rpc(name, args || {});
      if (error) { if (/KICKED/.test(error.message)) throw kicked(); throw new Error(mapErr(error.message)); }
      return data;
    },
    async cfg() { return Object.assign({}, DEF_CFG, await this.rpc("typing_cfg")); },
    async claim(dev) { return pack(await this.rpc("typing_claim", { device: dev })); },
    async ping(dev) {
      const j = await this.rpc("typing_ping", { device: dev });
      if (!j || j.ok === false) throw kicked();
      return pack(j);
    },
    async progress(n, dev) { return pack(await this.rpc("typing_progress", { new_max: n, device: dev })).user; },
    async payRequest(dev) { return pack(await this.rpc("typing_pay_request", { device: dev })).user; },
    admin: {
      async list() {
        const j = await live.rpc("typing_admin_list");
        return {
          config: Object.assign({}, DEF_CFG, j.config || {}),
          users: (j.users || []).map(u => ({
            id: u.id, name: u.name || "", phone: label(u.login) || u.phone || "", max: u.max, paid: u.paid,
            pending: u.pending, devices: u.devices, last: secs(u.last), created: secs(u.created),
          })),
        };
      },
      async setPaid(id, val) { await live.rpc("typing_admin_set_paid", { target: id, val }); },
      async setMax(id, n) { await live.rpc("typing_admin_set_max", { target: id, n }); },
      async resetDevices(id) { await live.rpc("typing_admin_reset_devices", { target: id }); },
      async remove(id) { await live.rpc("typing_admin_delete", { target: id }); },
      async config(c) { await live.rpc("typing_admin_config", { price: c.price, free: c.free, devices: c.devices }); },
      async setPhone(id, phone) { await live.rpc("typing_admin_set_phone", { target: id, new_phone: phone }); },
    },
  };

  // ---------- ДЕМО (localStorage) ----------
  const KEY = "karabay_typing_demo_v1";
  const dload = () => { let d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} return d || { acc: {}, cfg: { ...DEF_CFG } }; };
  const dsave = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  async function dme() { const me = await API.me(); if (!me) throw Object.assign(new Error("Кирүү керек"), { status: 401 }); return me; }
  const dstate = (me, a, d) => ({
    ok: true, id: me.id, name: me.full_name, login: me.login || me.email, max: a.max, paid: a.paid,
    pending: !!a.req && !a.paid, admin: me.role === "admin", config: d.cfg,
  });
  const demo = {
    async cfg() { return dload().cfg; },
    async claim(dev) {
      const me = await dme(), d = dload();
      const a = d.acc[me.id] = d.acc[me.id] || { max: 1, paid: false, req: 0, devices: [], active: "", last: Date.now(), created: Date.now() };
      if (me.role !== "admin" && !a.devices.includes(dev)) {
        if (a.devices.length >= d.cfg.devices) throw new Error(mapErr("DEVICE_LIMIT"));
        a.devices.push(dev);
      }
      a.active = dev; a.last = Date.now(); dsave(d);
      return pack(dstate(me, a, d));
    },
    async ping(dev) {
      const me = await dme(), d = dload(), a = d.acc[me.id];
      if (!a || (a.active !== dev && me.role !== "admin")) throw kicked();
      a.last = Date.now(); dsave(d);
      return pack(dstate(me, a, d));
    },
    async progress(n, dev) {
      const me = await dme(), d = dload(), a = d.acc[me.id];
      if (!a || (a.active !== dev && me.role !== "admin")) throw kicked();
      const adm = me.role === "admin";
      const cap = a.paid || adm ? 100 : d.cfg.free + 1;
      let m = Math.min(Math.max(n, 1), cap);
      if (!adm) m = Math.min(m, a.max + 1);
      a.max = Math.max(a.max, m); a.last = Date.now(); dsave(d);
      return shape(dstate(me, a, d));
    },
    async payRequest() {
      const me = await dme(), d = dload(), a = d.acc[me.id];
      if (a && !a.paid && !a.req) a.req = Date.now();
      dsave(d); return shape(dstate(me, a, d));
    },
    admin: {
      async list() {
        const me = await dme(); if (me.role !== "admin") throw new Error("Уруксат жок");
        const d = dload(), profs = await API.listProfiles();
        const users = Object.keys(d.acc).map(id => {
          const p = profs.find(x => x.id === id); if (!p || p.role === "admin") return null; const a = d.acc[id];
          return { id, name: p.full_name || "", phone: label(p.login || p.email) || p.phone || "", max: a.max, paid: a.paid,
            pending: !!a.req && !a.paid, devices: a.devices.length, last: Math.floor(a.last / 1000), created: Math.floor(a.created / 1000) };
        }).filter(Boolean).sort((x, y) => y.last - x.last);
        return { config: d.cfg, users };
      },
      async setPaid(id, val) { const d = dload(); if (d.acc[id]) { d.acc[id].paid = !!val; if (val) d.acc[id].req = 0; } dsave(d); },
      async setMax(id, n) { const d = dload(); if (d.acc[id]) d.acc[id].max = Math.min(Math.max(n, 1), 100); dsave(d); },
      async resetDevices(id) { const d = dload(); if (d.acc[id]) { d.acc[id].devices = []; d.acc[id].active = ""; } dsave(d); },
      async remove(id) { const d = dload(); delete d.acc[id]; dsave(d); },
      async config(c) { const d = dload(); d.cfg = { price: String(c.price || ""), free: Math.min(Math.max(+c.free || 5, 1), 99), devices: Math.min(Math.max(+c.devices || 2, 1), 5) }; dsave(d); },
      async setPhone(id, phone) {
        const login = K.toLogin(phone); let db = null; try { db = JSON.parse(localStorage.getItem("kurs_demo_db_v2")); } catch (e) {}
        if (!db) return; const u = db.users.find(x => x.id === id); if (!u) return;
        if (db.users.some(x => x.email === login && x.id !== id)) throw new Error("Бул номер башка адамда бар");
        u.email = login; u.profile.login = login; u.profile.phone = phone;
        localStorage.setItem("kurs_demo_db_v2", JSON.stringify(db));
      },
    },
  };

  window.TYPING = Object.assign(LIVE ? live : demo, { mode: LIVE ? "live" : "demo" });
})();
