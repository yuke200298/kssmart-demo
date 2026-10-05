/*
 * Polyfills for IE 11 support.
 *
 * Load this script BEFORE any SDK script (config.js, fetchApi.js, etc.).
 * Each polyfill is gated on feature detection — modern browsers skip them.
 */
(function () {

  // Object.assign (ES2015)
  if (typeof Object.assign !== 'function') {
    Object.assign = function (target) {
      if (target == null) throw new TypeError('Object.assign target cannot be null/undefined');
      var out = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (src != null) {
          for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
        }
      }
      return out;
    };
  }

  // Array.from (ES2015)
  if (typeof Array.from !== 'function') {
    Array.from = function (arrayLike) {
      var len = arrayLike.length || 0;
      var out = new Array(len);
      for (var i = 0; i < len; i++) out[i] = arrayLike[i];
      return out;
    };
  }

  // Array.prototype.find (ES2015)
  if (!Array.prototype.find) {
    Array.prototype.find = function (predicate) {
      for (var i = 0; i < this.length; i++) {
        if (predicate(this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }

  // Array.prototype.some (ES5 — IE 9+ has it, but defensive)
  if (!Array.prototype.some) {
    Array.prototype.some = function (predicate) {
      for (var i = 0; i < this.length; i++) {
        if (predicate(this[i], i, this)) return true;
      }
      return false;
    };
  }

  // String.prototype.padStart (ES2017)
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
      var result = String(this);
      padString = String(padString == null ? ' ' : padString);
      if (!padString.length) return result;
      while (result.length < targetLength) result = padString + result;
      return result.slice(-targetLength);
    };
  }

  // String.prototype.repeat (ES2015)
  if (!String.prototype.repeat) {
    String.prototype.repeat = function (count) {
      var s = String(this);
      var out = '';
      for (var i = 0; i < count; i++) out += s;
      return out;
    };
  }

  // Promise (ES2015) — minimal A+ compliant polyfill. Supports new Promise,
  // .then, .catch, Promise.resolve, Promise.reject. No Promise.all/race —
  // the SDK does not use them.
  if (typeof Promise === 'undefined') {
    function PromisePoly(executor) {
      var self = this;
      self._state = 'pending';
      self._value = undefined;
      self._callbacks = [];

      function resolve(value) {
        if (self._state !== 'pending') return;
        if (value && typeof value.then === 'function') { value.then(resolve, reject); return; }
        self._state = 'fulfilled';
        self._value = value;
        for (var i = 0; i < self._callbacks.length; i++) self._callbacks[i].onFulfilled(value);
        self._callbacks = null;
      }
      function reject(reason) {
        if (self._state !== 'pending') return;
        self._state = 'rejected';
        self._value = reason;
        for (var i = 0; i < self._callbacks.length; i++) self._callbacks[i].onRejected(reason);
        self._callbacks = null;
      }

      try { executor(resolve, reject); }
      catch (err) { reject(err); }
    }

    PromisePoly.prototype.then = function (onFulfilled, onRejected) {
      var self = this;
      return new PromisePoly(function (resolve, reject) {
        function handleFulfilled(value) {
          try {
            if (typeof onFulfilled === 'function') {
              var r = onFulfilled(value);
              if (r && typeof r.then === 'function') r.then(resolve, reject);
              else resolve(r);
            } else resolve(value);
          } catch (err) { reject(err); }
        }
        function handleRejected(reason) {
          try {
            if (typeof onRejected === 'function') {
              var r = onRejected(reason);
              if (r && typeof r.then === 'function') r.then(resolve, reject);
              else resolve(r);
            } else reject(reason);
          } catch (err) { reject(err); }
        }
        if (self._state === 'fulfilled')      setTimeout(function () { handleFulfilled(self._value); }, 0);
        else if (self._state === 'rejected')  setTimeout(function () { handleRejected(self._value); }, 0);
        else self._callbacks.push({ onFulfilled: handleFulfilled, onRejected: handleRejected });
      });
    };

    PromisePoly.prototype['catch'] = function (onRejected) {
      return this.then(undefined, onRejected);
    };

    PromisePoly.resolve = function (value) {
      return new PromisePoly(function (resolve) { resolve(value); });
    };
    PromisePoly.reject = function (reason) {
      return new PromisePoly(function (_, reject) { reject(reason); });
    };

    window.Promise = PromisePoly;
  }

})();
