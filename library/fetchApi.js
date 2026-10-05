(function (g) {

  function buildUrl(path) {
    return driver_serverBase + '/' + path.replace(/^\/+/, '');
  }

  function qs(params) {
    var out = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return out.join('&');
  }



  function call(opts, callback) {
    var url = opts.url;
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});

    var challengeId = getLS('challengeId');
    if (challengeId && !headers.challengeId) headers.challengeId = challengeId;

    var fetchInit = {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'include',
    };

    if (opts.body != null) {
      fetchInit.body = (typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);
    }

    fetch(url, fetchInit).then(function (res) {
      var ct = res.headers.get('content-type') || '';
      var parser = (ct.indexOf('application/json') !== -1) ? res.json() : res.text();
      return parser.then(function (body) {
        if (!res.ok) {
          var errBody = typeof body === 'object' ? body : { errorMessage: String(body || res.statusText) };
          callback(Object.assign({ status: res.status }, errBody));
          return;
        }
        if (typeof body === 'string') { callback({ status: 200, data: body }); return; }
        callback(body);
      });
    }).catch(function (err) {
      callback({ status: -1, errorMessage: String(err) });
    });
  }

  function processResponse(id, sessionId, command, data, vid, pid, serialNumber, remoteHostId, cb) {
    var url = buildUrl('api/processResponse') + '?' + qs({ projectId: driver_projectId, remoteHostId: remoteHostId });
    call({ url: url, method: 'POST', body: { id: id, sessionId: sessionId, command: command, data: data } }, cb || function () {});
  }

  function openSession(vid, pid, serialNumber, remoteHostId, remoteHostName, cb) {
    var url = buildUrl('api/openSession') + '?' + qs({
      projectId: driver_projectId, remoteHostId: remoteHostId, remoteHostName: remoteHostName,
    });
    call({ url: url, method: 'POST', body: { vid: vid, pid: pid, serialNumber: serialNumber } }, cb);
  }

  function closeSession(sessionId, remoteHostId, cb) {
    var url = buildUrl('api/closeSession') + '?' + qs({
      projectId: driver_projectId, deviceSessionId: sessionId, remoteHostId: remoteHostId,
    });
    call({ url: url, method: 'POST' }, cb || function () {});
  }

  function getDeviceData(deviceInfo, cb) {
    var url = buildUrl('api/innaitKey/getDeviceData') + '?' + qs({
      projectId: driver_projectId, deviceInfo: deviceInfo,
    });
    call({ url: url, method: 'POST', body: '' }, cb);
  }

  function authenticateWithInnaitKey(body, verificationSequence, cb) {
    var path = body.deviceInfo
      ? 'api/authenticateWithInnaitKey?deviceInfo=' + encodeURIComponent(body.deviceInfo)
      : 'api/authenticateWithInnaitKey';
    var url = buildUrl(path) + (path.indexOf('?') !== -1 ? '&' : '?') +
              qs({ verificationSequence: verificationSequence != null ? verificationSequence : 0,
                   projectId: driver_projectId });
    call({ url: url, method: 'POST', body: body }, cb);
  }

  // OIDC token exchange. URL is built here (buildUrl → driver_serverBase +
  // /oidc/getToken); the endpoint is form-urlencoded and returns a plain token
  // map (NOT the ApiResponse envelope), so this doesn't go through `call`.
  function getToken(params, cb) {
    var url = buildUrl('oidc/getToken');
    var body = new URLSearchParams(params || {}).toString();
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body: body,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
        if (!res.ok && data && data.status === undefined) data.status = res.status;
        cb && cb(data);
      });
    }).catch(function (err) {
      cb && cb({ status: -1, errorMessage: String(err) });
    });
  }



  g.FetchApi = {
    openSession:               openSession,
    closeSession:              closeSession,
    processResponse:           processResponse,
    getDeviceData:             getDeviceData,
    authenticateWithInnaitKey: authenticateWithInnaitKey,
    getToken:                  getToken,
  };
})(window);
