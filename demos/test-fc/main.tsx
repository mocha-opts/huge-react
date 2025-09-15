import ReactDOM from 'react-dom/client';
import { useState } from 'react';

// console.log(import.meta.hot);
function App() {
	const [num, setNum] = useState(100);
	const arr =
		num % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
	return <ul onClick={() => setNum(num + 1)}>{arr}</ul>;
}
function Child() {
	return <div>children</div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
