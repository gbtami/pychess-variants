type LikePayload = {
    ok: boolean;
    liked?: boolean;
    likes?: number;
};

function updateButton(button: HTMLButtonElement, liked: boolean, likes: number) {
    button.classList.toggle('ublog-post__like--liked', liked);
    button.title = liked ? 'Unlike' : 'Like';

    const count = button.querySelector('.ublog-post__like__nb');
    if (count) count.textContent = String(likes);

    const label = button.querySelector('.button-label');
    if (label) label.textContent = liked ? 'Unlike' : 'Like';
}

export function initUblogLike(): void {
    const forms = document.querySelectorAll<HTMLFormElement>('.ublog-post__like-form');
    if (forms.length === 0) return;

    forms.forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = form.querySelector<HTMLButtonElement>('.ublog-post__like');
            if (!button) return;
            if (button.dataset.busy === '1') return;
            button.dataset.busy = '1';

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                });
                if (!response.ok) throw new Error('like request failed');
                const payload = (await response.json()) as LikePayload;
                if (payload.ok !== true) throw new Error('invalid like payload');
                updateButton(button, !!payload.liked, Number(payload.likes || 0));
            } catch (_err) {
                form.submit();
                return;
            } finally {
                button.dataset.busy = '0';
            }
        });
    });
}
