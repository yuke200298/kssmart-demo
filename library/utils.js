(function (g) {

  g.setLS    = function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} };
  g.getLS    = function (k)    { try { return localStorage.getItem(k); } catch (_) { return null; } };
  g.removeLS = function (k)    { try { localStorage.removeItem(k); } catch (_) {} };

  function b64uEncode(input) {
    var bin = '';
    if (typeof input === 'string') bin = input;
    else for (var i = 0; i < input.length; i++) bin += String.fromCharCode(input[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(input) {
    var b64 = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    var pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  g.base64url = { encode: b64uEncode, decode: b64uDecode };

  var _lastTs = 0;
  g.getTime = function (fmt) {
    var now = Date.now();
    _lastTs = now > _lastTs ? now : _lastTs + 1;
    return fmt === 'ms-cnt' ? _lastTs : new Date(_lastTs).toISOString();
  };

})(window);
