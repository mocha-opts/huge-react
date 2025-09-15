import ReactDOM from 'react-dom/client';
import { useState } from 'react';

// console.log(import.meta.hot);
function App() {
	const [num, setNum] = useState(100);
	return <div onClick={() => setNum(num + 1)}>{num}</div>;
}
function Child() {
	return <div>children</div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
