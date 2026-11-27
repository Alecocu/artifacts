// Backs up and restores everything the site's apps saved in this browser (localStorage + IndexedDB)
// as one JSON file, so work can move to another browser or device.
(function () {
  const $ = s => document.querySelector(s);
  const status = t => { $('#mw-status').textContent = t; };

  // Values in IndexedDB can be Blobs, ArrayBuffers, typed arrays or Dates; JSON can't hold them, so tag them.
  async function enc(v) {
    if (v instanceof Blob) return { __t: 'blob', type: v.type, b64: await b64(await v.arrayBuffer()) };
    if (v instanceof ArrayBuffer) return { __t: 'ab', b64: await b64(v) };
    if (ArrayBuffer.isView(v)) return { __t: 'ta', ctor: v.constructor.name, b64: await b64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
    if (v instanceof Date) return { __t: 'date', v: v.toISOString() };
    if (Array.isArray(v)) return Promise.all(v.map(enc));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await enc(v[k]); return o; }
    return v;
  }
  function dec(v) {
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') {
      if (v.__t === 'blob') return new Blob([unb64(v.b64)], { type: v.type });
      if (v.__t === 'ab') return unb64(v.b64);
      if (v.__t === 'ta') return new (globalThis[v.ctor] || Uint8Array)(unb64(v.b64));
      if (v.__t === 'date') return new Date(v.v);
      const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o;
    }
    return v;
  }
  const b64 = buf => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(new Blob([buf])); });
  const unb64 = s => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; };
  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

  async function dumpIDB() {
    if (!indexedDB.databases) return [];
    const out = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await req(indexedDB.open(info.name));
      const stores = [];
      for (const name of db.objectStoreNames) {
        const st = db.transaction(name).objectStore(name);
        const [keys, values] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
        stores.push({ name, keyPath: st.keyPath, autoIncrement: st.autoIncrement,
          indexes: Array.from(st.indexNames).map(n => { const ix = st.index(n); return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; }),
          rows: await Promise.all(keys.map(async (k, i) => ({ k: await enc(k), v: await enc(values[i]) }))) });
      }
      out.push({ name: info.name, version: db.version, stores });
      db.close();
    }
    return out;
  }
  async function restoreIDB(dbs) {
    for (const d of dbs) {
      await req(indexedDB.deleteDatabase(d.name)).catch(() => {});
      const open = indexedDB.open(d.name, d.version || 1);
      open.onupgradeneeded = () => {
        for (const s of d.stores) {
          const st = open.result.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: s.autoIncrement });
          for (const ix of s.indexes) st.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry });
        }
      };
      const db = await req(open);
      for (const s of d.stores) {
        const tx = db.transaction(s.name, 'readwrite'), st = tx.objectStore(s.name);
        for (const row of s.rows) s.keyPath != null ? st.put(dec(row.v)) : st.put(dec(row.v), dec(row.k));
        await new Promise((ok, no) => { tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
      }
      db.close();
    }
  }

  async function summary() {
    const ls = Object.keys(localStorage);
    const dbs = indexedDB.databases ? (await indexedDB.databases()).filter(d => d.name) : [];
    let bytes = 0; ls.forEach(k => { bytes += k.length + (localStorage.getItem(k) || '').length; });
    $('#mw-summary').textContent = ls.length || dbs.length
      ? `This browser holds ${ls.length} saved setting${ls.length === 1 ? '' : 's'} (about ${Math.max(1, Math.round(bytes / 1024))} KB) and ${dbs.length} project database${dbs.length === 1 ? '' : 's'} from the apps on this site.`
      : 'Nothing saved in this browser yet. Use an app, and its work will show up here.';
  }

  $('#mw-backup').addEventListener('click', async () => {
    try {
      status('Collecting…');
      const data = { kind: 'artifacts-site-backup', v: 1, at: new Date().toISOString(), origin: location.origin,
        localStorage: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])), indexedDB: await dumpIDB() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `my-work-${data.at.slice(0, 10)}.json` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      status('Backup downloaded.');
    } catch (e) { status('Could not make the backup: ' + e.message); }
  });
  $('#mw-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.kind !== 'artifacts-site-backup') throw new Error('this is not a backup from this site');
      if (!confirm('Restore this backup? It replaces the saved work of the same apps in this browser.')) return;
      status('Restoring…');
      for (const [k, v] of Object.entries(data.localStorage || {})) localStorage.setItem(k, v);
      await restoreIDB(data.indexedDB || []);
      status(`Restored the backup from ${data.at.slice(0, 10)}.`); summary();
    } catch (err) { status('Could not restore: ' + err.message); }
    e.target.value = '';
  });
  summary();
})();
