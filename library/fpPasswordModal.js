(function (g) {
  var ROOT_ID  = 'innait-fppw-modal';

  function build() {
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="ifp-card">' +
        '<div class="ifp-head"><h3 class="ifp-title"></h3><button class="ifp-x" type="button" aria-label="Close">✕</button></div>' +
        '<div class="ifp-body">' +
          '<div class="ifp-prompt"></div>' +
          '<input class="ifp-input" type="password" placeholder="Enter device password" autocomplete="off" />' +
          '<div class="ifp-err"></div>' +
        '</div>' +
        '<div class="ifp-actions">' +
          '<button class="ifp-cancel" type="button">Cancel</button>' +
          '<button class="ifp-submit" type="button">Submit</button>' +
        '</div>' +
      '</div>';
    return root;
  }

  function show(opts) {
    var root = document.getElementById(ROOT_ID);
    if (!root) { root = build(); document.body.appendChild(root); }

    root.querySelector('.ifp-title').textContent  = opts.title  || 'Password Verification';
    root.querySelector('.ifp-prompt').textContent = opts.prompt || 'Please enter the password for your InnaITKey.';
    var input  = root.querySelector('.ifp-input');
    var err    = root.querySelector('.ifp-err');
    var submit = root.querySelector('.ifp-submit');
    var cancel = root.querySelector('.ifp-cancel');
    var close  = root.querySelector('.ifp-x');
    input.value = '';
    err.textContent = '';

    function cleanup() { hide(); if (opts.onClose) opts.onClose(); }


    function onCancel() {
      removeLS('lastMessageReceived');
      FetchApi.processResponse(opts.id, opts.sessionId, opts.command, '', opts.vid, opts.pid, opts.serialNumber, opts.remoteHostId, function () { cleanup(); });
    }

    submit.onclick = function () {
      var pw = input.value || '';
      if (!pw) { err.textContent = 'Password is required.'; return; }
      submit.disabled = true;
      err.textContent = '';

      var encoded = base64url.encode(new TextEncoder().encode(pw));
      removeLS('lastMessageReceived');
      FetchApi.processResponse(opts.id, opts.sessionId, opts.command, encoded, opts.vid, opts.pid, opts.serialNumber, opts.remoteHostId, function (res) {
        submit.disabled = false;
        if (res && res.status === 200) {
          cleanup();
        } else {
          err.textContent = (res && res.errorMessage) || 'Verification failed';
        }
      });
    };
    cancel.onclick = onCancel;
    close.onclick  = onCancel;

    input.onkeydown = function (e) { if (e.key === 'Enter') submit.click(); };

    root.style.display = 'flex';
    setTimeout(function () { input.focus(); }, 50);
  }

  function hide() {
    var root = document.getElementById(ROOT_ID);
    if (root) root.style.display = 'none';
  }

  g.fpPasswordModal = { show: show, hide: hide };
})(window);
