var driver_serverApiUrl = 'https://10.225.247.17';
var driver_projectId    = 'innaitidam';
var driver_clientId     = '6ac39a1ec2e8251e3ad5ad68'; 
var driver_clientSecret = 'jfom-iOM_tkCZ3uGccr-T1zA-1XFaabSLYq4ZBJgW60';
var driver_redirectUri  = 'https://10.225.247.17/Home';

var driver_serverEventSourceUrl;
var driver_serverWsUrl;
var driver_serverBase;

(function init() {
  function trimRight(s) { return String(s || '').replace(/\/+$/, ''); }
  if (!driver_serverApiUrl) driver_serverApiUrl = window.location.origin;

  driver_serverBase = trimRight(driver_serverApiUrl);
  driver_serverEventSourceUrl = driver_serverBase + '/app/device/createSSESource';
  driver_serverWsUrl          = driver_serverBase.replace(/^http/, 'ws') + '/ws';
})();
