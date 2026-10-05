(function (g) {
  var _ws = null;

  function initializeWebSocket(url, encryptionType, onOpen, onData, onError) {
    if (_ws && (_ws.readyState === 0 || _ws.readyState === 1)) return;

    var u = url + '?timestamp=' + getTime('ms-cnt') + '&projectId=' + encodeURIComponent(driver_projectId);
    _ws = new WebSocket(u);

    _ws.onopen    = function (e) { onOpen && onOpen(e); };
    _ws.onmessage = function (e) { onData && onData(e.data); };
    _ws.onerror   = function (e) { onError && onError(e); };
    _ws.onclose   = function (e) { _ws = null; onError && onError(e); };
  }

  function wsClose() { if (_ws) { try { _ws.close(); } catch (_) {} _ws = null; } }

  g.initializeWebSocket = initializeWebSocket;
  g.wsClose             = wsClose;
})(window);
