// Markup pipeline mirroring gogs internal/markup: markdown render → post
// process (mentions, #123, sha links, relative URLs) → HTML sanitize
// (bluemonday UGC-style whitelist).
import { Marked } from 'marked';
import { conf } from './conf.js';
import { shortSHA1 } from './gotemplate/funcs.js';
const marked = new Marked({ gfm: true, breaks: false });
export function isMarkdownFile(name) {
    const lower = String(name).toLowerCase();
    return conf.markdownFileExtensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}
export function isReadmeFile(name) {
    return String(name).toLowerCase().startsWith('readme');
}
export function isIPythonNotebook(name) {
    return String(name).toLowerCase().endsWith('.ipynb');
}
function cutoutVerbosePrefix(urlPrefix) {
    // gogs cutoutVerbosePrefix: keep 3+subpathDepth leading slashes worth of path
    const count = 3 + conf.subpathDepth;
    const parts = urlPrefix.split('/');
    if (parts.length > count) {
        return parts.slice(0, count).join('/');
    }
    return urlPrefix;
}
export function renderIssueIndexPattern(text, urlPrefix, metas) {
    if (!metas || !metas['repoLink'])
        return text;
    const prefix = cutoutVerbosePrefix(urlPrefix);
    if (metas['style'] === 'alphanumeric') {
        return text.replace(/(\s|^|\W)([A-Z]{1,10}-\d+)/g, (m, pre, ref) => {
            if (metas['format']) {
                return `${pre}<a href="${metas['format'].replace('{user}', metas['user'] ?? '').replace('{repo}', metas['repo'] ?? '').replace('{index}', ref)}">${ref}</a>`;
            }
            return `${pre}<a href="${prefix}/issues/${ref}">${ref}</a>`;
        });
    }
    return text.replace(/(\s|^|\W)#(\d+)\b/g, (m, pre, num) => {
        if (metas['format']) {
            return `${pre}<a href="${metas['format'].replace('{user}', metas['user'] ?? '').replace('{repo}', metas['repo'] ?? '').replace('{index}', num)}">#${num}</a>`;
        }
        return `${pre}<a href="${prefix}/issues/${num}">#${num}</a>`;
    });
}
function renderSpecialLink(text, urlPrefix, metas) {
    let out = text;
    // @mention (only when viewing a repo context or site-wide: gogs uses subpath links)
    out = out.replace(/(\s|^|\W)@([0-9a-zA-Z-_.]+)/g, (m, pre, user) => {
        return `${pre}<a href="${conf.subpath}/${user}">@${user}</a>`;
    });
    out = renderIssueIndexPattern(out, urlPrefix, metas);
    // cross-repo refs owner/repo#123
    out = out.replace(/(\s|^|\W)([0-9a-zA-Z-_.]+)/, (m) => m); // keep (no-op, cross handled by issue pattern with full links)
    // sha1 refs
    if (metas && metas['repoLink']) {
        out = out.replace(/\b[0-9a-f]{7,40}\b/g, (sha) => {
            if (/^\d+$/.test(sha))
                return sha;
            return `<a href="${metas['repoLink']}/commit/${sha}"><code>${shortSHA1(sha)}</code></a>`;
        });
    }
    return out;
}
const isAbsoluteURL = (u) => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(u) || u.startsWith('mailto:') || u.startsWith('#') || u.startsWith('data:');
/** Post-process: relative link completion + special links in text nodes only. */
export function postProcessHTML(html, urlPrefix, metas) {
    urlPrefix = urlPrefix.replaceAll(' ', '%20').replace(/\/+$/, '');
    const prefix = cutoutVerbosePrefix(urlPrefix);
    const toks = [];
    let i = 0;
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt < 0) {
            toks.push({ kind: 'text', value: html.slice(i) });
            break;
        }
        if (lt > i)
            toks.push({ kind: 'text', value: html.slice(i, lt) });
        // tag ends at next '>' respecting quoted attrs
        let j = lt + 1;
        let inQuote = null;
        while (j < html.length) {
            const ch = html[j];
            if (inQuote) {
                if (ch === inQuote)
                    inQuote = null;
            }
            else if (ch === '"' || ch === "'") {
                inQuote = ch;
            }
            else if (ch === '>')
                break;
            j++;
        }
        toks.push({ kind: 'tag', value: html.slice(lt, j + 1) });
        i = j + 1;
    }
    let skipDepth = 0; // inside a/code/pre
    const out = [];
    const stack = [];
    for (const tok of toks) {
        if (tok.kind === 'tag') {
            const m = /^<\s*(\/?)\s*([a-zA-Z0-9]+)/.exec(tok.value);
            if (m) {
                const closing = m[1] === '/';
                const tag = m[2].toLowerCase();
                if (!closing) {
                    if (tag === 'a' || tag === 'code' || tag === 'pre')
                        skipDepth++;
                    // complete relative href/src; image src via /raw/
                    if (tag === 'img') {
                        tok.value = tok.value.replace(/src="([^"]*)"/g, (mm, src) => {
                            if (isAbsoluteURL(src))
                                return mm;
                            const fixed = urlPrefix.replace('/src/', '/raw/') + '/' + src.replaceAll(' ', '%20');
                            return `src="${fixed}"`;
                        });
                    }
                    else if (tag === 'a') {
                        tok.value = tok.value.replace(/href="([^"]*)"/g, (mm, href) => {
                            if (isAbsoluteURL(href))
                                return mm;
                            return `href="${prefix}/${href}"`;
                        });
                    }
                }
                else {
                    if (tag === 'a' || tag === 'code' || tag === 'pre')
                        skipDepth = Math.max(0, skipDepth - 1);
                }
            }
            out.push(tok.value);
        }
        else {
            if (skipDepth > 0) {
                out.push(tok.value);
            }
            else {
                out.push(renderSpecialLink(tok.value, urlPrefix, metas));
            }
        }
    }
    return out.join('');
}
// ---------------------------------------------------------------- sanitizer
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'col']);
const ALLOWED_TAGS = new Set([
    'a', 'abbr', 'acronym', 'b', 'blockquote', 'br', 'code', 'caption', 'col', 'colgroup',
    'dd', 'del', 'details', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'small',
    'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot',
    'th', 'thead', 'tr', 'u', 'ul', 'var', 'figure', 'figcaption', 'input',
]);
const GLOBAL_ATTRS = new Set(['title']);
const TAG_ATTRS = {
    a: new Set(['href', 'rel']),
    img: new Set(['src', 'alt', 'width', 'height']),
    th: new Set(['align', 'colspan', 'rowspan']),
    td: new Set(['align', 'colspan', 'rowspan']),
    col: new Set(['align', 'span']),
    input: new Set(['type', 'checked', 'disabled']),
    code: new Set(['class']),
    span: new Set(['class']),
    details: new Set(['open']),
    ol: new Set(['start']),
};
function escapeHTMLAttr(s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&#34;').replaceAll("'", '&#39;');
}
function sanitizeText(s) {
    return s.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function allowedDataImage(src) {
    const m = /^data:image\/(png|jpeg|gif|webp|x-icon);/i.exec(src);
    return !!m;
}
/** bluemonday UGCPolicy-equivalent whitelist sanitizer. */
export function sanitizeHTML(html) {
    // remove script/style blocks entirely (tags + content), like bluemonday
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    let out = '';
    let i = 0;
    const stack = [];
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt < 0) {
            out += sanitizeText(html.slice(i));
            break;
        }
        out += sanitizeText(html.slice(i, lt));
        let j = lt + 1;
        let inQuote = null;
        while (j < html.length) {
            const ch = html[j];
            if (inQuote) {
                if (ch === inQuote)
                    inQuote = null;
            }
            else if (ch === '"' || ch === "'") {
                inQuote = ch;
            }
            else if (ch === '>')
                break;
            j++;
        }
        if (j >= html.length) {
            // unterminated tag: escape rest
            out += sanitizeText(html.slice(lt));
            break;
        }
        const rawTag = html.slice(lt, j + 1);
        out += sanitizeTag(rawTag, stack);
        i = j + 1;
    }
    return out;
    function sanitizeTag(tag, st) {
        const m = /^<\s*(\/?)\s*([a-zA-Z0-9]+)([\s\S]*?)(\/?)\s*>$/.exec(tag);
        if (!m)
            return '';
        const closing = m[1] === '/';
        const name = m[2].toLowerCase();
        if (!ALLOWED_TAGS.has(name))
            return '';
        if (closing) {
            const idx = st.lastIndexOf(name);
            if (idx >= 0) {
                // close intermediate unclosed tags for well-formedness
                let closed = '';
                for (let k = st.length - 1; k >= idx; k--) {
                    if (!VOID_TAGS.has(st[k]))
                        closed += `</${st[k]}>`;
                }
                st.splice(idx);
                return closed;
            }
            return '';
        }
        // attributes
        const attrStr = m[3];
        const allowedAttrs = new Set([...GLOBAL_ATTRS, ...(TAG_ATTRS[name] ?? [])]);
        const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'|([a-zA-Z-]+)/g;
        let am;
        let attrs = '';
        while ((am = attrRe.exec(attrStr))) {
            const aname = (am[1] ?? am[3] ?? am[5] ?? '').toLowerCase();
            const avalue = am[2] ?? am[4] ?? '';
            if (!allowedAttrs.has(aname))
                continue;
            if (aname === 'href' || aname === 'src') {
                const url = avalue.trim();
                if (aname === 'src' && url.startsWith('data:')) {
                    if (!allowedDataImage(url))
                        continue;
                }
                else {
                    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
                    const allowedSchemes = new Set(['http', 'https', 'mailto', 'ftp', ...conf.customURLSchemes]);
                    if (scheme && !allowedSchemes.has(scheme[1].toLowerCase()))
                        continue;
                    if (!scheme && url.startsWith('//'))
                        continue;
                    if (url.toLowerCase().startsWith('javascript:'))
                        continue;
                }
                attrs += ` ${aname}="${escapeHTMLAttr(avalue)}"`;
            }
            else if (aname === 'class') {
                if (!/^language-[a-zA-Z0-9]+$/.test(avalue) && name === 'code')
                    continue;
                if (name === 'span' && !/^(language-[a-zA-Z0-9]+|math|mermaid)$/.test(avalue))
                    continue;
                attrs += ` class="${escapeHTMLAttr(avalue)}"`;
            }
            else if (aname === 'rel') {
                continue; // rewritten below
            }
            else if (name === 'input') {
                if (aname === 'type' && avalue !== 'checkbox')
                    continue;
                attrs += ` ${aname}="${escapeHTMLAttr(avalue)}"`;
            }
            else if (aname === 'checked' || aname === 'disabled' || aname === 'open') {
                attrs += ` ${aname}`;
            }
            else {
                attrs += ` ${aname}="${escapeHTMLAttr(avalue)}"`;
            }
        }
        if (name === 'a')
            attrs += ' rel="nofollow"';
        if (VOID_TAGS.has(name)) {
            return `<${name}${attrs}${name === 'input' ? (attrs.includes('checked') ? ' checked' : '') : ''} />`.replace(/ \/>$/, ' />');
        }
        st.push(name);
        return `<${name}${attrs}>`;
    }
}
// ---------------------------------------------------------------- entry points
export function rawMarkdown(input, urlPrefix, metas) {
    const html = marked.parse(input, { async: false });
    return postProcessHTML(html, urlPrefix, metas);
}
export function markdown(input, urlPrefix, metas) {
    const rendered = rawMarkdown(input, urlPrefix, metas);
    return sanitizeHTML(rendered);
}
export function sanitizeBytes(input) {
    return sanitizeHTML(input);
}
export function htmlEscape(s) {
    return s.replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&#34;');
}
//# sourceMappingURL=markup.js.map