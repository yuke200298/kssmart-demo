function authenticateWithInnaitKey(serialNumber, callback) {
  var deviceInfo = deviceHandler.getDeviceInfo(serialNumber);
  if (!deviceInfo) {
    callback && callback({ status: -1, errorMessage: 'Device info not found for ' + serialNumber });
    return;
  }

  FetchApi.authenticateWithInnaitKey({
    deviceInfo:   deviceInfo,
    serialNumber: serialNumber,
    reason: '', title: '', prompt: '',
    transactionRef: '', hash: '',
  }, 0, function (response) {
    if (response && response.status === 200) deviceHandler.setActive(serialNumber);
    callback && callback(response);
  });
}

function extractAuthCode(response) {
  if (!response) return '';
  var d = response.data;
  if (typeof d === 'string') return d;
  if (d && (d.code || d.authCode || d.authorizationCode)) return d.code || d.authCode || d.authorizationCode;
  return response.code || response.authCode || '';
}

function getToken(code, callback) {
  if (!code) {
    callback && callback({ status: -1, errorMessage: 'No authorization code — Authenticate first.' });
    return;
  }
  FetchApi.getToken({
    grant_type:    'authorization_code',
    code:          code,
    redirect_uri:  driver_redirectUri,
    client_id:     driver_projectId + '_' + driver_clientId,
    client_secret: driver_clientSecret,
    code_verifier: '',
  }, callback);
}

// Refresh concept (same as idam-bank-client): reuse the SAME code + the
// refresh_token from the first getToken response to call getToken again with
// grant_type=refresh_token → server mints a new access_token, no re-auth.
// Server reuses the same refresh_token (no rotation) so the original stays
// valid for repeated refreshes; the `code` is still required in the body.
function refreshToken(code, refreshTok, callback) {
  if (!code || !refreshTok) {
    callback && callback({ status: -1, errorMessage: 'No refresh token — Get token first.' });
    return;
  }
  FetchApi.getToken({
    grant_type:    'refresh_token',
    code:          code,
    refresh_token: refreshTok,
    client_id:     driver_projectId + '_' + driver_clientId,
    client_secret: driver_clientSecret,
    code_verifier: '',
  }, callback);
}
