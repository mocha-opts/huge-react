import ReactDOM from 'react-dom/client';
import { useState } from 'react';

console.log(import.meta.hot);
function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;
	return <div>{num}</div>;
}
function Children() {
	return <div>children</div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
