import ReactDOM from 'react-dom/client';
import { useState } from 'react';

console.log(import.meta.hot);
function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	return num == 3 ? <Child></Child> : <div>{num}</div>;
}
function Child() {
	return <div>children</div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
