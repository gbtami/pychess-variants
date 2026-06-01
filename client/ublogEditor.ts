import { Editor } from '@toast-ui/editor';

function getSanitizedMarkdown(editor: Editor): string {
    return editor
        .getMarkdown()
        .replace(/<br>/g, '')
        .replace(/\n\s*#\s/g, '\n## ');
}

export function initUblogEditor(): void {
    const markdownField = document.getElementById('ublog-form-markdown') as HTMLTextAreaElement | null;
    const editorRoot = document.querySelector<HTMLElement>('.markdown-toastui');
    if (!markdownField || !editorRoot) return;

    const theme = document.body.dataset.theme === 'dark' ? 'dark' : undefined;
    const editor = new Editor({
        el: editorRoot,
        usageStatistics: false,
        height: '60vh',
        initialValue: markdownField.value || '',
        initialEditType: 'wysiwyg',
        hideModeSwitch: false,
        toolbarItems: [
            ['heading', 'bold', 'italic', 'strike'],
            ['hr', 'quote'],
            ['ul', 'ol'],
            ['table', 'link'],
            ['code', 'codeblock'],
            ['scrollSync'],
        ],
        autofocus: false,
        ...(theme ? { theme } : {}),
    });

    const sync = () => {
        markdownField.value = getSanitizedMarkdown(editor);
    };

    sync();
    editor.on('change', sync);
    markdownField.classList.add('ublog-post-form__markdown-source');
}
