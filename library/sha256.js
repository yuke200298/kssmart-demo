/*
 * Standalone SHA-256 — pure JavaScript, no dependencies.
 * IE 11+ compatible. Synchronous (no Promises).
 *
 * Exposes: sha256.digest(str) → Uint8Array(32) of the digest bytes.
 *
 * Based on FIPS 180-4. Public-domain reference implementation, hand-written
 * for compactness and IE 11 compatibility.
 */
(function (g) {
  var K = [
    0x428a2f98|0, 0x71374491|0, 0xb5c0fbcf|0, 0xe9b5dba5|0,
    0x3956c25b|0, 0x59f111f1|0, 0x923f82a4|0, 0xab1c5ed5|0,
    0xd807aa98|0, 0x12835b01|0, 0x243185be|0, 0x550c7dc3|0,
    0x72be5d74|0, 0x80deb1fe|0, 0x9bdc06a7|0, 0xc19bf174|0,
    0xe49b69c1|0, 0xefbe4786|0, 0x0fc19dc6|0, 0x240ca1cc|0,
    0x2de92c6f|0, 0x4a7484aa|0, 0x5cb0a9dc|0, 0x76f988da|0,
    0x983e5152|0, 0xa831c66d|0, 0xb00327c8|0, 0xbf597fc7|0,
    0xc6e00bf3|0, 0xd5a79147|0, 0x06ca6351|0, 0x14292967|0,
    0x27b70a85|0, 0x2e1b2138|0, 0x4d2c6dfc|0, 0x53380d13|0,
    0x650a7354|0, 0x766a0abb|0, 0x81c2c92e|0, 0x92722c85|0,
    0xa2bfe8a1|0, 0xa81a664b|0, 0xc24b8b70|0, 0xc76c51a3|0,
    0xd192e819|0, 0xd6990624|0, 0xf40e3585|0, 0x106aa070|0,
    0x19a4c116|0, 0x1e376c08|0, 0x2748774c|0, 0x34b0bcb5|0,
    0x391c0cb3|0, 0x4ed8aa4a|0, 0x5b9cca4f|0, 0x682e6ff3|0,
    0x748f82ee|0, 0x78a5636f|0, 0x84c87814|0, 0x8cc70208|0,
    0x90befffa|0, 0xa4506ceb|0, 0xbef9a3f7|0, 0xc67178f2|0
  ];

  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }

  function utf8Bytes(str) {
    var utf8 = unescape(encodeURIComponent(String(str == null ? '' : str)));
    var arr = new Array(utf8.length);
    for (var i = 0; i < utf8.length; i++) arr[i] = utf8.charCodeAt(i);
    return arr;
  }

  function digest(msgString) {
    var msg = utf8Bytes(msgString);
    var L = msg.length;
    var bitLen = L * 8;

    // Append 0x80, pad with zeros until length % 64 === 56
    msg.push(0x80);
    while ((msg.length % 64) !== 56) msg.push(0);

    // Append 64-bit big-endian length (we only fill the low 32 bits — payload
    // < 2^32 bits is more than enough for any SDK request)
    msg.push(0); msg.push(0); msg.push(0); msg.push(0);
    msg.push((bitLen >>> 24) & 0xff);
    msg.push((bitLen >>> 16) & 0xff);
    msg.push((bitLen >>> 8)  & 0xff);
    msg.push(bitLen & 0xff);

    var H = [
      0x6a09e667|0, 0xbb67ae85|0, 0x3c6ef372|0, 0xa54ff53a|0,
      0x510e527f|0, 0x9b05688c|0, 0x1f83d9ab|0, 0x5be0cd19|0
    ];

    var W = new Array(64);
    for (var i = 0; i < msg.length; i += 64) {
      for (var j = 0; j < 16; j++) {
        W[j] = (msg[i + j*4] << 24) | (msg[i + j*4 + 1] << 16) |
               (msg[i + j*4 + 2] << 8) | msg[i + j*4 + 3];
      }
      for (j = 16; j < 64; j++) {
        var s0 = rotr(7, W[j-15]) ^ rotr(18, W[j-15]) ^ (W[j-15] >>> 3);
        var s1 = rotr(17, W[j-2]) ^ rotr(19, W[j-2]) ^ (W[j-2] >>> 10);
        W[j] = (W[j-16] + s0 + W[j-7] + s1) | 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3],
          e = H[4], f = H[5], gg = H[6], h = H[7];

      for (j = 0; j < 64; j++) {
        var S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        var ch = (e & f) ^ (~e & gg);
        var t1 = (h + S1 + ch + K[j] + W[j]) | 0;
        var S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = gg; gg = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }

      H[0] = (H[0] + a)  | 0; H[1] = (H[1] + b)  | 0;
      H[2] = (H[2] + c)  | 0; H[3] = (H[3] + d)  | 0;
      H[4] = (H[4] + e)  | 0; H[5] = (H[5] + f)  | 0;
      H[6] = (H[6] + gg) | 0; H[7] = (H[7] + h)  | 0;
    }

    var out = new Uint8Array(32);
    for (var k = 0; k < 8; k++) {
      out[k*4]   = (H[k] >>> 24) & 0xff;
      out[k*4+1] = (H[k] >>> 16) & 0xff;
      out[k*4+2] = (H[k] >>> 8)  & 0xff;
      out[k*4+3] =  H[k]         & 0xff;
    }
    return out;
  }

  g.sha256 = { digest: digest };
})(window);
