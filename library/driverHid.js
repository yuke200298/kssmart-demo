(function (g) {

  var NON_HID_DRIVER_URL = 'https://localhost:1211';

  var nonHidDiscoveredList = [];
  var nonHidPluggedInCallback  = null;
  var nonHidPluggedOutCallback = null;

  function makeNonHidApiCall(method, contentType, requestUrl, postData) {
    var url = NON_HID_DRIVER_URL + '/' + requestUrl;
    var init = method === 'POST'
      ? { method: 'POST', headers: { 'Content-Type': contentType }, body: postData }
      : { method: 'GET',  headers: { 'Content-Type': contentType } };
    return fetch(url, init).then(function (res) {
      if (res.ok || res.status === 204) {
        return res.text().then(function (data) { return { status: 0, data: data }; });
      }
      return res.text().then(function (msg) { return { status: -1, message: msg }; });
    }).catch(function (e) {
      return { status: -1, message: (e && e.message) || String(e) };
    });
  }

  function handleNonHidDeviceListResult(result) {
    if (result.status !== 0 || !result.data) return;
    var discoverArr;
    try { discoverArr = JSON.parse(String(result.data).replace(/\t/g, '')); }
    catch (e) { console.error('Failed to parse non-HID device list:', e); return; }

    for (var i = 0; i < discoverArr.length; i++) {
      var item = discoverArr[i];
      var obj = typeof item === 'string' ? JSON.parse(item) : item;
      var exists = nonHidDiscoveredList.some(function (d) {
        return d.vendorId === obj.vid && d.productId === obj.pid && d.productName === obj.serialNumber;
      });
      if (!exists) {
        nonHidDiscoveredList.push({ vendorId: obj.vid, productId: obj.pid, productName: obj.serialNumber });
        if (nonHidPluggedInCallback) nonHidPluggedInCallback(obj.vid, obj.pid, obj.serialNumber);
      }
    }

    for (var j = nonHidDiscoveredList.length - 1; j >= 0; j--) {
      var d = nonHidDiscoveredList[j];
      var stillPresent = discoverArr.some(function (item) {
        var obj = typeof item === 'string' ? JSON.parse(item) : item;
        return obj.vid === d.vendorId && obj.pid === d.productId && obj.serialNumber === d.productName;
      });
      if (!stillPresent) {
        if (nonHidPluggedOutCallback) nonHidPluggedOutCallback(d.vendorId, d.productId, d.productName);
        nonHidDiscoveredList.splice(j, 1);
      }
    }

    try { localStorage.setItem('nonHidDiscoveredList', JSON.stringify(nonHidDiscoveredList)); } catch (_) {}
  }

  function initializeNonHidDriver(pluggedIn, pluggedOut) {
    try { localStorage.removeItem('hidDiscoveredList'); } catch (_) {}
    nonHidPluggedInCallback  = pluggedIn;
    nonHidPluggedOutCallback = pluggedOut;
    makeNonHidApiCall('GET', 'application/json', 'getDeviceList', null).then(handleNonHidDeviceListResult);
  }

  function isNonHidDriverAvailable() {
    return makeNonHidApiCall('GET', 'application/json', 'getDeviceList', null).then(function (r) {
      return r.status === 0 && !!r.data;
    });
  }

  function getNonHidResponse(vendorId, productId, serialNumber, command, transmitBuffer) {
    var ctapCommandId;
    switch (command) {
      case 'COMMAND_CBOR':        ctapCommandId = 144; break;
      case 'COMMAND_KEY':         ctapCommandId = 214; break;
      case 'COMMAND_GET_VERSION': ctapCommandId = 215; break;
      case 'COMMAND_TPM_BINARY':  ctapCommandId = 216; break;
      case 'COMMAND_TPM_PKCS11':  ctapCommandId = 217; break;
      default:                    ctapCommandId = parseInt(command, 10);
    }
    var postData = JSON.stringify({ ctapCommandId: ctapCommandId, serialNumber: serialNumber, data: transmitBuffer });
    return makeNonHidApiCall('POST', 'application/json', 'getResponse', postData).then(function (result) {
      if (!result.data) return '';
      try {
        var response = JSON.parse(String(result.data).replace(/\t/g, ''));
        if (response.errorCode === 0) return response.responseData != null ? response.responseData : '';
      } catch (e) { console.error('Error parsing non-HID response:', e); }
      return '';
    });
  }

  g.initializeNonHidDriver  = initializeNonHidDriver;
  g.isNonHidDriverAvailable = isNonHidDriverAvailable;
  g.getNonHidResponse       = getNonHidResponse;
})(window);
