/* Stand-in for Claude's artifact runtime, so pages built for claude.ai work on a plain website.
   - 'downloads' saves files with a normal browser download.
   - Every other capability (shared database, user, AI sampling...) answers null, which each page
     already treats as "not available here" and falls back to its local mode. */
(function () {
  if (window.claude && typeof window.claude.use === 'function') return;
  function toBlob(data, filename) {
    if (data instanceof Blob) return data;
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data]);
    var type = /\.json$/i.test(filename) ? 'application/json' : 'text/plain';
    return new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: type });
  }
  var downloads = {
    save: function (opts) {
      opts = opts || {};
      var name = opts.filename || 'download';
      var url = URL.createObjectURL(toBlob(opts.data, name));
      var a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      return Promise.resolve({ ok: true });
    }
  };
  window.claude = {
    standalone: true,
    use: function (name) { return Promise.resolve(name === 'downloads' ? downloads : null); }
  };
})();
