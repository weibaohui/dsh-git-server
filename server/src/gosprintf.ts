// goSprintf：Go fmt.Sprintf 子集，仅供 i18n 翻译插值使用。
// 从 gotemplate/engine.ts 抽出的自包含实现（模板引擎本体已随网页 UI 一并裁撤）。
// SafeHTML 兼容：不 import engine 的 SafeHTML 类，改为结构判断（{ html: string }），
// 避免反向依赖整个模板引擎。

export function isTrue(v: any): boolean {
  if (v == null || v === false) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v) ? true : false;
  if (typeof v === 'string' || v instanceof String) return String(v).length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0 || Object.getPrototypeOf(v) !== Object.prototype;
  return true;
}

function printPlain(v: any): string {
  // 用户拍板：嵌套 nil（容器整体打印时）也渲染空串，偏离 Go fmt 的 '<nil>'
  if (v == null) return '';
  // SafeHTML 结构判断：{ html: string } 直接取可信 HTML，不转义
  if (typeof v === 'object' && typeof (v as any).html === 'string') return (v as any).html;
  if (typeof v === 'string' || v instanceof String) return String(v);
  if (typeof v === 'number') return fmtNumber(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map((x) => printPlain(x)).join(' ') + ']';
  if (v instanceof Map) {
    const keys = Array.from(v.keys()).map(String).sort();
    return 'map[' + keys.map((k) => `${k}:${printPlain(v.get(k))}`).join(' ') + ']';
  }
  if (typeof v === 'object') {
    // Go struct: {v1 v2}
    return '{' + Object.values(v).map((x) => printPlain(x)).join(' ') + '}';
  }
  return String(v);
}

function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

export function goSprintf(format: string, args: any[]): string {
  let argIdx = 0;
  let out = '';
  let i = 0;
  while (i < format.length) {
    const c = format[i];
    if (c !== '%') {
      out += c;
      i++;
      continue;
    }
    // positional form: %[N]<verb> — sets the argument index for this verb only
    const posMatch = /^%\[(\d+)\]/.exec(format.slice(i));
    let positional = false;
    if (posMatch) {
      argIdx = Number(posMatch[1]) - 1;
      i += posMatch[0].length;
      positional = true;
    }
    // parse verb: %[-+ #0]*[0-9]*(\.[0-9]+)?[bdeEfFgGoOqxXscvU%]
    let j = positional ? i : i + 1;
    let flags = '';
    while (j < format.length && /[-+ #0]/.test(format[j])) {
      flags += format[j];
      j++;
    }
    let width = '';
    while (j < format.length && /[0-9]/.test(format[j])) {
      width += format[j];
      j++;
    }
    let prec = '';
    if (format[j] === '.') {
      j++;
      while (j < format.length && /[0-9]/.test(format[j])) {
        prec += format[j];
        j++;
      }
      if (prec === '') prec = '0';
    }
    const verb = format[j];
    if (verb === undefined) {
      out += '%';
      break;
    }
    if (verb === '%') {
      out += '%';
      i = j + 1;
      continue;
    }
    const arg = args[argIdx];
    argIdx = argIdx + 1;
    out += formatVerb(verb, flags, width, prec, arg);
    i = j + 1;
  }
  return out;
}

function formatVerb(verb: string, flags: string, width: string, prec: string, arg: any): string {
  let s: string;
  switch (verb) {
    case 's':
      s = arg == null ? '%!s(<nil>)' : printPlain(arg);
      if (prec !== '') s = s.slice(0, Number(prec));
      break;
    case 'd': {
      const n = Math.trunc(Number(arg));
      if (Number.isNaN(n)) s = `%!d(${printPlain(arg)})`;
      else s = String(n);
      break;
    }
    case 'x':
      s = typeof arg === 'string' ? Buffer.from(arg, 'utf8').toString('hex') : (Number(arg) >>> 0).toString(16);
      break;
    case 'X':
      s = typeof arg === 'string' ? Buffer.from(arg, 'utf8').toString('hex').toUpperCase() : (Number(arg) >>> 0).toString(16).toUpperCase();
      break;
    case 'f':
    case 'F': {
      const n = Number(arg);
      s = n.toFixed(prec === '' ? 6 : Number(prec));
      break;
    }
    case 'g':
      s = String(Number(arg));
      break;
    case 'q':
      s = JSON.stringify(printPlain(arg)) ?? '""';
      break;
    case 'v':
      s = printPlain(arg);
      break;
    case 't':
      s = String(isTrue(arg));
      break;
    default:
      s = `%!${verb}(${printPlain(arg)})`;
  }
  // width padding
  if (width) {
    const w = Number(width);
    if (s.length < w) {
      if (flags.includes('-')) s = s.padEnd(w);
      else if (flags.includes('0') && (verb === 'd' || verb === 'f')) {
        const neg = s.startsWith('-');
        s = neg ? '-' + s.slice(1).padStart(w - (neg ? 1 : 0), '0') : s.padStart(w, '0');
      } else s = s.padStart(w);
    }
  }
  return s;
}
