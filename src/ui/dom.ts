export function $<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`#${id} not found`);
	return el as T;
}

export function shuffle<T>(a: readonly T[]): T[] {
	const r = a.slice();
	for (let i = r.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[r[i], r[j]] = [r[j], r[i]];
	}
	return r;
}

export function pickN<T>(arr: readonly T[], n: number, exclude: readonly T[] = []): T[] {
	return shuffle(arr.filter((x) => !exclude.includes(x))).slice(0, n);
}

export function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/** Two-state button bound to aria-pressed. */
export function toggleButton(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLButtonElement {
	const b = document.createElement('button');
	b.className = 'chipbtn';
	b.textContent = label;
	b.setAttribute('aria-pressed', String(initial));
	b.addEventListener('click', () => {
		const on = b.getAttribute('aria-pressed') !== 'true';
		b.setAttribute('aria-pressed', String(on));
		onChange(on);
	});
	return b;
}
