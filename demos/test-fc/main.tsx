import ReactDOM from 'react-dom/client';
import { useEffect, useState } from 'react';

// console.log(import.meta.hot);
function App() {
	const [num, setNum] = useState(100);
	useEffect(() => {
		console.log('App mount');
	}, []);
	useEffect(() => {
		console.log('num change create', num);

		return () => {
			console.log('num change destroy', num);
		};
	}, [num]);

	const arr =
		num % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
	return (
		<ul
			onClick={() => {
				setNum((num) => num + 1);
			}}
		>
			<>
				<li>1</li>
				<li>2</li>
			</>
			<li>3</li>
			<li>4</li>
			{arr}
			{num === 0 ? <Child /> : 'noop'}
		</ul>
	);
}
function Child() {
	useEffect(() => {
		console.log('	child mount');
		return () => console.log('child unmount');
	}, []);
	return <div>children</div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
