(function (g) {

  var hidDiscoveredList = [];
  var latestEventIdBySession = {};

  var remoteHost = null, remoteHostId = null, remoteHostName = null;
  var deviceEncryptionType = null, deviceEventType = null;
  var deviceHandlerInitCalled = false;
  var autoOpenSession = true;
  var hidBrowserSupported = null;

  var openSessionQueue = [], isOpening = false;
  var processResponseQueue = [], isProcessing = false;

  // Dedup guards so a device is opened only ONCE per RemoteHost. Both the HID
  // plug path (devicePluggedIn) and the SSESOURCECREATED auto-open loop enqueue
  // the same device — without this the whole openSession → processResponse →
  // getDeviceData chain runs twice for a single connected device.
  //   openedSerialHost[sn]  = remoteHostId it was opened against (skip re-open
  //                           for the SAME host; a NEW host re-opens correctly)
  //   openingSerials[sn]    = true while an open is in flight
  var openedSerialHost = {}, openingSerials = {};

  var parameterList = [], isProcessingPlug = false, plugCheckInterval = null;
  var isProcessingUnplug = false, unplugCheckInterval = null;

  var authenticatorStatusCallback = null;
  var driverStatusCallback = null;

  function findIdx(vid, pid, sn) {
    for (var i = 0; i < hidDiscoveredList.length; i++) {
      var d = hidDiscoveredList[i];
      if (String(d.vendorId) === String(vid) && String(d.productId) === String(pid) && String(d.serialNumber) === String(sn)) return i;
    }
    return -1;
  }
  function notifyStatus() { try { authenticatorStatusCallback && authenticatorStatusCallback(); } catch (_) {} }

  function enqueueOpenSession(vid, pid, sn, cb) {
    openSessionQueue.push({ vid: vid, pid: pid, sn: sn, cb: cb });
    if (!isOpening) processOpenSession();
  }
  function processOpenSession() {
    if (isOpening || openSessionQueue.length === 0) return;
    isOpening = true;
    var t = openSessionQueue.shift();
    FetchApi.openSession(t.vid, t.pid, t.sn, remoteHostId, remoteHostName, function (r) {
      try { t.cb(r); } catch (e) { console.error(e); }
      setTimeout(function () { isOpening = false; processOpenSession(); }, 200);
    });
  }

  function enqueueProcessResponse(id, sessionId, command, postData, vid, pid, sn, cb) {
    processResponseQueue.push({ id: id, sessionId: sessionId, command: command, postData: postData, vid: vid, pid: pid, sn: sn, cb: cb });
    if (!isProcessing) processQueue();
  }
  function processQueue() {
    if (isProcessing || processResponseQueue.length === 0) return;
    isProcessing = true;
    var t = processResponseQueue.shift();

    var fresher = t.sessionId ? latestEventIdBySession[t.sessionId] : undefined;
    var effectiveId = fresher || t.id;
    FetchApi.processResponse(effectiveId, t.sessionId, t.command, t.postData, t.vid, t.pid, t.sn, remoteHostId || '', function (r) {
      try { t.cb(r); } catch (e) { console.error(e); }
      setTimeout(function () { isProcessing = false; processQueue(); }, 200);
    });
  }

  function processDeviceConnection(d) {
    return new Promise(function (resolve) {
      var key = String(d.sn);
      // Skip if an open is already in flight, or already opened for this host.
      // (Set synchronously so a duplicate entry in the same batch is caught.)
      if (openingSerials[key]) { resolve(); return; }
      if (openedSerialHost[key] && openedSerialHost[key] === remoteHostId) { resolve(); return; }
      openingSerials[key] = true;

      enqueueOpenSession(d.vid, d.pid, d.sn, function (result) {
        if (!result || result.status !== 200) {
          delete openingSerials[key];
          console.warn('[deviceHandler] openSession failed:', result && result.errorMessage);
          resolve(); return;
        }
        openedSerialHost[key] = remoteHostId;
        delete openingSerials[key];
        var idx = findIdx(d.vid, d.pid, d.sn);
        if (idx !== -1) {
          hidDiscoveredList[idx].deviceInfo = result.data;
          setLS('hidDiscoveredList', JSON.stringify(hidDiscoveredList));
        }
        FetchApi.getDeviceData(result.data, function (dd) {
          if (dd && dd.status === 200 && idx !== -1) {
            hidDiscoveredList[idx].deviceData = dd.data;
            setLS('hidDiscoveredList', JSON.stringify(hidDiscoveredList));
          }
          notifyStatus();
          resolve();
        });
      });
    });
  }

  function handlePlugParameterList() {
    var process = function () {
      if (isProcessingPlug) return;
      isProcessingPlug = true;
      if (!remoteHostId) { isProcessingPlug = false; setTimeout(handlePlugParameterList, 500); return; }

      var toConnect = [];
      for (var i = parameterList.length - 1; i >= 0; i--) {
        if (parameterList[i].action === 'connected') {
          toConnect.push(parameterList[i].data);
          parameterList.splice(i, 1);
        }
      }
      Promise.all(toConnect.map(function (d) { return processDeviceConnection(d).catch(function () {}); }))
             .then(function () { notifyStatus(); isProcessingPlug = false; });
    };
    if (plugCheckInterval === null) {
      plugCheckInterval = setInterval(function () {
        if (parameterList.some(function (p) { return p.action === 'connected'; }) && !isProcessingPlug) process();
      }, 1000);
    }
    process();
  }

  function processDeviceDisconnection(d) {
    var idx = findIdx(d.vid, d.pid, d.sn);
    var sessionId = null;
    // Clear dedup guards so the device can be opened again if re-plugged.
    delete openedSerialHost[String(d.sn)];
    delete openingSerials[String(d.sn)];
    if (idx !== -1) {
      sessionId = hidDiscoveredList[idx].sessionId;
      hidDiscoveredList.splice(idx, 1);
      setLS('hidDiscoveredList', JSON.stringify(hidDiscoveredList));
    }
    removeLS('lastMessageReceived');
    fpModal.hide();
    fpPasswordModal.hide();
    if (sessionId) {
      FetchApi.closeSession(sessionId, remoteHostId, function (_r) {  });
    }
    notifyStatus();
  }

  function handleUnplugParameterList() {
    var process = function () {
      if (isProcessingUnplug) return;
      isProcessingUnplug = true;
      var pending = [];
      for (var i = parameterList.length - 1; i >= 0; i--) {
        if (parameterList[i].action === 'disconnected') {
          pending.push(parameterList[i].data);
          parameterList.splice(i, 1);
        }
      }
      pending.forEach(processDeviceDisconnection);
      isProcessingUnplug = false;
    };
    if (unplugCheckInterval === null) {
      unplugCheckInterval = setInterval(function () {
        if (parameterList.some(function (p) { return p.action === 'disconnected'; }) && !isProcessingUnplug) process();
      }, 800);
    }
    process();
  }

  function devicePluggedIn(vid, pid, sn) {
    if (!hidDiscoveredList.some(function (d) { return d.serialNumber === sn; })) {
      hidDiscoveredList.push({ vendorId: vid, productId: pid, serialNumber: sn });
      setLS('hidDiscoveredList', JSON.stringify(hidDiscoveredList));
      parameterList.push({ action: 'connected', data: { vid: vid, pid: pid, sn: sn } });
      handlePlugParameterList();
      if (authenticatorStatusCallback && !autoOpenSession) setTimeout(notifyStatus, 500);
    }
  }
  function devicePluggedOut(vid, pid, sn) {
    parameterList.push({ action: 'disconnected', data: { vid: vid, pid: pid, sn: sn } });
    handleUnplugParameterList();
  }

  function transmitAndRespond(event, sessionId, command, vid, pid, sn) {
    var parts = String(event.data).split(',');
    var i = 0;
    function next() {
      if (i >= parts.length) return;
      var isLast = i === parts.length - 1;
      var raw = parts[i].trim();
      var data = hidBrowserSupported ? base64url.decode(raw) : raw;

      var effective = command === 'GETRESPONSE' ? event.commandType : command;

      var onResp = function (resp) {
        if (isLast) {
          var respEncoded = '';
          if (resp) respEncoded = hidBrowserSupported ? base64url.encode(resp) : resp;
          removeLS('lastMessageReceived');
          enqueueProcessResponse(event.id, sessionId, command, respEncoded, vid, pid, sn, function (result) {
            if (result && result.status === 200 && command === 'OPENSESSION') {
              var idx = findIdx(vid, pid, sn);
              if (idx !== -1) {
                hidDiscoveredList[idx].sessionId = sessionId;
                setLS('hidDiscoveredList', JSON.stringify(hidDiscoveredList));
              }
            }
          });
        } else {
          i++;
          setTimeout(next, 0);
        }
      };

      if (hidBrowserSupported) {
        hidGetResponse(vid, pid, sn, effective, data, onResp);
      } else {
        getNonHidResponse(vid, pid, sn, effective, data).then(onResp).catch(function () { onResp(undefined); });
      }
    }
    next();
  }

  function handleEventData(raw) {
    var event;
    try { event = JSON.parse(raw); } catch (_) { return; }

    var command = String(event.command || '');
    var sessionId = String(event.sessionId || '');
    var remote = String(event.remoteHostId || '');
    var remoteName = String(event.address || '');
    var processVid, processPid, processSn;

    if (sessionId && event.id && command !== 'SSESOURCECREATED' &&
        command !== 'WEBSOCKETSESSIONCREATED' && command !== 'ECHO') {
      latestEventIdBySession[sessionId] = String(event.id);
    }

    if (command === 'SSESOURCECREATED' || command === 'WEBSOCKETSESSIONCREATED') {
      remoteHost = sessionId;
      remoteHostId = remote;
      remoteHostName = remoteName;
      driverStatusCallback && driverStatusCallback('open');

      if (autoOpenSession && hidDiscoveredList.length > 0) {
        for (var i = 0; i < hidDiscoveredList.length; i++) {
          var d = hidDiscoveredList[i];
          parameterList.push({ action: 'connected', data: { vid: d.vendorId, pid: d.productId, sn: d.serialNumber } });
        }
        handlePlugParameterList();
      }
      return;
    }

    if (command === 'ECHO') {
      if (remote && remote !== remoteHostId) {
        remoteHostId = remote;
        if (remoteName) remoteHostName = remoteName;
      }
      return;
    }

    if (command === 'OPENSESSION') {
      var parts = sessionId.split(',');
      processVid = (parts[0] || '').trim();
      processPid = (parts[1] || '').trim();
      processSn  = (parts[2] || '').trim();
      sessionId  = (parts[3] || '').trim();
    }

    if (command === 'GETRESPONSE' || command === 'SHOWGUI') {
      setLS('lastMessageReceived', JSON.stringify(event));
      var idx = -1;
      for (var k = 0; k < hidDiscoveredList.length; k++) {
        if (hidDiscoveredList[k].sessionId === sessionId) { idx = k; break; }
      }
      if (idx !== -1) {
        processVid = String(hidDiscoveredList[idx].vendorId);
        processPid = String(hidDiscoveredList[idx].productId);
        processSn  = hidDiscoveredList[idx].serialNumber;
      }

      if (command === 'SHOWGUI') {
        if (!event.data) return;
        var guiData;
        try { guiData = JSON.parse(event.data); } catch (e) { console.error(e); return; }

        if (guiData.action === 'SHOW_PASSWORD_GUI') {
          fpPasswordModal.show({
            action:       guiData.action,
            title:        guiData.title  || 'Password Verification Required',
            prompt:       guiData.prompt || 'Please enter the password for your InnaITKey.',
            id:           event.id || '',
            sessionId:    sessionId,
            command:      command,
            vid:          Number(processVid) || 0,
            pid:          Number(processPid) || 0,
            serialNumber: processSn || '',
            remoteHostId: remoteHostId,
            onClose: function () {},
          });
        } else if (guiData.action === 'SHOW_FACE_GUI') {

          enqueueProcessResponse(event.id || '', sessionId, command, '',
            Number(processVid) || 0, Number(processPid) || 0, processSn || '', function () {});
        } else if (guiData.action === 'SHOW_FINGERPRINT_RESULT') {



          var wasEnrollResult = String(guiData.title || guiData.prompt || '')
            .toLowerCase().indexOf('enroll') !== -1;
          fpModal.success(
            wasEnrollResult ? 'Fingerprint enrolled successfully'
                            : 'Fingerprint verified successfully',
            wasEnrollResult ? 'The fingerprint is now stored on your InnaITKey.'
                            : ''
          );
          removeLS('lastMessageReceived');
          setTimeout(function () {
            enqueueProcessResponse(event.id || '', sessionId, command, '',
              Number(processVid) || 0, Number(processPid) || 0, processSn || '', function () {});
          }, 250);
        } else {


          var isEnroll = String(guiData.title || '').toLowerCase().indexOf('enroll') !== -1;
          fpModal.show({
            action:     guiData.action,
            title:      guiData.title,
            prompt:     guiData.prompt,
            percentage: guiData.percentage || 0,
            productId:  processPid,
            isEnroll:   isEnroll,
            onClose:    function () {},
          });
          removeLS('lastMessageReceived');

          setTimeout(function () {
            enqueueProcessResponse(event.id || '', sessionId, command, '',
              Number(processVid) || 0, Number(processPid) || 0, processSn || '', function () {});
          }, 250);
        }
        return;
      }
    }

    if (command === 'OPENSESSION' || command === 'GETRESPONSE') {
      setLS('lastMessageReceived', JSON.stringify(event));
      if (event.data) {
        transmitAndRespond(event, sessionId, command, Number(processVid) || 0, Number(processPid) || 0, processSn);
      } else {
        enqueueProcessResponse(event.id || '', sessionId, command, '',
          Number(processVid) || 0, Number(processPid) || 0, processSn || '', function (result) {
            if (result && result.status === 200 && command === 'OPENSESSION') {
              var idx2 = findIdx(Number(processVid), Number(processPid), processSn);
              if (idx2 !== -1) {
                hidDiscoveredList[idx2].sessionId = sessionId;
                setLS('hidDiscoveredList', JSON.stringify(hidDiscoveredList));
              }
            }
          });
      }
    }
  }

  function handleSSEOpen() {
    var stored = getLS('hidDiscoveredList');
    if (stored) { try { hidDiscoveredList = JSON.parse(stored); } catch (_) {} }
    if (autoOpenSession) handlePlugParameterList();
    handleUnplugParameterList();
    driverStatusCallback && driverStatusCallback('SSE_OPEN');
  }

  var sseRetry = 0;
  function handleSSEError() {
    // No retry: a single createSSE/SSE failure surfaces the error immediately.
    // (Previously retried up to 10× with exponential backoff.)
    sseRetry = 0;
    driverStatusCallback && driverStatusCallback('SSE_ERROR');
  }


  function init(encryptionType, eventType, driverStatus, authenticatorStatus, _siCProvisionSupported, enabledAutoOpenSession, forcedHidSupport) {
    if (deviceHandlerInitCalled) return;
    deviceHandlerInitCalled = true;

    deviceEncryptionType = encryptionType || 'CRYPTO_NONE';
    deviceEventType      = String(eventType || '1');
    driverStatusCallback        = driverStatus || null;
    authenticatorStatusCallback = authenticatorStatus || null;
    autoOpenSession   = enabledAutoOpenSession !== false;
    hidBrowserSupported = (forcedHidSupport != null) ? forcedHidSupport : ('hid' in navigator);

    removeLS('hidDiscoveredList');
    hidDiscoveredList = [];

    if (deviceEventType === '1') {
      EventSourceService.initialize(driver_serverEventSourceUrl, deviceEncryptionType, null,
        handleSSEOpen, handleEventData, handleSSEError);
    } else if (deviceEventType === '2') {
      initializeWebSocket(driver_serverWsUrl, deviceEncryptionType, handleSSEOpen, handleEventData, handleSSEError);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (EventSourceService.isOpen()) return;
      sseRetry = 0;
      if (deviceEventType === '1') {
        EventSourceService.initialize(driver_serverEventSourceUrl, deviceEncryptionType, null,
          handleSSEOpen, handleEventData, handleSSEError);
      }
    });

    if (hidBrowserSupported) initializeHidDriver(devicePluggedIn, devicePluggedOut);
    else                     initializeNonHidDriver(devicePluggedIn, devicePluggedOut);
  }

  function initNonWebHidDriver() {

    if (!hidBrowserSupported) initializeNonHidDriver(devicePluggedIn, devicePluggedOut);
  }


  function getList()          { return hidDiscoveredList.filter(function (d) { return d.deviceData !== undefined; }); }
  function getConnectedList() { return hidDiscoveredList.slice(); }
  function getDeviceInfo(sn)  { var d = findBy(sn); return d ? d.deviceInfo : undefined; }
  function getDeviceData(sn)  { var d = findBy(sn); return d ? d.deviceData : undefined; }

  function findBy(val) {
    return hidDiscoveredList.find(function (d) { return d.sessionId === val || d.serialNumber === val; }) || null;
  }



  function dismissFpModal() {
    fpModal.hide();
    fpPasswordModal.hide();
  }



  var _activeSerial = null;
  function setActive(serialNumber) { _activeSerial = serialNumber || null; }
  function clearActive()           { _activeSerial = null; }

  g.deviceHandler = {
    init:                init,
    initNonWebHidDriver: initNonWebHidDriver,
    getList:             getList,
    getConnectedList:    getConnectedList,
    getDeviceInfo:       getDeviceInfo,
    getDeviceData:       getDeviceData,
    dismissFpModal:      dismissFpModal,
    setActive:           setActive,
    clearActive:         clearActive,
  };



  Object.defineProperty(g.deviceHandler, 'serialNumber', {
    get: function () { return _activeSerial; },
    enumerable: true,
  });
  Object.defineProperty(g.deviceHandler, 'deviceInfo', {
    get: function () { return _activeSerial ? getDeviceInfo(_activeSerial) : undefined; },
    enumerable: true,
  });
  Object.defineProperty(g.deviceHandler, 'deviceData', {
    get: function () { return _activeSerial ? getDeviceData(_activeSerial) : undefined; },
    enumerable: true,
  });
})(window);
