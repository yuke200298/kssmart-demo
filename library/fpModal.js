(function (g) {
  var ROOT_ID = 'innait-fp-modal';
  var ASSET_BASE = (g.driver_assetBase || 'library/assets').replace(/\/+$/, '');
  var FINGER_IMG = ASSET_BASE + '/finger.png';

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3.2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M5 13l4 4L19 7"/></svg>';

  function build() {
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="ifm-card">' +
        '<div class="ifm-head">' +
          '<h3 class="ifm-title"></h3>' +
          '<button class="ifm-x" type="button" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="ifm-body">' +
          '<div class="ifm-fp"><img class="ifm-fp-img" alt="Fingerprint" /></div>' +
          '<div class="ifm-prompt"></div>' +
          '<div class="ifm-pct">0%</div>' +
          '<div class="ifm-bar"><div style="width:0%"></div></div>' +
        '</div>' +
      '</div>';
    return root;
  }

  function setPercentage(root, pct) {
    var p = Math.max(0, Math.min(100, Number(pct) || 0));
    root.querySelector('.ifm-bar > div').style.width = p + '%';
    var label = root.querySelector('.ifm-pct');
    if (label) label.textContent = Math.round(p) + '%';
  }

  var _onClose = null;
  var _successTimer = null;

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = build();
      document.body.appendChild(root);
    }
    return root;
  }



  function resetBody(root) {
    if (_successTimer) { clearTimeout(_successTimer); _successTimer = null; }
    root.querySelector('.ifm-card').classList.remove('ifm-success');
    var body = root.querySelector('.ifm-body');
    body.innerHTML =
      '<div class="ifm-fp"><img class="ifm-fp-img" alt="Fingerprint" src="' + FINGER_IMG + '" /></div>' +
      '<div class="ifm-prompt"></div>' +
      '<div class="ifm-pct">0%</div>' +
      '<div class="ifm-bar"><div style="width:0%"></div></div>';
  }





  function show(opts) {
    var root = ensureRoot();
    var alreadyOpen = root.style.display && root.style.display !== 'none' &&
                      !root.querySelector('.ifm-card').classList.contains('ifm-success');
    if (alreadyOpen) { update(opts); return; }

    resetBody(root);
    _onClose = opts.onClose || null;

    root.querySelector('.ifm-title').textContent  = opts.title  || 'Fingerprint Verification';
    root.querySelector('.ifm-prompt').textContent = opts.prompt || 'Place your finger on the device to continue.';

    var bar = root.querySelector('.ifm-bar');
    var pct = root.querySelector('.ifm-pct');
    if (opts.isEnroll) {
      if (bar) bar.style.display = '';
      if (pct) pct.style.display = '';
      setPercentage(root, opts.percentage);
    } else {
      if (bar) bar.style.display = 'none';
      if (pct) pct.style.display = 'none';
    }

    root.querySelector('.ifm-x').onclick = function () { hide(); if (_onClose) _onClose(); };
    root.style.display = 'flex';
  }

  function update(opts) {
    var root = document.getElementById(ROOT_ID);
    if (!root || root.style.display === 'none') return;
    if (opts.title      != null) root.querySelector('.ifm-title').textContent  = opts.title;
    if (opts.prompt     != null) root.querySelector('.ifm-prompt').textContent = opts.prompt;
    if (opts.percentage != null) setPercentage(root, opts.percentage);



    if (opts.isEnroll != null) {
      var bar = root.querySelector('.ifm-bar');
      var pct = root.querySelector('.ifm-pct');
      var visible = opts.isEnroll ? '' : 'none';
      if (bar) bar.style.display = visible;
      if (pct) pct.style.display = visible;
    }
  }






  function success(arg, subtitleArg) {
    var title, subtitle;
    if (typeof arg === 'string') { title = arg; subtitle = subtitleArg || ''; }
    else if (arg && typeof arg === 'object') { title = arg.title; subtitle = arg.subtitle; }
    title    = title    || 'Success';
    subtitle = subtitle || '';

    var root = ensureRoot();
    if (_successTimer) { clearTimeout(_successTimer); _successTimer = null; }
    root.querySelector('.ifm-card').classList.add('ifm-success');

    root.querySelector('.ifm-title').textContent = 'Verified';

    var body = root.querySelector('.ifm-body');
    body.innerHTML =
      '<div class="ifm-check-tile">' + CHECK_SVG + '</div>' +
      '<div class="ifm-success-text">' +
        '<div class="ifm-success-title"></div>' +
        '<p class="ifm-success-sub"></p>' +
      '</div>' +
      '<span class="ifm-verified-badge">' +
        '<span class="ifm-verified-dot"></span>Verified' +
      '</span>';
    body.querySelector('.ifm-success-title').textContent = title;
    var subEl = body.querySelector('.ifm-success-sub');
    if (subtitle) { subEl.textContent = subtitle; }
    else          { subEl.style.display = 'none'; }

    root.querySelector('.ifm-x').onclick = function () { hide(); if (_onClose) _onClose(); };
    root.style.display = 'flex';

    _successTimer = setTimeout(function () {
      _successTimer = null;
      hide();
    }, 2000);
  }

  function hide() {
    if (_successTimer) { clearTimeout(_successTimer); _successTimer = null; }
    var root = document.getElementById(ROOT_ID);
    if (root) root.style.display = 'none';
  }

  g.fpModal = { show: show, update: update, success: success, hide: hide };
})(window);
