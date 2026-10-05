(function (g) {
  var _es = null;
  var _onOpen, _onData, _onErr;

  function initialize(url, encryptionType, sessionId, onOpen, onData, onError) {
    if (_es && _es.readyState !== EventSource.CLOSED) return;
    _onOpen = onOpen; _onData = onData; _onErr = onError;

    var u = url + '?timestamp=' + getTime('ms-cnt') + '&projectId=' + encodeURIComponent(driver_projectId);
    if (sessionId) u += '&jsessionId=' + encodeURIComponent(sessionId);

    _es = new EventSource(u, { withCredentials: true });
    _es.onopen = onOpen;


    _es.addEventListener('InnaITEventMessage', function (e) { onData(e.data); });
    _es.onmessage = function (e) { onData(e.data); };

    _es.onerror = function (e) {
      try { _es && _es.close(); } catch (_) {}
      _es = null;
      onError(e);
    };
  }

  function isOpen() { return !!_es && _es.readyState === EventSource.OPEN; }
  function close()  { if (_es) { try { _es.close(); } catch (_) {} _es = null; } }

  g.EventSourceService = { initialize: initialize, isOpen: isOpen, close: close };
})(window);
