// A tiny neural network that really trains in the browser: an MLP with tanh layers, mean-squared error and Adam.
// Small on purpose (a few thousand weights) so a policy trains in a second or two on the main thread.
export class MLP {
  constructor(sizes, rand = Math.random) {
    this.sizes = sizes; this.W = []; this.b = []; this.t = 0;
    for (let l = 0; l < sizes.length - 1; l++) {
      const n = sizes[l], m = sizes[l + 1], s = Math.sqrt(1 / n);
      this.W.push(Float64Array.from({ length: n * m }, () => (rand() * 2 - 1) * s)); this.b.push(new Float64Array(m));
    }
    const z = (a) => a.map((x) => new Float64Array(x.length));
    this.mW = z(this.W); this.vW = z(this.W); this.mb = z(this.b); this.vb = z(this.b);
  }
  forward(x, keep = null) {
    let a = x; if (keep) keep.push(a);
    for (let l = 0; l < this.W.length; l++) {
      const n = this.sizes[l], m = this.sizes[l + 1], W = this.W[l], out = new Float64Array(m), last = l === this.W.length - 1;
      for (let j = 0; j < m; j++) { let s = this.b[l][j]; for (let i = 0; i < n; i++) s += W[j * n + i] * a[i]; out[j] = last ? s : Math.tanh(s); }
      a = out; if (keep) keep.push(a);
    }
    return a;
  }
  // One Adam step on a batch of [x, y] pairs. Returns the mean squared error before the step.
  trainBatch(X, Y, lr = 1e-3) {
    const gW = this.W.map((w) => new Float64Array(w.length)), gb = this.b.map((b) => new Float64Array(b.length)); let loss = 0;
    for (let k = 0; k < X.length; k++) {
      const acts = []; const out = this.forward(X[k], acts);
      let delta = new Float64Array(out.length);
      for (let j = 0; j < out.length; j++) { const e = out[j] - Y[k][j]; loss += e * e / out.length; delta[j] = 2 * e / out.length; }
      for (let l = this.W.length - 1; l >= 0; l--) {
        const n = this.sizes[l], m = this.sizes[l + 1], a = acts[l], W = this.W[l], prev = new Float64Array(n);
        for (let j = 0; j < m; j++) { gb[l][j] += delta[j]; for (let i = 0; i < n; i++) { gW[l][j * n + i] += delta[j] * a[i]; prev[i] += delta[j] * W[j * n + i]; } }
        if (l > 0) for (let i = 0; i < n; i++) prev[i] *= 1 - a[i] * a[i];
        delta = prev;
      }
    }
    this.t++; const b1 = 0.9, b2 = 0.999, c1 = 1 - b1 ** this.t, c2 = 1 - b2 ** this.t, N = X.length;
    const upd = (p, g, m, v) => { for (let i = 0; i < p.length; i++) { const gi = g[i] / N; m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi; p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8); } };
    for (let l = 0; l < this.W.length; l++) { upd(this.W[l], gW[l], this.mW[l], this.vW[l]); upd(this.b[l], gb[l], this.mb[l], this.vb[l]); }
    return loss / N;
  }
  loss(X, Y) { let s = 0; for (let k = 0; k < X.length; k++) { const o = this.forward(X[k]); for (let j = 0; j < o.length; j++) s += (o[j] - Y[k][j]) ** 2 / o.length; } return s / X.length; }
}
export function shuffle(n, rand) { const idx = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx; }
