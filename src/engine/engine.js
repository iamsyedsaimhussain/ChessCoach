// Stockfish 19 (lite, single-thread) running in a Web Worker.
// Files live in /public/engine and need no special server headers.
const ENGINE_URL = '/engine/stockfish-19-lite-single.js';

export function detectDefaultDepth() {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  const ram = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 2;
  if (cores <= 2 || ram <= 2) return 8;
  if (cores <= 4 || ram <= 3) return 10;
  return 12;
}

export function getAdaptiveMaxTime() {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
  return cores <= 2 ? 1800 : 3000;
}

export class Engine {
  constructor(url = ENGINE_URL) {
    this.url = url;
    this.w = null;
    this.ready = null;
    this.listeners = new Set();
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Engine took too long to load')), 40000);
      try {
        this.w = new Worker(this.url);
      } catch (e) {
        clearTimeout(timer);
        return reject(e);
      }
      this.w.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error('Engine failed to load' + (e && e.message ? ': ' + e.message : '')));
      };
      this.w.onmessage = (e) => {
        const text = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
        for (const line of String(text).split('\n')) {
          if (line) this.listeners.forEach((fn) => fn(line));
        }
      };
      this.cmd('uci', 'uciok')
        .then(() => {
          this.send('setoption name Hash value 16');
          this.send('setoption name Threads value 1');
          return this.cmd('isready', 'readyok');
        })
        .then(() => {
          clearTimeout(timer);
          resolve();
        });
    });
    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }

  send(s) {
    this.w.postMessage(s);
  }

  cmd(s, until) {
    return new Promise((res) => {
      const fn = (l) => {
        if (l.startsWith(until)) {
          this.listeners.delete(fn);
          res(l);
        }
      };
      this.listeners.add(fn);
      this.send(s);
    });
  }

  // Returns the score from White's point of view plus the best move.
  async analyse(fen, depth, maxTimeMs = getAdaptiveMaxTime()) {
    await this.start();
    const turn = fen.split(' ')[1];
    return new Promise((res) => {
      let last = null;
      let timeoutId = null;

      const fn = (l) => {
        if (l.startsWith('info') && l.includes(' score ') && !/bound/.test(l)) {
          const sc = l.match(/ score (cp|mate) (-?\d+)/);
          const pv = l.match(/ pv (\S+)/);
          if (sc) last = { type: sc[1], val: Number(sc[2]), pv: pv ? pv[1] : null };
        } else if (l.startsWith('bestmove')) {
          if (timeoutId) clearTimeout(timeoutId);
          this.listeners.delete(fn);
          const bm = l.split(' ')[1];
          const sign = turn === 'b' ? -1 : 1;
          let cp = 0;
          let mate = null;
          if (last) {
            if (last.type === 'cp') cp = last.val * sign;
            else {
              mate = last.val * sign;
              cp = Math.sign(mate) * (10000 - Math.abs(mate) * 10);
            }
          }
          res({ cp, mate, best: bm && bm !== '(none)' ? bm : null });
        }
      };

      this.listeners.add(fn);

      // On slow devices, stop search after maxTimeMs to prevent device freeze & thermal throttling
      if (maxTimeMs > 0) {
        timeoutId = setTimeout(() => {
          try {
            this.send('stop');
          } catch {}
        }, maxTimeMs);
      }

      this.send('position fen ' + fen);
      this.send('go depth ' + depth);
    });
  }
}

let shared = null;
export const getEngine = () => (shared ||= new Engine());
