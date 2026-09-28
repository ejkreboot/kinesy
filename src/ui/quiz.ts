import type { Movement, MuscleInfo } from '../joints/types';
import type { Focus } from '../viewer/model';
import type { AppContext, Panel } from './context';
import { $, pick, pickN, shuffle } from './dom';

export type QuizMode = 'mixed' | 'identify' | 'movers' | 'recall';

interface Question {
	type: 'Identify' | 'Recall' | 'Movers';
	text: string;
	options: string[];
	answer?: string;
	why?: string;
	/** highlighted while the question is open (identify) */
	focus?: Focus;
	/** highlighted once answered */
	reveal?: Focus | null;
	showAxes?: boolean;
	/** muscle key, to avoid repeats */
	key?: string;
	movement?: Movement;
	prime?: string[];
	assist?: string[];
}

type RecallField = 'nerve' | 'insertion' | 'action' | 'origin';
const FIELDS: [RecallField, string][] = [
	['nerve', 'Which nerve supplies'],
	['insertion', 'Where does it insert?'],
	['action', 'What is its main action?'],
	['origin', 'Where does it arise?']
];
const MIX: Exclude<QuizMode, 'mixed'>[] = ['identify', 'identify', 'recall', 'recall', 'movers'];

/** Identify / recall / movers questions generated from the joint's content. */
export class QuizPanel implements Panel {
	focus: Focus | null = null;
	private mode: QuizMode = 'mixed';
	private q: Question | null = null;
	private answered = false;
	private choice: string | null = null;
	private picked = new Set<string>();
	private feedback = '';
	private lastOk = false;
	private correct = 0;
	private total = 0;
	private streak = 0;
	private recent: string[] = [];
	private readonly box = $('quizBox');

	constructor(private readonly ctx: AppContext) {
		$('quizMode').addEventListener('click', (e) => {
			const b = (e.target as HTMLElement).closest('button');
			if (!b) return;
			this.mode = b.dataset.mode as QuizMode;
			$('quizMode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
			this.next();
		});
	}

	get allowsPicking(): boolean {
		return false;
	}

	activate(): void {
		if (!this.q) this.next();
		else this.render(false);
	}

	private get muscles(): MuscleInfo[] {
		return this.ctx.joint.muscles;
	}

	next(): void {
		const m = this.mode === 'mixed' ? pick(MIX) : this.mode;
		this.q = m === 'identify' ? this.identify() : m === 'recall' ? this.recall() : this.movers();
		if (this.q.key) this.recent = [this.q.key, ...this.recent].slice(0, 3);
		this.answered = false;
		this.choice = null;
		this.picked = new Set();
		this.render(true);
	}

	// ---- question builders ----------------------------------------------------------------

	private identify(): Question {
		const headed = this.muscles.filter((m) => m.heads);
		if (headed.length && Math.random() < 0.3) {
			const m = pick(headed);
			const parts = Object.keys(m.heads!);
			const part = pick(parts);
			const label = (p: string) => `${m.heads![p]} of ${m.shortName}`;
			const originLine = m.origin.split('. ').find((s) => s.startsWith(m.heads![part])) ?? '';
			return { type: 'Identify', text: 'Which head is highlighted?', options: shuffle(parts.map(label)), answer: label(part), focus: { parts: [part] }, why: `${m.heads![part]}: ${originLine}` };
		}
		const m = pick(this.muscles.filter((x) => !this.recent.includes(x.key)));
		const options = shuffle([m.name, ...pickN(this.muscles, 3, [m]).map((x) => x.name)]);
		return { type: 'Identify', text: 'Which muscle is highlighted?', options, answer: m.name, focus: { muscles: [m.key] }, why: `${m.name}: ${m.actionLong.toLowerCase()}.`, key: m.key };
	}

	private recall(): Question {
		const sc = this.ctx.joint.scenarios;
		if (sc.length && Math.random() < 0.45) {
			const s = pick(sc);
			const reveal = s.parts ? { parts: s.parts } : s.focus?.length ? { muscles: s.focus } : null;
			return { type: 'Recall', text: s.q, options: shuffle([s.a, ...s.distractors]), answer: s.a, why: s.why, reveal, showAxes: s.showAxes };
		}
		const m = pick(this.muscles.filter((x) => !this.recent.includes(x.key)));
		let [field, prompt] = pick(FIELDS);
		// multi-headed origins are too long to serve as options
		if (field === 'origin' && m.heads) [field, prompt] = ['insertion', 'Where does it insert?'];
		const text = field === 'nerve' ? `Which nerve supplies ${m.name.toLowerCase()}?` : `${m.name}: ${prompt.toLowerCase()}`;
		const pool = [...new Set(this.muscles.filter((x) => x !== m && !(field === 'origin' && x.heads)).map((x) => x[field]).filter((v) => v !== m[field]))];
		return { type: 'Recall', text, options: shuffle([m[field], ...pickN(pool, 3)]), answer: m[field], why: m.note, reveal: { muscles: [m.key] }, key: m.key };
	}

	private movers(): Question {
		const mv = pick(this.ctx.joint.movements);
		const name = (k: string) => this.ctx.muscle(k).name;
		return {
			type: 'Movers', text: `Watch the movement. Select all prime movers for ${mv.label.toLowerCase()}.`,
			options: this.muscles.map((m) => m.name), movement: mv, prime: mv.prime.map(name), assist: mv.assist.map(name)
		};
	}

	// ---- answering ------------------------------------------------------------------------

	private answer(o: string): void {
		const q = this.q!;
		if (this.answered) return;
		if (q.movement) {
			if (this.picked.has(o)) this.picked.delete(o);
			else this.picked.add(o);
			this.render(false);
			return;
		}
		this.choice = o;
		this.answered = true;
		const ok = o === q.answer;
		this.score(ok);
		this.feedback = (ok ? '<b>Correct.</b> ' : `<b>Answer: ${q.answer}.</b> `) + (q.why ?? '');
		this.render(false);
	}

	private check(): void {
		const q = this.q!, prime = q.prime!, assist = q.assist!;
		const missing = prime.filter((p) => !this.picked.has(p));
		const extra = [...this.picked].filter((s) => !prime.includes(s) && !assist.includes(s));
		const ok = !missing.length && !extra.length;
		this.answered = true;
		this.score(ok);
		let fb = ok ? '<b>Correct.</b> ' : '<b>Not quite.</b> ';
		fb += `Prime movers: <b>${prime.join(', ')}</b>. Assisting: ${assist.join(', ')}.`;
		if (missing.length) fb += ` Missed: ${missing.join(', ')}.`;
		if (extra.length) fb += ` Not a mover here: ${extra.join(', ')}.`;
		this.feedback = fb;
		q.reveal = { muscles: [...q.movement!.prime, ...q.movement!.assist] };
		this.render(false);
	}

	private score(ok: boolean): void {
		this.total++;
		if (ok) {
			this.correct++;
			this.streak++;
		} else this.streak = 0;
		this.lastOk = ok;
		$('score').textContent = `${this.correct} / ${this.total}`;
		$('streak').textContent = String(this.streak);
	}

	// ---- rendering ------------------------------------------------------------------------

	private render(fresh: boolean): void {
		const q = this.q;
		if (!q) return;
		this.focus = q.type === 'Identify' ? q.focus ?? null : this.answered ? q.reveal ?? null : null;
		this.ctx.model.setFocus(this.focus);
		if (q.showAxes && this.answered) this.ctx.setAxesVisible(true);

		const multi = !!q.movement;
		let h = `<div><p class="qtype">${q.type}</p><p class="q">${q.text}</p></div><div class="opts">`;
		q.options.forEach((o, i) => {
			let cls = 'opt';
			if (multi) {
				if (this.picked.has(o)) cls += ' picked';
				if (this.answered) {
					if (q.prime!.includes(o)) cls += ' right';
					else if (this.picked.has(o) && !q.assist!.includes(o)) cls += ' wrong';
				}
			} else if (this.answered) {
				if (o === q.answer) cls += ' right';
				else if (o === this.choice) cls += ' wrong';
			}
			const box = multi ? `<span class="box">${this.picked.has(o) ? '✓' : ''}</span>` : '';
			h += `<button class="${cls}" data-i="${i}" ${this.answered ? 'disabled' : ''}>${box}<span>${o}</span></button>`;
		});
		h += '</div>';
		if (this.answered) h += `<div class="fb ${this.lastOk ? 'ok' : 'no'}">${this.feedback}</div>`;
		h += '<div class="row">';
		if (multi && !this.answered) h += '<button class="btn" data-act="replay" style="text-align:center">Replay movement</button><button class="btn primary" data-act="check">Check</button>';
		if (this.answered) h += '<button class="btn primary" data-act="next">Next question</button>';
		h += '</div>';
		this.box.innerHTML = h;

		this.box.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => b.addEventListener('click', () => this.answer(q.options[+b.dataset.i!])));
		this.box.querySelector('[data-act="next"]')?.addEventListener('click', () => this.next());
		this.box.querySelector('[data-act="check"]')?.addEventListener('click', () => this.check());
		this.box.querySelector('[data-act="replay"]')?.addEventListener('click', () => void this.ctx.playMovement(q.movement!));

		if (!fresh) return;
		if (q.movement) void this.ctx.playMovement(q.movement);
		else if (q.type === 'Identify') {
			const p = this.ctx.joint.readablePose?.(this.ctx.model.pose);
			if (p) void this.ctx.animator.to(p, 500);
		}
	}
}
