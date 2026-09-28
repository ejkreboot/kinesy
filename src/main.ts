import './styles.css';
import { mountJoint } from './app';
import { elbow } from './joints/elbow';

mountJoint(elbow).catch((err: Error) => {
	const el = document.getElementById('loading');
	if (el) {
		el.hidden = false;
		el.textContent = `The model could not load in this browser (${err.message}). Try a current Chrome, Edge, Safari, or Firefox.`;
	}
	console.error(err);
});
