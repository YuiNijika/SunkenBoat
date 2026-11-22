import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import csharp from 'highlight.js/lib/languages/csharp';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('php', php);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

hljs.configure({ ignoreUnescapedHTML: true });

const ALIASES: Record<string, string> = {
    c: 'cpp',
    'c++': 'cpp',
    cs: 'csharp',
    html: 'xml',
    js: 'javascript',
    jsx: 'javascript',
    md: 'markdown',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    tsx: 'typescript',
    yml: 'yaml',
    zsh: 'bash',
};

/**
 * Typecho stores highlighted language hints as `language-*` classes. Unknown
 * hints are dropped so highlight.js falls back to auto detection instead of
 * warning for every custom fence name.
 */
export function highlightCode(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('pre code').forEach((code) => {
        if (code.dataset.highlighted === 'yes') {
            return;
        }

        for (const className of Array.from(code.classList)) {
            const languagePrefix = className.startsWith('language-')
                ? 'language-'
                : className.startsWith('lang-')
                  ? 'lang-'
                  : '';
            if (languagePrefix === '') {
                continue;
            }

            const raw = className.slice(languagePrefix.length).toLowerCase();
            const language = ALIASES[raw] ?? raw;
            code.classList.remove(className);
            if (language !== '' && hljs.getLanguage(language)) {
                code.classList.add(`language-${language}`);
            }
        }

        try {
            hljs.highlightElement(code);
        } catch {
            code.classList.add('hljs');
        }
    });
}
