var driver_serverApiUrl = 'https://bio-poc.innait.com/idam-gateway';
var driver_projectId    = 'idam';
var driver_clientId     = '6223166dcc0fa34dc820d5c5';
var driver_clientSecret = '0C60232B9535EAB47E7FB54F67D4DA854DC09D3B98E224A252BF12569935AC5D';
var driver_redirectUri  = 'https://bio-poc.innait.com/Home';

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
