import type { Focus } from '../viewer/model';
import { names, type AppContext, type Panel } from './context';
import { $ } from './dom';

const HINT = '<p class="hint">Tap a muscle on the model or in the list for origin, insertion, action, and nerve.</p>';
const MOVE_HINT = 'Movers stay lit; everything else fades.';

/** Movement demos, muscle info card, and the muscle list with show/hide. */
export class ExplorePanel implements Panel {
	focus: Focus | null = null;
	readonly allowsPicking = true;
	private selected: string | null = null;
	private readonly info = $('infoCard');
	private readonly note = $('moveNote');
	private readonly list = $('muscleList');

	constructor(private readonly ctx: AppContext) {
		this.buildMoves();
		this.buildList();
		this.renderInfo(null);
	}

	activate(): void {
		this.ctx.model.setFocus(this.focus);
	}

	onPick(hit: { muscle: string; part: string } | null): void {
		this.select(hit?.muscle ?? null, hit?.part);
	}

	select(key: string | null, part?: string): void {
		this.selected = key;
		this.list.querySelectorAll<HTMLElement>('.mrow').forEach((r) => r.classList.toggle('sel', r.dataset.k === key));
		this.renderInfo(key, part);
		this.note.textContent = MOVE_HINT;
		this.focus = key ? { muscles: [key] } : null;
		this.ctx.model.setFocus(this.focus);
	}

	private buildMoves(): void {
		const box = $('moves');
		for (const mv of this.ctx.joint.movements) {
			const b = document.createElement('button');
			b.className = 'btn';
			b.innerHTML = `${mv.label}<small>${mv.range}</small>`;
			b.addEventListener('click', () => {
				this.select(null);
				this.focus = { muscles: [...mv.prime, ...mv.assist] };
				this.ctx.model.setFocus(this.focus);
				this.note.innerHTML = `<b>${mv.label}.</b> Prime movers: <b>${names(this.ctx, mv.prime)}</b>. Assisting: ${names(this.ctx, mv.assist)}.`;
				void this.ctx.playMovement(mv);
			});
			box.append(b);
		}
	}

	private buildList(): void {
		let html = '<p class="eyebrow">Muscles</p>';
		let group = '';
		for (const m of this.ctx.joint.muscles) {
			if (m.group !== group) {
				if (group) html += '</div>';
				html += `<div class="group"><h3>${m.group}</h3>`;
				group = m.group;
			}
			html += `<div class="mrow" data-k="${m.key}"><span class="sw" style="background:${m.color}"></span>
				<button class="name" data-k="${m.key}">${m.name}</button>
				<button class="eye" data-k="${m.key}" aria-pressed="true" aria-label="Show ${m.name}">show</button></div>`;
		}
		this.list.innerHTML = html + '</div>';
		this.list.addEventListener('click', (e) => {
			const b = (e.target as HTMLElement).closest('button');
			if (!b) return;
			const k = b.dataset.k!;
			if (b.classList.contains('eye')) {
				const on = b.getAttribute('aria-pressed') !== 'true';
				b.setAttribute('aria-pressed', String(on));
				this.ctx.model.setMuscleVisible(k, on);
			} else this.select(this.selected === k ? null : k);
		});
	}

	private renderInfo(key: string | null, part?: string): void {
		if (!key) {
			this.info.innerHTML = HINT;
			return;
		}
		const m = this.ctx.muscle(key);
		const sub = m.heads && part ? `${m.heads[part]} selected · ${m.group}` : m.group;
		this.info.innerHTML = `<h2>${m.name}</h2><p class="sub">${sub}</p>
			<dl class="facts"><dt>Origin</dt><dd>${m.origin}</dd><dt>Insertion</dt><dd>${m.insertion}</dd>
			<dt>Action</dt><dd>${m.actionLong}</dd><dt>Nerve</dt><dd>${m.nerve}</dd></dl><p class="note">${m.note}</p>`;
	}
}
