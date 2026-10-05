(function (g) {

  var HID_FILTERS = [];
  var VID = 13196;
  var PIDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,33,34,35,36,37,38,49,50,51,52,53,54,55];
  for (var ii = 0; ii < PIDS.length; ii++) HID_FILTERS.push({ vendorId: VID, productId: PIDS[ii] });

  var REPORT_SIZE = 64;
  var PAYLOAD_POS = 7;
  var COMMAND_GET_CHANNELID = 0x86;
  var COMMAND_CBOR          = 0x90;
  var COMMAND_KEY           = 0xD6;
  var CID_BROADCAST = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
  var PKT_CHANNELID = new Uint8Array([0xa2, 0x83, 0x67, 0xb0, 0x6e, 0x1c, 0xb5, 0x38]);

  var hidDevices = [];
  var hidOutputBuffer = [];
  var hidPluggedInCb  = null;
  var hidPluggedOutCb = null;

  function bytesToHex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; }
  function numTo2 (n)    { return new Uint8Array([(n >> 8) & 0xff, n & 0xff]); }
  function decToU8(n)    { return new Uint8Array([n & 0xff]); }
  function snFromPN(pn)  { if (!pn) return pn; var m = String(pn).match(/([A-Z0-9]{16})/); return m ? m[1] : pn; }
  function eq(a, b)      { return String(a) === String(b); }
  function sleep(ms)     { return new Promise(function (r) { setTimeout(r, ms); }); }

  function findIdx(vid, pid, sn) {
    for (var i = 0; i < hidDevices.length; i++) {
      var d = hidDevices[i].device;
      if (eq(d.vendorId, vid) && eq(d.productId, pid) &&
          (eq(d.productName, sn) || eq(snFromPN(d.productName), sn) || eq(d.productName, snFromPN(sn)))) {
        return i;
      }
    }
    return -1;
  }

  function addDevice(device) {
    var i = findIdx(device.vendorId, device.productId, device.productName);
    if (i !== -1) hidDevices.splice(i, 1);
    hidDevices.push({ device: device, channel: null, reportBuffer: null,
                      bytesReceived: 0, numberOfBytesToRead: 0, responseSequence: 0 });
    device.addEventListener('inputreport', handleInputReport);
  }

  function updateResponses(vid, pid, sn, buffer) {
    for (var i = 0; i < hidOutputBuffer.length; i++) {
      var it = hidOutputBuffer[i];
      if (eq(it.vid, vid) && eq(it.pid, pid) &&
          (eq(it.sn, snFromPN(sn)) || eq(it.sn, sn))) it.buffer = buffer;
    }
  }

  async function handleInputReport(e) {
    var buf = new Uint8Array(e.data.buffer);
    var vid = e.device.vendorId, pid = e.device.productId, sn = e.device.productName;
    var idx = findIdx(vid, pid, sn);
    if (idx === -1) return;
    var slot = hidDevices[idx];

    if (slot.channel == null) {
      if (buf[4] === COMMAND_GET_CHANNELID) {
        slot.channel = new Uint8Array(buf.slice(15, 19));
        updateResponses(vid, pid, sn, '');
      }
      return;
    }

    if (bytesToHex(new Uint8Array(buf.slice(0, 4))) !== bytesToHex(slot.channel)) return;

    if (slot.numberOfBytesToRead === 0) {

      if (buf[4] === 187) return;
      var len = (buf[5] << 8) | buf[6];
      slot.numberOfBytesToRead = len;
      slot.reportBuffer = new Uint8Array(len + REPORT_SIZE);
      slot.reportBuffer.set(new Uint8Array(buf.slice(7, REPORT_SIZE)), 0);
      slot.responseSequence = REPORT_SIZE - 7;
      slot.bytesReceived    = REPORT_SIZE - 7;
    } else {

      slot.reportBuffer.set(new Uint8Array(buf.slice(5, REPORT_SIZE)), slot.responseSequence);
      slot.responseSequence += REPORT_SIZE - 5;
      slot.bytesReceived    += REPORT_SIZE - 5;
    }

    if (slot.bytesReceived >= slot.numberOfBytesToRead && slot.numberOfBytesToRead > 0) {
      updateResponses(vid, pid, sn, slot.reportBuffer);
      slot.reportBuffer = null;
      slot.numberOfBytesToRead = 0;
      slot.bytesReceived = 0;
      slot.responseSequence = 0;

      try { if (slot.device.opened) await slot.device.close(); } catch (_) {}
    }
  }

  async function hidSendReport(vid, pid, sn, transmitBuffer, command) {
    var idx = findIdx(vid, pid, sn);
    if (idx === -1) return;
    var slot = hidDevices[idx];
    var device = slot.device;
    if (!device) return;

    if (command == null || command === 'COMMAND_CBOR')        command = COMMAND_CBOR;
    else if (command === 'COMMAND_KEY')                       command = COMMAND_KEY;
    else if (command === 'COMMAND_GET_VERSION')               command = 0xD7;
    else if (command === 'COMMAND_TPM_BINARY')                command = 0xD8;
    else if (command === 'COMMAND_TPM_PKCS11')                command = 0xD9;

    var channel = slot.channel || CID_BROADCAST;

    var totalLen = transmitBuffer.length;
    var seqs = Math.ceil(totalLen / 59);
    totalLen = totalLen + (seqs - 1) * 5 + PAYLOAD_POS;
    seqs = Math.ceil(totalLen / REPORT_SIZE);

    var reports = [];
    var pos = 0;
    for (var i = 1; i <= seqs; i++) {
      var r = new Uint8Array(REPORT_SIZE);
      if (i === 1) {
        var maxLen = REPORT_SIZE - PAYLOAD_POS;
        r.set(channel, 0);
        r[channel.length] = command;
        r.set(numTo2(transmitBuffer.length), channel.length + 1);
        r.set(transmitBuffer.slice(0, maxLen), PAYLOAD_POS);
        pos = maxLen - 1;
      } else {
        var maxLen2 = REPORT_SIZE - 5;
        r.set(channel, 0);
        r.set(decToU8(i - 2), channel.length);
        r.set(transmitBuffer.slice(pos + 1, pos + 1 + maxLen2), 5);
        pos += maxLen2;
      }
      reports.push(r);
    }

    if (!device.opened) await device.open();
    var attempts = 0;
    while (!device.opened && attempts < 40) { await sleep(125); attempts++; }
    if (!device.opened) return;

    for (var k = 0; k < reports.length; k++) await device.sendReport(0, reports[k]);
  }

  async function hidOpen(vid, pid, sn) {
    var idx = findIdx(vid, pid, sn);
    if (idx === -1) return;
    var slot = hidDevices[idx];
    if (!slot.device.opened) await slot.device.open();
    await hidSendReport(vid, pid, sn, PKT_CHANNELID, COMMAND_GET_CHANNELID);
  }


  function hidGetResponse(vid, pid, sn, command, transmitBuffer, callback) {
    hidOutputBuffer.push({ vid: vid, pid: pid, sn: sn, buffer: null });

    if (command === 'open') {
      hidOpen(vid, pid, sn);
    } else if (transmitBuffer) {
      var u8 = transmitBuffer instanceof Uint8Array ? transmitBuffer : new Uint8Array(transmitBuffer);
      hidSendReport(vid, pid, sn, u8, command);
    } else {
      callback(undefined);
      return;
    }

    var count = 0;
    var id = setInterval(function () {
      var i = -1;
      for (var j = 0; j < hidOutputBuffer.length; j++) {
        var it = hidOutputBuffer[j];
        if (eq(it.vid, vid) && eq(it.pid, pid) &&
            (eq(it.sn, snFromPN(sn)) || eq(it.sn, sn)) && it.buffer !== null) { i = j; break; }
      }
      if (i !== -1) {
        var buf = hidOutputBuffer[i].buffer;
        hidOutputBuffer.splice(i, 1);
        clearInterval(id);
        callback(buf);
        return;
      }
      count++;
      if (count >= 6000) { clearInterval(id); callback(undefined); }
    }, 50);
  }

  function hidGetResponseAsync(vid, pid, sn, command, transmitBuffer) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('Device response timeout')); }, 300000);
      hidGetResponse(vid, pid, sn, command, transmitBuffer, function (r) { clearTimeout(t); resolve(r); });
    });
  }

  async function onConnect(event) {
    var device = event.device;
    if (!device || !device.collections || !device.collections.length) return;
    if (!device.collections[0].inputReports || !device.collections[0].inputReports.length) return;

    addDevice(device);
    try {
      await hidGetResponseAsync(device.vendorId, device.productId, device.productName || '', 'open', null);
    } catch (err) { console.warn('Channel handshake failed:', err); }
    hidPluggedInCb && hidPluggedInCb(device.vendorId, device.productId, snFromPN(device.productName || ''));
  }

  async function onDisconnect(event) {
    var device = event.device;
    if (!device) return;
    var vid = String(device.vendorId), pid = String(device.productId), sn = snFromPN(device.productName || '');
    hidPluggedOutCb && hidPluggedOutCb(vid, pid, sn);
    var i = findIdx(vid, pid, sn);
    if (i !== -1) hidDevices.splice(i, 1);
    updateResponses(vid, pid, sn, '');
    try { if (device.opened) await device.close(); } catch (_) {}
  }

  function initializeHidDriver(pluggedIn, pluggedOut) {
    hidPluggedInCb  = pluggedIn;
    hidPluggedOutCb = pluggedOut;
    if (!('hid' in navigator)) { console.warn('WebHID not supported'); return; }
    navigator.hid.addEventListener('connect', onConnect);
    navigator.hid.addEventListener('disconnect', onDisconnect);

    navigator.hid.getDevices().then(function (devices) {
      var valid = devices.filter(function (d) {
        return HID_FILTERS.some(function (f) { return f.vendorId === d.vendorId && f.productId === d.productId; });
      });
      return Promise.all(valid.map(function (d) { return onConnect({ device: d }).catch(function (e) { console.error(e); }); }));
    });
  }

  async function requestHidDevice() {
    if (!('hid' in navigator)) throw new Error('WebHID not supported');
    var devices = await navigator.hid.requestDevice({ filters: HID_FILTERS });
    if (!devices || !devices.length) return;
    for (var i = 0; i < devices.length; i++) {
      var d = devices[i];
      if (!d.opened) await d.open();
      if (d.collections && d.collections.length && d.collections[0].inputReports && d.collections[0].inputReports.length) {
        addDevice(d);
        await onConnect({ device: d });
      }
    }
  }

  g.initializeHidDriver = initializeHidDriver;
  g.requestHidDevice    = requestHidDevice;
  g.hidGetResponse      = hidGetResponse;
})(window);
